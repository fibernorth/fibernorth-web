// Regression tests for the Google Sheet lead sync, run against the real
// route with an in-memory Firestore. Ported from the Sept 26 2026 data audit
// (sync.test.ts there asserted the old, wrong behaviour).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeDb, ArrayUnion, type FakeDb } from "@/test/fakedb";

let db: FakeDb;
const slack = vi.hoisted(() => ({ sent: [] as string[], delay: 0 }));
vi.mock("next/server", () => ({
  NextResponse: { json: (body: any, init?: any) => ({ status: init?.status ?? 200, body }) },
}));
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => db,
  FieldValue: { arrayUnion: (...items: unknown[]) => new ArrayUnion(items) },
}));
vi.mock("@/services/firebase-admin", () => ({ initializeAdminApp: () => ({}) }));
vi.mock("@/services/notifications", () => ({
  sendLeadSlack: async (d: { name: string }) => {
    await new Promise((r) => setTimeout(r, slack.delay));
    slack.sent.push(d.name);
  },
}));

import { POST } from "@/app/api/leads/sync/route";
import { sheetExternalId, sheetRowKey } from "@/lib/leads";

const SECRET = "s3cret-value";
const base = {
  date: "9/20/2026", time: "10:15 AM", adSet: "", creative: "", serviceType: "Water line", isOwner: "Yes",
  name: "Pat Jones", phone: "231-555-0123", email: "pat@example.com", notes: "",
  answered: "", booked: "", taken: "", converted: "", objection: "", cash: "", sale: "",
};
type Row = typeof base & { key?: string };

/** What the NEW script sends: each row carries its key. */
const withKey = (r: Row) => ({ ...r, key: sheetRowKey(r) });

async function post(body: Record<string, unknown>) {
  const req = new Request("http://x/api/leads/sync", {
    method: "POST",
    headers: { "x-sync-secret": SECRET, "content-type": "application/json" },
    body: JSON.stringify({ source: "meta-ads", ...body }),
  });
  const r: any = await POST(req);
  return r.body;
}
const sync = (rows: Row[]) => post({ rows: rows.map(withKey) });
const leads = () => db.all("leads") as any[];
async function billLogs(id: string, type: string, text: string, ts: string, extra: Record<string, unknown> = {}) {
  const ref = db.collection("leads").doc(id);
  await ref.update({ activity: new ArrayUnion([{ ts, type, text }]), touched: true, ...extra });
}
/** The script wrote these cells: report them the way the new script does. */
async function confirm(key: string, set: Record<string, string>, at = new Date().toISOString()) {
  return post({ rows: [], applied: Object.entries(set).map(([col, value]) => ({ key, col, value, at })) });
}

