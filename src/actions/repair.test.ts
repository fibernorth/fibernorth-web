// The one-time quote record repair (check, then apply the stored plan), against an in-memory Firestore.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FakeDb } from "@/test/fakedb";

let db: FakeDb;
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakedb")).fakeFirestoreModule(() => db));
vi.mock("@/services/firebase-admin", () => ({ initializeAdminApp: () => ({}) }));
vi.mock("@/lib/server-action-auth", () => ({ verifyServerActionCaller: async () => ({ uid: "u1", email: "bill@fibernorth.com" }) }));

import { makeDb } from "@/test/fakedb";
import { applyRepair, previewRepair } from "@/actions/repair";
import { addDays, todayISO } from "@/lib/leads";

const future = `${addDays(todayISO(), 20)}T12:00:00.000Z`;

describe("quote record repair", () => {
  beforeEach(() => {
    db = makeDb();
    // Site A sent and still open; site B a fresh draft that clobbered the badge.
    db.put("leads", "L1", { name: "Ellis", quoteId: "B", quote: { status: "draft", total: null, version: 0 }, quoteCount: 2 });
    db.put("quoteRequests", "A", { leadId: "L1", version: 1, estimateStatus: "sent", proposalId: "P1", quotedPrice: 5200, sentAt: future, expiresAt: future, createdAt: "2026-09-01T00:00:00Z" });
    db.put("quoteRequests", "B", { leadId: "L1", version: 0, estimateStatus: "draft", createdAt: "2026-09-10T00:00:00Z" });
    db.put("proposals", "P1", { quoteId: "A", version: 1, totals: { work: 4000, materials: 0, tax: 0, total: 4000 } });
    // Old website import: the lead points at the quote, the quote has no leadId.
    db.put("leads", "L2", { name: "Keson", quoteId: "C", externalId: "quote:C" });
    db.put("quoteRequests", "C", { version: 0, estimateStatus: "draft", createdAt: "2026-09-02T00:00:00Z" });
  });

  it("previews without writing to the records, and stores the plan", async () => {
    const r = await previewRepair("t");
    expect(r.quotesLinked).toBe(1);
    expect(r.sentTotalsFilled).toBe(1);
    expect(r.badgesFixed).toBeGreaterThanOrEqual(1);
    expect(r.changes.length).toBe(r.quotesLinked + r.sentTotalsFilled + r.badgesFixed);
    expect(db.get("quoteRequests", "C")?.leadId).toBeUndefined();
    expect(db.get("leads", "L1")?.quote.status).toBe("draft");
    const plan = db.get("repairRuns", r.planId)!;
    expect(plan.status).toBe("preview");
    expect(plan.by).toBe("bill@fibernorth.com");
    expect(plan.changes.find((c: any) => c.kind === "link")).toMatchObject({ before: { leadId: null }, after: { leadId: "L2" } });
  });

  it("applies the plan: badge shows the open sent quote at the price the customer got", async () => {
    const { planId } = await previewRepair("t");
    const r = await applyRepair(planId, "t");
    expect(r.skipped).toEqual([]);
    expect(db.get("quoteRequests", "C")?.leadId).toBe("L2");
    expect(db.get("quoteRequests", "A")?.sentTotal).toBe(4000);
    const lead = db.get("leads", "L1")!;
    expect(lead.quote.quoteId).toBe("A");
    expect(lead.quote.status).toBe("sent");
    expect(lead.quoteCount).toBe(2);
    expect(db.get("repairRuns", planId)).toMatchObject({ status: "applied", applied: r.applied });
    // Running again finds nothing left to fix, and the old plan can't be applied twice.
    const again = await previewRepair("t");
    expect(again.changes).toHaveLength(0);
    await expect(applyRepair(planId, "t")).rejects.toThrow(/already applied/);
  });

  it("applies exactly the previewed set and skips docs changed since", async () => {
    const { planId } = await previewRepair("t");
    // Someone links quote C by hand after the check; a new broken quote appears too.
    db.put("quoteRequests", "C", { ...db.get("quoteRequests", "C"), leadId: "L9" });
    db.put("leads", "L3", { name: "New", quoteId: "D", externalId: "quote:D" });
    db.put("quoteRequests", "D", { version: 0, estimateStatus: "draft", createdAt: "2026-09-03T00:00:00Z" });
    const r = await applyRepair(planId, "t");
    expect(r.skipped).toEqual([{ label: "Quote C linked to lead Keson", reason: "changed since the check" }]);
    expect(db.get("quoteRequests", "C")?.leadId).toBe("L9");
    expect(db.get("quoteRequests", "D")?.leadId).toBeUndefined(); // not in the plan
    expect(db.get("repairRuns", planId)!.skipped).toHaveLength(1);
  });
});
