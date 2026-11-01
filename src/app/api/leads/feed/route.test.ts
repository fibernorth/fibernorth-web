// Tests for the Jarvis lead feed, run against the real route with an
// in-memory Firestore (same harness as the Sheet sync tests).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeDb, ArrayUnion, type FakeDb } from "@/test/fakedb-leads";

let db: FakeDb;
vi.mock("next/server", () => ({
  NextResponse: { json: (body: any, init?: any) => ({ status: init?.status ?? 200, body }) },
}));
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => db,
  FieldValue: { arrayUnion: (...items: unknown[]) => new ArrayUnion(items) },
}));
vi.mock("@/services/firebase-admin", () => ({ initializeAdminApp: () => ({}) }));
const limiter = vi.hoisted(() => ({ hits: new Map<string, number>(), limit: Infinity as number }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async (o: { key: string; limit: number }) => {
    const n = (limiter.hits.get(o.key) ?? 0) + 1;
    limiter.hits.set(o.key, n);
    const limit = Math.min(o.limit, limiter.limit);
    return { limited: n > limit, count: n, remaining: Math.max(0, limit - n), resetAt: 0 };
  },
}));

import { GET, POST } from "@/app/api/leads/feed/route";
import { jarvisExternalId, jarvisLeadId, stageFromFeed, timeFromText } from "@/lib/jarvis-feed";

const SECRET = "jarvis-s3cret";
const H = { "x-jarvis-secret": SECRET, "content-type": "application/json" };

async function post(body: unknown, headers: Record<string, string> = H) {
  const r: any = await POST(
    new Request("http://x/api/leads/feed", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
  return r;
}
async function get(qs: string, headers: Record<string, string> = H) {
  const r: any = await GET(new Request(`http://x/api/leads/feed${qs}`, { headers }));
  return r;
}
const send = async (leads: any[], extra: Record<string, unknown> = {}) => (await post({ leads, ...extra })).body;
const leads = () => db.all("leads") as any[];
const byKey = (key: string) => leads().find((l) => l.externalId === jarvisExternalId(key));
const seed = (id: string, doc: Record<string, unknown>) => db.collection("leads").doc(id).set(doc);

// The first seven leads Jarvis will send.
const FIRST_SEVEN = [
  {
    key: "don-kelly-9325", contact: "Don Kelly", scope: "Directional drilling", amount: 9325, stage: "quoted",
    nextStep: "Waiting on him", source: "phone", notes: "Follow-up sent 11/1",
  },
  {
    key: "mike-hines-son-in-law", contact: "Mike Hines' son-in-law", scope: "200 ft water line", amount: "$3,000",
    stage: "quoted", owner: "Maddy", nextStep: "Send written quote", source: "referral", notes: "About $3,000 quoted by phone",
  },
  {
    key: "mawby-sparkling", company: "Mawby Sparkling", contact: "Nicole Charter", siteAddress: "Suttons Bay, MI",
    scope: "Water lines", amount: 5000, stage: "quoted", owner: "Maddy",
    notes: "Excavator day $1,500; drill and pullback two 2-inch lines $3,000; core drill $500",
  },
  { key: "todd-water-line", contact: "Todd", scope: "Water line", stage: "quoted", nextStep: "Waiting on him", notes: "Quote sent" },
  {
    key: "atlas-tower-roscommon", company: "Atlas Tower Roscommon", contact: "Aaron Sithole", stage: "walk_scheduled",
    nextStep: "Site walk Wed 11/18 9 AM", nextStepDate: "2026-11-18", notes: "We're bidding",
  },
  {
    key: "dan-beyersdorf-bear-lake", contact: "Dan Beyersdorf", scope: "Bear Lake 2-inch water lines", stage: "quoted",
    nextStep: "Waiting on him",
  },
  {
    key: "windemuller-arrowhead", company: "Windemuller", contact: "Kelly Bemiss", job: "Arrowhead", scope: "Arrowhead job",
    amount: 2700, stage: "quoted", nextStep: "Waiting on them", notes: "Quote sent, $2,700 minimum",
  },
];

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T15:00:00.000Z"));
  db = makeDb();
  limiter.hits.clear();
  limiter.limit = Infinity;
  await db.collection("integrationSecrets").doc("jarvisFeed").set({ secret: SECRET });
});
afterEach(() => vi.useRealTimers());

