import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FakeDb } from "@/test/fakedb";

let db: FakeDb;
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakedb")).fakeFirestoreModule(() => db));
vi.mock("@/services/firebase-admin", () => ({ initializeAdminApp: () => ({}) }));
vi.mock("@/lib/server-action-auth", () => ({
  verifyServerActionCaller: async () => ({ uid: "u1", email: "bill@fibernorth.com", owner: true }),
  verifyOwnerCaller: async () => ({ uid: "u1", email: "bill@fibernorth.com", owner: true }),
}));

import { mergeLeads, previewLeadMerge } from "@/actions/leads";
import { findDuplicates, mergedStage } from "@/lib/lead-merge";
import type { Lead } from "@/lib/leads";

beforeEach(async () => {
  db = (await import("@/test/fakedb")).makeDb();
  // Meta ads lead from the sheet, and the same person's website quote lead.
  db.put("leads", "sheet_abc", {
    name: "Stephen Fortin",
    phone: "(518) 209-1158",
    email: "",
    source: "meta-ads",
    externalId: "sheet:2026-09-20|10:00|5182091158",
    externalIds: ["sheet:2026-09-20|10:00|5182091158"],
    stage: "contacted",
    lastContactAt: "2026-09-28",
    createdAt: "2026-09-20T14:00:00.000Z",
    activity: [{ ts: "2026-09-20T14:00:00.000Z", type: "system", text: "From the sheet" }],
  });
  db.put("leads", "W1", {
    name: "Steve Fortin",
    phone: "518-209-1158",
    email: "fcw_bucky@msn.com",
    address: "12 Pine St",
    source: "website",
    externalId: "quote:Q1",
    quoteId: "Q1",
    stage: "new",
    createdAt: "2026-09-25T14:00:00.000Z",
    activity: [{ ts: "2026-09-25T14:00:00.000Z", type: "system", text: "Quote request from the website" }],
  });
  db.put("quoteRequests", "Q1", { leadId: "W1", name: "Steve Fortin", estimateStatus: "draft", version: 0, createdAt: "2026-09-25T14:00:00.000Z" });
  db.put("proposals", "T1", { leadId: "W1", quoteId: "Q1" });
});

describe("merging two leads for the same person", () => {
  it("finds them by phone however it's written", () => {
    const leads = [...db.data.leads.entries()].map(([id, d]) => ({ id, ...(d as object) }) as Lead);
    expect(findDuplicates(leads).get("W1")).toEqual([{ id: "sheet_abc", name: "Stephen Fortin", by: "phone" }]);
  });

  it("keeps the sheet lead, fills blanks, moves the quote and proposal, keeps every key, trashes the other", async () => {
    const p = await previewLeadMerge("W1", "sheet_abc", "t");
    expect(p).toMatchObject({ keepId: "sheet_abc", dropId: "W1", quotes: 1, email: "fcw_bucky@msn.com" });
    const r = await mergeLeads("W1", "sheet_abc", "t");
    expect(r).toEqual({ ok: true, keepId: "sheet_abc" });
    const kept = db.get("leads", "sheet_abc")!;
    expect(kept).toMatchObject({ name: "Stephen Fortin", email: "fcw_bucky@msn.com", address: "12 Pine St", stage: "contacted" });
    expect(kept.externalIds).toEqual(expect.arrayContaining(["sheet:2026-09-20|10:00|5182091158", "quote:Q1"]));
    expect((kept.activity as Array<{ text: string }>).map((a) => a.text)).toEqual(
      expect.arrayContaining(["From the sheet", "Quote request from the website", expect.stringMatching(/^Merged with Steve Fortin/)])
    );
    expect(db.get("quoteRequests", "Q1")!.leadId).toBe("sheet_abc");
    expect(db.get("proposals", "T1")!.leadId).toBe("sheet_abc");
    expect(db.get("leads", "W1")).toBeUndefined();
    expect(db.get("trash", "leads__W1")).toBeTruthy();
  });

  it("an open stage beats a closed copy; won beats all", () => {
    expect(mergedStage("lost", "quoted")).toBe("quoted");
    expect(mergedStage("contacted", "won")).toBe("won");
    expect(mergedStage("new", "walk_done")).toBe("walk_done");
  });

  it("a contractor and its jobs, or a pair marked not the same, aren't offered", () => {
    const leads = [
      { id: "C", name: "Wojan", phone: "2316756258", stage: "new" },
      { id: "J", name: "Wojan: 400 S", phone: "2316756258", parentLeadId: "C", stage: "new" },
      { id: "X", name: "Other", email: "a@b.com", stage: "new", notDuplicateOf: ["Y"] },
      { id: "Y", name: "Other2", email: "a@b.com", stage: "new" },
    ] as unknown as Lead[];
    expect(findDuplicates(leads).size).toBe(0);
  });
});