beforeEach(async () => {
  // The sheet row comes in on Sept 20; Bill's logs in these tests come later.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-20T18:00:00.000Z"));
  db = makeDb();
  slack.sent = [];
  slack.delay = 0;
  await db.collection("integrationSecrets").doc("leadsSync").set({ secret: SECRET });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the firm's notes are never lost (data #1, #8)", () => {
  it("imports the original note into the history and keeps it after later notes", async () => {
    const N0 = "Wants water line to barn, ~300ft, call after 5pm";
    await sync([{ ...base, notes: N0 }]);
    const [lead] = leads();
    expect(lead.sourceNotes).toBe(N0);
    expect(lead.activity).toContainEqual(expect.objectContaining({ type: "note", via: "sheet", text: N0 }));
    await billLogs(lead.id, "call", "Talked, walk next week", "2026-09-21T14:00:00.000Z");
    const r1 = await sync([{ ...base, notes: N0 }]);
    expect(r1.results[0].set.notes).toBe("9/21 Call: Talked, walk next week");
    // The script writes it, then the firm types a new note over it.
    await sync([{ ...base, notes: r1.results[0].set.notes }]);
    await sync([{ ...base, notes: "Firm: customer called us back" }]);
    const after = leads()[0];
    const texts = after.activity.map((a: any) => a.text);
    expect(texts).toContain(N0);
    expect(texts).toContain("Firm: customer called us back");
    // Our own write-back text was not re-imported as a firm note.
    expect(after.activity.filter((a: any) => a.via === "sheet").map((a: any) => a.text)).toEqual([
      N0,
      "Firm: customer called us back",
    ]);
  });

  it("backfills a note older syncs kept only in sourceNotes", async () => {
    await db.collection("leads").doc("old1").set({
      name: "Pat Jones", phone: "231-555-0123", email: "", source: "meta-ads", stage: "new",
      externalId: sheetExternalId(base.date, base.time, base.phone), sourceNotes: "Original firm note",
      activity: [{ ts: "2026-09-20T15:00:00.000Z", type: "system", text: "Imported from the Meta ads lead sheet" }],
      touched: false, createdAt: "2026-09-20T15:00:00.000Z",
    });
    await sync([{ ...base, notes: "Original firm note" }]);
    const lead = leads()[0];
    expect(lead.activity).toContainEqual({ ts: "2026-09-20T15:00:00.000Z", type: "note", text: "Original firm note", via: "sheet" });
    await sync([{ ...base, notes: "Original firm note" }]);
    expect(leads()[0].activity.filter((a: any) => a.text === "Original firm note")).toHaveLength(1);
  });

  it("never writes a long firm note back cut short, and keeps it whole", async () => {
    await sync([{ ...base }]);
    const [lead] = leads();
    await billLogs(lead.id, "call", "Talked", "2026-09-21T14:00:00.000Z");
    await sync([{ ...base }]);
    const long = "L".repeat(1500);
    vi.setSystemTime(new Date("2026-09-22T12:00:00.000Z")); // the firm types it after Bill's call
    const r = await sync([{ ...base, notes: long }]);
    expect(r.results[0].set?.notes).toBeUndefined();
    expect(leads()[0].activity).toContainEqual(expect.objectContaining({ via: "sheet", text: long }));
  });
});

describe("stable row matching (data #2)", () => {
  it("fixing a phone typo or reformatting the Date column keeps one lead", async () => {
    await sync([{ ...base, phone: "231-555-012" }]);
    await sync([{ ...base, phone: "231-555-0123" }]);
    expect(leads()).toHaveLength(1);
    await sync([{ ...base, date: "2026-09-20" }]);
    expect(leads()).toHaveLength(1);
    const lead = leads()[0];
    expect(lead.externalIds).toEqual(
      expect.arrayContaining([
        "sheet:9/20/2026|10:15 AM|231555012",
        "sheet:9/20/2026|10:15 AM|2315550123",
        "sheet:2026-09-20|10:15 AM|2315550123",
      ])
    );
    // Untouched: the firm's corrected phone wins.
    expect(lead.phone).toBe("231-555-0123");
    expect(slack.sent).toEqual(["Pat Jones"]);
  });

  it("a second submission while the first row is still on the sheet is its own lead", async () => {
    await sync([{ ...base }, { ...base, time: "3:00 PM" }]);
    expect(leads()).toHaveLength(2);
    await sync([{ ...base }, { ...base, time: "3:00 PM" }]);
    expect(leads()).toHaveLength(2);
  });

  it("two people with no phone at the same date/time are both imported", async () => {
    const r = await sync([
      { ...base, phone: "", name: "Alice", email: "a@x.com" },
      { ...base, phone: "", name: "Bob", email: "b@x.com" },
    ]);
    expect(leads().map((l) => l.name).sort()).toEqual(["Alice", "Bob"]);
    expect(r.results.some((x: any) => x.duplicate)).toBe(false);
  });

  it("with no phone or email, the name keeps rows apart and matches them again", async () => {
    await sync([{ ...base, phone: "", email: "", name: "Carl" }, { ...base, phone: "", email: "", name: "Dana" }]);
    await sync([{ ...base, phone: "", email: "", name: "Carl" }, { ...base, phone: "", email: "", name: "Dana" }]);
    expect(leads()).toHaveLength(2);
  });

  it("creation is idempotent: overlapping requests make one lead", async () => {
    await Promise.all([sync([{ ...base }]), sync([{ ...base }])]);
    expect(leads()).toHaveLength(1);
    expect(leads()[0].id).toMatch(/^sheet_[0-9a-f]{24}$/);
  });

  it("an older script (no row key) still gets results keyed by date|time|phone", async () => {
    await sync([{ ...base }]);
    await billLogs(leads()[0].id, "call", "Talked", "2026-09-21T14:00:00.000Z");
    const { key: _drop, ...legacy } = withKey(base);
    void _drop;
    const r = await post({ rows: [legacy] });
    expect(r.results[0].externalId).toBe(sheetExternalId(base.date, base.time, base.phone));
    expect(r.results[0].writeBack).toBe("yes");
  });
});