describe("auth and limits", () => {
  it("401s without the secret, with a wrong one, and when none is configured", async () => {
    expect((await post({ leads: FIRST_SEVEN }, { "content-type": "application/json" })).status).toBe(401);
    expect((await post({ leads: FIRST_SEVEN }, { ...H, "x-jarvis-secret": "nope" })).status).toBe(401);
    expect((await get("?since=2026-01-01T00:00:00Z", { "x-jarvis-secret": "nope" })).status).toBe(401);
    expect((await get("?since=2026-01-01T00:00:00Z", {})).status).toBe(401);
    expect(leads()).toHaveLength(0);
    // The bid feed's secret doesn't open this one.
    await db.collection("integrationSecrets").doc("jarvisFeed").set({});
    expect((await post({ leads: FIRST_SEVEN }, { ...H, "x-jarvis-secret": "" })).status).toBe(401);
  });

  it("rate-limits an authorised caller", async () => {
    limiter.limit = 2;
    expect((await get("?since=2026-01-01T00:00:00Z")).status).toBe(200);
    expect((await get("?since=2026-01-01T00:00:00Z")).status).toBe(200);
    expect((await get("?since=2026-01-01T00:00:00Z")).status).toBe(429);
    expect((await post({ leads: FIRST_SEVEN })).status).toBe(429);
  });

  it("rejects bad bodies and more than 50 leads", async () => {
    expect((await post("{nope")).status).toBe(400);
    expect((await post({ leads: [] })).status).toBe(400);
    expect((await post({ leads: [{ company: "x" }] })).status).toBe(400);
    const many = Array.from({ length: 51 }, (_, i) => ({ key: `k-${i}-xx`, contact: `P${i}` }));
    expect((await post({ leads: many })).status).toBe(400);
    expect((await post({ leads: many.slice(0, 50) })).status).toBe(200);
  });
});

describe("the first seven leads import cleanly", () => {
  it("creates each one with the right stage, amount, owner and next step", async () => {
    const res = await send(FIRST_SEVEN);
    expect(res.created).toBe(7);
    expect(res.rejected).toBe(0);
    // 7 leads + the Windemuller contractor account.
    expect(leads()).toHaveLength(8);

    const don = byKey("don-kelly-9325");
    expect(don).toMatchObject({ name: "Don Kelly", stage: "quoted", quotedAmount: 9325, nextAction: "Waiting on him", source: "phone" });
    expect(don.id).toBe(jarvisLeadId("don-kelly-9325"));

    const son = byKey("mike-hines-son-in-law");
    expect(son).toMatchObject({ name: "Mike Hines' son-in-law", quotedAmount: 3000, owner: "Maddy", nextAction: "Send written quote", source: "referral" });

    const mawby = byKey("mawby-sparkling");
    expect(mawby).toMatchObject({ name: "Mawby Sparkling", contactName: "Nicole Charter", address: "Suttons Bay, MI", quotedAmount: 5000, owner: "Maddy" });
    expect(mawby.activity.some((a: any) => a.type === "note" && a.text.includes("core drill $500"))).toBe(true);

    expect(byKey("todd-water-line")).toMatchObject({ name: "Todd", stage: "quoted", nextAction: "Waiting on him" });

    expect(byKey("atlas-tower-roscommon")).toMatchObject({
      name: "Atlas Tower Roscommon", contactName: "Aaron Sithole", stage: "walk_scheduled",
      appointmentAt: "2026-11-18", appointmentTime: "09:00", nextActionAt: "2026-11-18",
    });
    expect(byKey("dan-beyersdorf-bear-lake")).toMatchObject({ name: "Dan Beyersdorf", serviceType: "Bear Lake 2-inch water lines" });
  });

  it("files Windemuller / Arrowhead as a job under a contractor account", async () => {
    const res = await send(FIRST_SEVEN);
    const row = res.results.find((r: any) => r.key === "windemuller-arrowhead");
    expect(row.company).toMatchObject({ created: true });
    const account = leads().find((l) => l.id === row.company.id);
    expect(account).toMatchObject({ name: "Windemuller", isAccount: true, contactName: "Kelly Bemiss" });
    const job = byKey("windemuller-arrowhead");
    expect(job).toMatchObject({ name: "Arrowhead", parentLeadId: account.id, quotedAmount: 2700, stage: "quoted" });

    // A second Windemuller job reuses the account.
    const again = await send([{ key: "windemuller-lake-road", company: "windemuller", contact: "Kelly Bemiss", job: "Lake Road" }]);
    expect(again.results[0].company).toMatchObject({ id: account.id, created: false });
    expect(leads().filter((l) => l.isAccount)).toHaveLength(1);
  });

  it("uses an existing contractor account of the same name instead of making one", async () => {
    await seed("acct1", { name: "Windemuller", isAccount: true, stage: "nurture", phone: "", email: "" });
    const res = await send([FIRST_SEVEN[6]]);
    expect(res.results[0].company).toEqual({ id: "acct1", created: false });
    expect(byKey("windemuller-arrowhead").parentLeadId).toBe("acct1");
    expect(leads()).toHaveLength(2);
  });
});

