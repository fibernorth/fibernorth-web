// The one-time quote record repair, against an in-memory Firestore.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FakeDb } from "@/test/fakedb";

let db: FakeDb;
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakedb")).fakeFirestoreModule(() => db));
vi.mock("@/services/firebase-admin", () => ({ initializeAdminApp: () => ({}) }));
vi.mock("@/lib/server-action-auth", () => ({ verifyServerActionCaller: async () => ({ uid: "u1", email: "bill@fibernorth.com" }) }));

import { makeDb } from "@/test/fakedb";
import { repairQuoteRecords } from "@/actions/repair";
import { addDays, todayISO } from "@/lib/leads";

const future = `${addDays(todayISO(), 20)}T12:00:00.000Z`;

describe("repairQuoteRecords", () => {
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

  it("previews without writing", async () => {
    const r = await repairQuoteRecords(false, "t");
    expect(r.quotesLinked).toBe(1);
    expect(r.sentTotalsFilled).toBe(1);
    expect(r.badgesFixed).toBeGreaterThanOrEqual(1);
    expect(db.get("quoteRequests", "C")?.leadId).toBeUndefined();
    expect(db.get("leads", "L1")?.quote.status).toBe("draft");
  });

  it("applies: badge shows the open sent quote at the price the customer got", async () => {
    await repairQuoteRecords(true, "t");
    expect(db.get("quoteRequests", "C")?.leadId).toBe("L2");
    expect(db.get("quoteRequests", "A")?.sentTotal).toBe(4000);
    const lead = db.get("leads", "L1")!;
    expect(lead.quote.quoteId).toBe("A");
    expect(lead.quote.status).toBe("sent");
    expect(lead.quoteCount).toBe(2);
    // Running again finds nothing left to fix.
    const again = await repairQuoteRecords(false, "t");
    expect(again.quotesLinked + again.sentTotalsFilled + again.badgesFixed).toBe(0);
  });
});