describe("'Sheet updated' only for cells the script wrote (data #9)", () => {
  it("logs once per confirmed write, nothing for a cell the sheet refused", async () => {
    await sync([{ ...base }]);
    const [lead] = leads();
    await db.collection("leads").doc(lead.id).update({ appointmentAt: "2026-09-30" });
    await billLogs(lead.id, "call", "Talked", "2026-09-21T14:00:00.000Z");
    const r1 = await sync([{ ...base }]);
    expect(r1.results[0].set).toMatchObject({ booked: "Yes", answered: "Yes", notes: "9/21 Call: Talked" });
    // Nothing logged until the script reports back.
    expect(leads()[0].activity.some((a: any) => /Sheet updated/.test(a.text))).toBe(false);
    expect(leads()[0].sheetNoteWritten).toBeUndefined();
    // The Booked dropdown refused "Yes": the script reports only notes + answered.
    const key = sheetRowKey(base);
    const at = "2026-09-21T15:00:00.000Z";
    await confirm(key, { notes: "9/21 Call: Talked", answered: "Yes" }, at);
    await confirm(key, { notes: "9/21 Call: Talked", answered: "Yes" }, at); // resent: no second line
    await billLogs(lead.id, "text", "Sent address", "2026-09-22T14:00:00.000Z");
    await sync([{ ...base, notes: "9/21 Call: Talked", answered: "Yes" }]);
    const after = leads()[0];
    const lines = after.activity.filter((a: any) => /Sheet updated/.test(a.text)).map((a: any) => a.text);
    expect(lines).toEqual(["Sheet updated: NOTES → 9/21 Call: Talked, Lead Answered → Yes"]);
    expect(after.sheetNoteWritten).toBe("9/21 Call: Talked");
    expect(after.sheetOwned.answered).toEqual({ value: "Yes", at });
  });
});

describe("backward corrections only in cells we own (status #2)", () => {
  async function wonLead() {
    await sync([{ ...base }]);
    const [lead] = leads();
    await billLogs(lead.id, "call", "Talked", "2026-09-21T14:00:00.000Z", { stage: "won", saleAmount: "4250.00", saleAmountNum: 4250 });
    const r = await sync([{ ...base }]);
    // Won with no walk on record: Booked "No", Taken left alone.
    expect(r.results[0].set).toEqual({ answered: "Yes", booked: "No", converted: "Yes", sale: "4250.00", notes: "9/21 Call: Talked" });
    return lead.id;
  }

  it("undoing an acceptance clears Converted=Yes that we wrote", async () => {
    const id = await wonLead();
    await confirm(sheetRowKey(base), { converted: "Yes", sale: "$4,250.00", answered: "Yes", booked: "No", notes: "9/21 Call: Talked" }, "2026-09-21T15:00:00.000Z");
    await db.collection("leads").doc(id).update({ stage: "quoted", saleAmount: "", saleAmountNum: null });
    const row = { ...base, converted: "Yes", sale: "$4,250.00", answered: "Yes", booked: "No", notes: "9/21 Call: Talked" };
    const r = await sync([row]);
    expect(r.results[0].set).toEqual({ converted: "", sale: "" });
  });

  it("a sale shown with the sheet's currency format is not rewritten every run", async () => {
    await wonLead();
    await confirm(sheetRowKey(base), { converted: "Yes", sale: "$4,250.00", answered: "Yes", booked: "No", notes: "9/21 Call: Talked" }, "2026-09-21T15:00:00.000Z");
    const row = { ...base, converted: "Yes", sale: "$4,250.00", answered: "Yes", booked: "No", notes: "9/21 Call: Talked" };
    const r = await sync([row]);
    expect(r.results[0].writeBack).toBe("no");
  });

  it("a Converted=Yes the firm typed is never lowered", async () => {
    await sync([{ ...base }]);
    const [lead] = leads();
    await billLogs(lead.id, "call", "Talked", "2026-09-21T14:00:00.000Z", { stage: "quoted" });
    const r = await sync([{ ...base, converted: "Yes", sale: "$5,000", answered: "Yes" }]);
    expect(r.results[0].set?.converted).toBeUndefined();
    expect(r.results[0].set?.sale).toBeUndefined();
  });

  it("Long term -> lost reaches the sheet when we wrote Long term", async () => {
    await sync([{ ...base }]);
    const [lead] = leads();
    await billLogs(lead.id, "call", "Talked", "2026-09-21T14:00:00.000Z", { stage: "nurture" });
    const r1 = await sync([{ ...base }]);
    expect(r1.results[0].set.converted).toBe("Long Term Follow Up");
    await confirm(sheetRowKey(base), { converted: "Long Term Follow Up" }, "2026-09-21T15:00:00.000Z");
    await db.collection("leads").doc(lead.id).update({ stage: "lost" });
    const r2 = await sync([{ ...base, converted: "Long Term Follow Up" }]);
    expect(r2.results[0].set.converted).toBe("No");
  });
});