describe("idempotency", () => {
  it("replaying the same request changes nothing", async () => {
    await send(FIRST_SEVEN);
    const before = JSON.stringify(leads());
    vi.setSystemTime(new Date("2026-11-02T16:00:00.000Z"));
    const res = await send(FIRST_SEVEN);
    expect(res.created).toBe(0);
    expect(res.updated).toBe(0);
    expect(res.unchanged).toBe(7);
    expect(JSON.stringify(leads())).toBe(before);
  });

  it("two overlapping identical requests make one lead", async () => {
    const one = [FIRST_SEVEN[0]];
    const [a, b] = await Promise.all([send(one), send(one)]);
    expect(leads()).toHaveLength(1);
    expect(a.created + b.created).toBe(1);
    expect(leads()[0].activity.filter((x: any) => x.text === "Follow-up sent 11/1")).toHaveLength(1);
  });

  it("the same key twice in one request is one lead", async () => {
    const res = await send([FIRST_SEVEN[0], { ...FIRST_SEVEN[0] }]);
    expect(res.created).toBe(1);
    expect(leads()).toHaveLength(1);
  });
});

describe("matching an existing lead", () => {
  const existing = { name: "Pat Jones", phone: "(231) 555-0123", email: "pat@example.com", stage: "contacted", source: "meta-ads", externalId: "sheet:x", notes: "Bill's note", activity: [], updatedAt: "2026-10-01T00:00:00.000Z" };

  it("matches by phone (format-insensitive) and stamps the key; never renames", async () => {
    await seed("L1", existing);
    const res = await send([{ key: "pat-jones-1", contact: "Patrick J.", phone: "231.555.0123", stage: "quoted", amount: 4000 }]);
    expect(res.results[0]).toMatchObject({ id: "L1", result: "updated", matchedBy: "phone" });
    expect(leads()).toHaveLength(1);
    const l = leads()[0];
    expect(l.name).toBe("Pat Jones");
    expect(l.externalId).toBe("sheet:x");
    expect(l.externalIds).toContain("jarvis:pat-jones-1");
    // Next time it matches on the key alone, even with no phone.
    const again = await send([{ key: "pat-jones-1", contact: "Pat", stage: "quoted" }]);
    expect(again.results[0]).toMatchObject({ id: "L1", result: "unchanged" });
    expect(again.results[0].matchedBy).toBeUndefined();
  });

  it("matches by email when the phone is new", async () => {
    await seed("L1", existing);
    const res = await send([{ key: "pat-2", contact: "Pat", email: "PAT@example.com" }]);
    expect(res.results[0]).toMatchObject({ id: "L1", matchedBy: "email" });
  });

  it("matches an explicit leadId, and by exact name only when no phone or email was sent", async () => {
    await seed("L1", existing);
    expect((await send([{ key: "k-leadid", contact: "Whoever", leadId: "L1" }])).results[0]).toMatchObject({ id: "L1", matchedBy: "leadId" });
    expect((await send([{ key: "k-name", contact: "pat  jones" }])).results[0]).toMatchObject({ id: "L1", matchedBy: "name" });
    // A different phone means a different person, whatever the name.
    const other = await send([{ key: "k-other", contact: "Pat Jones", phone: "906-555-9999" }]);
    expect(other.results[0].result).toBe("created");
    expect(leads()).toHaveLength(2);
  });

  it("makes a new lead when the match is ambiguous or private", async () => {
    await seed("A", { ...existing, name: "A" });
    await seed("B", { ...existing, name: "B", externalId: "sheet:y" });
    expect((await send([{ key: "k-amb", contact: "X", phone: "2315550123" }])).results[0].result).toBe("created");
    await seed("P", { name: "Private Person", phone: "989-555-0100", stage: "new", private: true, activity: [] });
    expect((await send([{ key: "k-priv", contact: "Private Person", phone: "989-555-0100", notes: "hi" }])).results[0].result).toBe("created");
    expect(leads().find((l) => l.id === "P").activity).toHaveLength(0);
  });

  it("a person is never matched to a contractor account by phone, and a job only to its own company", async () => {
    await seed("ACCT", { name: "Windemuller", isAccount: true, phone: "231-555-0111", stage: "nurture", activity: [] });
    const res = await send([{ key: "kb-1", contact: "Kelly Bemiss", phone: "231-555-0111", scope: "Different person" }]);
    expect(res.results[0].result).toBe("created");
    await seed("J", { name: "Arrowhead", parentLeadId: "OTHER", phone: "231-555-0222", stage: "new", activity: [] });
    const job = await send([{ key: "kb-2", company: "Windemuller", job: "Arrowhead", phone: "231-555-0222" }]);
    expect(job.results[0].result).toBe("created");
  });
});

