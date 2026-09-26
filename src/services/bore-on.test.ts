// Bore-ON re-price keeps what it replaced, the put-back, and pull-all's
// preview / confirm, against an in-memory Firestore.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FakeDb } from "@/test/fakedb-bulk";

let db: FakeDb;
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakedb-bulk")).fakeFirestoreModule(() => db));

import { makeDb } from "@/test/fakedb-bulk";
import { applyBoreOnReadback, restorePreviousBoreOnPrices } from "@/services/bore-on";
import { pullAllBoreOn } from "@/services/bore-on-pull-all";
import type { BoreOnReadback, BoreOnReadbackResult } from "@/lib/bore-on/types";

const result: BoreOnReadbackResult = {
  boreLengthFt: 260,
  totalPlannedFt: 300,
  pits: { entry: null, exit: null, depthFt: 2.5 },
  depthProfile: null,
  rodCount: 26,
  estimatedDrillTime: null,
  estimate: {
    lines: [{ description: "Bore", quantity: 260, unit: "Foot", rate: 12, total: 3120 }],
    materialLines: [],
    materialTax: 0,
    subtotal: 3120,
    marginAmount: 0,
    contingencyAmount: 0,
    grandTotal: 3120,
    uncovered: [],
  },
  planImageUrl: null,
};
const readback = (updatedAt = "2026-09-25T10:00:00Z", r = result): BoreOnReadback => ({
  designId: "D1",
  url: "https://bore.example/d/D1",
  status: "in-review",
  externalRef: null,
  updatedAt,
  result: r,
});
const oldLines = [{ description: "Directional bore, ~200 ft", kind: "work", qty: 1, unitPrice: 2500, source: "auto", key: "rate-sheet:bore" }];

beforeEach(() => {
  db = makeDb();
  db.put("quoteRequests", "Q1", {
    name: "Ellis",
    leadId: "L1",
    boreOnDesignId: "D1",
    quoteLines: oldLines,
    quotedPrice: 2500,
    status: "quoted",
    contentChangedAt: "2026-09-20T00:00:00Z",
  });
  db.put("leads", "L1", { name: "Ellis", activity: [] });
});

describe("a re-price keeps the old prices and can put them back", () => {
  it("stores previous lines/total and says old → new on the lead", async () => {
    const r = await applyBoreOnReadback(db as any, "Q1", db.get("quoteRequests", "Q1") as any, readback(), {});
    expect(r).toMatchObject({ repriced: true, changed: true, total: 3120, oldTotal: 2500 });
    const q = db.get("quoteRequests", "Q1")!;
    expect(q.quotedPrice).toBe(3120);
    expect(q.previousQuoteLines).toEqual(oldLines);
    expect(q.previousTotal).toBe(2500);
    expect(q.previousRepricedAt).toBe(q.contentChangedAt);
    expect(db.get("leads", "L1")!.activity[0].text).toContain("$2,500.00 → $3,120.00");
  });

  it("puts the previous prices back when the quote wasn't edited since", async () => {
    await applyBoreOnReadback(db as any, "Q1", db.get("quoteRequests", "Q1") as any, readback(), {});
    const r = await restorePreviousBoreOnPrices(db as any, "Q1");
    expect(r).toEqual({ total: 2500, was: 3120 });
    const q = db.get("quoteRequests", "Q1")!;
    expect(q.quoteLines).toEqual(oldLines);
    expect(q.quotedPrice).toBe(2500);
    expect(q.previousQuoteLines).toBeUndefined();
    expect(db.get("leads", "L1")!.activity.at(-1).text).toBe("Bore-ON prices put back: $3,120.00 → $2,500.00");
    await expect(restorePreviousBoreOnPrices(db as any, "Q1")).rejects.toThrow(/no earlier Bore-ON prices/);
  });

  it("refuses once the quote was edited after the re-price", async () => {
    await applyBoreOnReadback(db as any, "Q1", db.get("quoteRequests", "Q1") as any, readback(), {});
    db.put("quoteRequests", "Q1", { ...db.get("quoteRequests", "Q1")!, contentChangedAt: "2099-01-01T00:00:00Z" });
    await expect(restorePreviousBoreOnPrices(db as any, "Q1")).rejects.toThrow(/edited after/);
    expect(db.get("quoteRequests", "Q1")!.quotedPrice).toBe(3120);
  });

  it("an accepted quote is never re-priced or put back", async () => {
    db.put("quoteRequests", "Q1", { ...db.get("quoteRequests", "Q1")!, estimateStatus: "accepted" });
    const r = await applyBoreOnReadback(db as any, "Q1", db.get("quoteRequests", "Q1") as any, readback(), {});
    expect(r.repriced).toBe(false);
    expect(db.get("quoteRequests", "Q1")!.previousQuoteLines).toBeUndefined();
  });
});

describe("pull-all: preview, then confirm", () => {
  let served: BoreOnReadback;
  beforeEach(() => {
    served = readback();
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => served }));
  });
  afterEach(() => vi.unstubAllGlobals());
  const secrets = { baseUrl: "https://bore.example", apiKey: "k" };

  it("the preview lists old → new and writes nothing", async () => {
    const before = structuredClone(db.get("quoteRequests", "Q1"));
    const p = await pullAllBoreOn(db as any, secrets, null);
    expect(p.dryRun).toBe(true);
    expect(p.repricing).toEqual([{ quoteId: "Q1", name: "Ellis", oldTotal: 2500, newTotal: 3120 }]);
    expect(db.get("quoteRequests", "Q1")).toEqual(before);
    expect(db.get("leads", "L1")!.activity).toEqual([]);
  });

  it("applies the previewed prices", async () => {
    const r = await pullAllBoreOn(db as any, secrets, { approved: { Q1: 3120 } });
    expect(r.repricing).toHaveLength(1);
    expect(db.get("quoteRequests", "Q1")!.quotedPrice).toBe(3120);
  });

  it("holds a quote whose new price isn't the one in the preview", async () => {
    served = readback("2026-09-25T11:00:00Z", { ...result, estimate: { ...result.estimate!, lines: [{ ...result.estimate!.lines[0], total: 9000 }] } });
    const r = await pullAllBoreOn(db as any, secrets, { approved: { Q1: 3120 } });
    expect(r.held).toEqual([{ quoteId: "Q1", name: "Ellis", oldTotal: 2500, newTotal: 9000 }]);
    expect(db.get("quoteRequests", "Q1")!.quotedPrice).toBe(2500);
    expect(db.get("quoteRequests", "Q1")!.boreOnUpdatedAt).toBeUndefined();
  });
});