describe("Booked / Taken from the walk, not the stage (data #7)", () => {
  it("a quote sent to someone nobody met doesn't write Booked/Taken = Yes", async () => {
    await sync([{ ...base }]);
    const [lead] = leads();
    await billLogs(lead.id, "quote", "Quote v1 sent to pat@example.com: $3,000.00", "2026-09-21T14:00:00.000Z", { stage: "quoted" });
    const r = await sync([{ ...base }]);
    expect(r.results[0].set.booked).toBe("No");
    expect(r.results[0].set.taken).toBeUndefined();
  });
});

describe("imports (status #11, #12, won date, Slack)", () => {
  it("mid-pipeline rows are on today's list", async () => {
    await sync([{ ...base, answered: "Yes", booked: "Yes", taken: "Yes" }]);
    const [lead] = leads();
    expect(lead.stage).toBe("walk_done");
    expect(lead.nextAction).toBe("Check back");
    expect(lead.nextActionAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("an older import stuck mid-pipeline with no next action is put on today's list", async () => {
    await db.collection("leads").doc("old2").set({
      name: "Pat Jones", phone: "231-555-0123", email: "", source: "meta-ads", stage: "walk_done",
      externalId: sheetRowKey(base), nextAction: "", nextActionAt: "", activity: [], touched: false,
      createdAt: "2026-09-01T15:00:00.000Z",
    });
    await sync([{ ...base, answered: "Yes", booked: "Yes", taken: "Yes" }]);
    expect(leads()[0]).toMatchObject({ stage: "walk_done", nextAction: "Check back", nextActionAt: "2026-09-20" });
  });

  it("an untouched lead follows the firm's columns forward, never back", async () => {
    await sync([{ ...base }]);
    await sync([{ ...base, answered: "Yes", converted: "Yes", sale: "$4,000" }]);
    let lead = leads()[0];
    expect(lead.stage).toBe("won");
    expect(lead.saleAmountNum).toBe(4000);
    expect(lead.activity).toContainEqual(expect.objectContaining({ type: "stage", text: "Moved to Won (from the sheet)" }));
    await sync([{ ...base, answered: "Yes" }]);
    lead = leads()[0];
    expect(lead.stage).toBe("won");
  });

  it("'Not interested' imports as lost, 'Spam' as not a lead", async () => {
    await sync([{ ...base, converted: "Not interested" }, { ...base, time: "1:00 PM", phone: "231-555-0999", converted: "Spam" }]);
    const byPhone = Object.fromEntries(leads().map((l) => [l.phone, l]));
    expect(byPhone["231-555-0123"].stage).toBe("lost");
    expect(byPhone["231-555-0999"].stage).toBe("not_a_lead");
    expect(byPhone["231-555-0999"].disqualifyReason).toBe("spam");
  });

  it("a row already won gets a Moved to Won line dated from the row", async () => {
    await sync([{ ...base, converted: "Yes" }]);
    const won = leads()[0].activity.find((a: any) => a.type === "stage");
    expect(won).toEqual({ ts: "2026-09-20T16:00:00.000Z", type: "stage", text: "Moved to Won (from the sheet)" });
  });

  it("awaits the Slack ping before answering", async () => {
    slack.delay = 20;
    await sync([{ ...base }]);
    expect(slack.sent).toEqual(["Pat Jones"]);
  });
});