describe("stage rules", () => {
  const start = (stage: string) => seed("S", { name: "Stage Test", stage, phone: "231-555-0100", externalId: "jarvis:stage-test", activity: [], updatedAt: "2026-10-01T00:00:00.000Z" });
  const ask = (stage: string, extra: Record<string, unknown> = {}, body: Record<string, unknown> = {}) =>
    send([{ key: "stage-test", contact: "Stage Test", phone: "231-555-0100", stage, ...extra }], body);

  it("moves forward and logs it via Jarvis", async () => {
    await start("contacted");
    const res = await ask("quoted");
    expect(res.results[0].changed).toContain("stage");
    const l = leads()[0];
    expect(l.stage).toBe("quoted");
    expect(l.activity.find((a: any) => a.type === "stage")).toMatchObject({ via: "jarvis", text: "Moved to Quoted (via Jarvis)" });
  });

  it("never moves backward, and says so", async () => {
    await start("quoted");
    const res = await ask("contacted");
    expect(res.results[0].result).toBe("unchanged");
    expect(res.results[0].held).toMatch(/step back/);
    expect(leads()[0].stage).toBe("quoted");
  });

  it("moves backward only with force", async () => {
    await start("quoted");
    await ask("contacted", {}, { force: true });
    expect(leads()[0].stage).toBe("contacted");
  });

  it("lets a Long term lead move to an active stage, but not the other way", async () => {
    await start("nurture");
    await ask("quoted");
    expect(leads()[0].stage).toBe("quoted");
    await ask("nurture");
    expect(leads()[0].stage).toBe("quoted");
  });

  it("a closed lead stays closed unless forced; closing clears the next action", async () => {
    await start("quoted");
    await db.collection("leads").doc("S").update({ nextAction: "Check back", nextActionAt: "2026-11-05" });
    await ask("won", { amount: 3200 });
    let l = leads()[0];
    expect(l).toMatchObject({ stage: "won", nextAction: "", nextActionAt: "", saleAmount: "$3,200", saleAmountNum: 3200 });
    await ask("quoted");
    expect(leads()[0].stage).toBe("won");
    await ask("quoted", {}, { force: true });
    l = leads()[0];
    expect(l.stage).toBe("quoted");
  });

  it("rejects a stage it doesn't know, without touching the lead or the rest of the batch", async () => {
    await start("contacted");
    const res = await send([
      { key: "stage-test", contact: "Stage Test", phone: "231-555-0100", stage: "hot!!" },
      { key: "fine-lead", contact: "Fine" },
    ]);
    expect(res.results[0]).toMatchObject({ result: "rejected", reason: 'Unknown stage "hot!!"' });
    expect(res.results[1].result).toBe("created");
    expect(leads().find((l) => l.id === "S").stage).toBe("contacted");
  });

  it("rejects an unreadable amount", async () => {
    const res = await send([{ key: "bad-amount", contact: "X", amount: "lots" }]);
    expect(res.results[0].result).toBe("rejected");
    expect(leads()).toHaveLength(0);
  });
});

describe("what Jarvis may and may not change", () => {
  it("appends notes to the history, marked via Jarvis, and leaves Bill's notes alone", async () => {
    await seed("L", { name: "Pat", phone: "231-555-0123", stage: "contacted", notes: "Bill's note", sourceNotes: "firm note", activity: [{ ts: "2026-10-01T00:00:00.000Z", type: "note", text: "old" }], updatedAt: "2026-10-01T00:00:00.000Z" });
    await send([{ key: "pat-k", contact: "Pat", phone: "231-555-0123", notes: "Sent follow-up 11/1" }]);
    const l = leads()[0];
    expect(l.notes).toBe("Bill's note");
    expect(l.sourceNotes).toBe("firm note");
    expect(l.activity.map((a: any) => a.text)).toEqual(expect.arrayContaining(["old", "Sent follow-up 11/1"]));
    expect(l.activity.find((a: any) => a.text === "Sent follow-up 11/1")).toMatchObject({ via: "jarvis", type: "note" });
    // A new note adds another line; the old ones stay.
    await send([{ key: "pat-k", contact: "Pat", phone: "231-555-0123", notes: "He called back" }]);
    expect(leads()[0].activity.filter((a: any) => a.via === "jarvis" && a.type === "note")).toHaveLength(2);
  });

  it("fills blanks but never overwrites what is already there", async () => {
    await seed("L", { name: "Pat", phone: "231-555-0123", email: "", address: "1 Main St", serviceType: "Power", stage: "new", activity: [] });
    await send([{ key: "pat-k", contact: "Pat", phone: "231-555-0123", email: "pat@x.com", siteAddress: "99 Other Rd", scope: "Water" }]);
    expect(leads()[0]).toMatchObject({ email: "pat@x.com", address: "1 Main St", serviceType: "Power", name: "Pat" });
  });

  it("owns amount, owner and next step, and logs the change", async () => {
    await seed("L", { name: "Pat", phone: "231-555-0123", stage: "quoted", quotedAmount: 3000, owner: "Bill", nextAction: "Check back", nextActionAt: "2026-11-05", activity: [] });
    await send([{ key: "pat-k", contact: "Pat", phone: "231-555-0123", amount: 3500, owner: "Maddy", nextStep: "Call Friday", nextStepDate: "2026-11-06" }]);
    const l = leads()[0];
    expect(l).toMatchObject({ quotedAmount: 3500, owner: "Maddy", nextAction: "Call Friday", nextActionAt: "2026-11-06" });
    const line = l.activity.find((a: any) => a.via === "jarvis" && a.type === "system");
    expect(line.text).toMatch(/Jarvis updated: amount \$3,500; owner Maddy; next step "Call Friday"/);
  });

  it("does not touch the Sheet sync's fields or ping anything", async () => {
    await seed("L", { name: "Pat", phone: "231-555-0123", stage: "contacted", touched: false, sheetSeen: { a: "1" }, sheetOwned: { notes: { value: "n", at: "x" } }, activity: [] });
    await send([{ key: "pat-k", contact: "Pat", phone: "231-555-0123", stage: "quoted" }]);
    const l = leads()[0];
    expect(l.touched).toBe(false);
    expect(l.sheetSeen).toEqual({ a: "1" });
    expect(l.sheetOwned).toEqual({ notes: { value: "n", at: "x" } });
  });
});

describe("GET /api/leads/feed", () => {
  it("returns leads changed since a time, with company and job for jobs", async () => {
    await send(FIRST_SEVEN);
    await seed("OLD", { name: "Old Lead", stage: "new", updatedAt: "2026-01-01T00:00:00.000Z", activity: [] });
    await seed("PRIV", { name: "Secret", stage: "new", private: true, updatedAt: "2026-11-02T15:00:00.000Z", activity: [] });
    const res = await get("?since=2026-11-01T00:00:00Z");
    expect(res.status).toBe(200);
    expect(res.body.truncated).toBe(false);
    const names = res.body.leads.map((r: any) => r.key || r.company);
    expect(names).not.toContain("Old Lead");
    expect(res.body.leads.some((r: any) => r.contact === "Secret")).toBe(false);
    const don = res.body.leads.find((r: any) => r.key === "don-kelly-9325");
    expect(don).toEqual({
      id: jarvisLeadId("don-kelly-9325"), key: "don-kelly-9325", company: "", contact: "Don Kelly", job: "", stage: "quoted",
      owner: "", nextStep: "Waiting on him", nextStepDate: "", amount: 9325, updatedAt: "2026-11-02T15:00:00.000Z",
    });
    const job = res.body.leads.find((r: any) => r.key === "windemuller-arrowhead");
    expect(job).toMatchObject({ company: "Windemuller", contact: "Kelly Bemiss", job: "Arrowhead", amount: 2700 });
    const mawby = res.body.leads.find((r: any) => r.key === "mawby-sparkling");
    expect(mawby).toMatchObject({ company: "Mawby Sparkling", contact: "Nicole Charter", owner: "Maddy" });
  });

  it("is strictly after `since`, and requires it", async () => {
    await send([FIRST_SEVEN[0]]);
    expect((await get("?since=2026-11-02T15:00:00.000Z")).body.leads).toHaveLength(0);
    expect((await get("?since=2026-11-02T14:59:59.000Z")).body.leads).toHaveLength(1);
    expect((await get("")).status).toBe(400);
    expect((await get("?since=yesterday")).status).toBe(400);
  });
});

describe("helpers", () => {
  it("maps stage words onto the pipeline stages", () => {
    expect(stageFromFeed("quoted")).toBe("quoted");
    expect(stageFromFeed("Quote Sent")).toBe("quoted");
    expect(stageFromFeed("walk-scheduled")).toBe("walk_scheduled");
    expect(stageFromFeed("long term")).toBe("nurture");
    expect(stageFromFeed("nonsense")).toBeNull();
    expect(stageFromFeed("")).toBeNull();
  });
  it("reads a time out of a next step", () => {
    expect(timeFromText("Site walk Wed 11/18 9 AM")).toBe("09:00");
    expect(timeFromText("walk 2:30pm")).toBe("14:30");
    expect(timeFromText("12 am")).toBe("00:00");
    expect(timeFromText("Call back")).toBe("");
  });
});
