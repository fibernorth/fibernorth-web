import { describe, it, expect } from "vitest";
import { quoteLinesFromReadback, repriceNote } from "./reprice";
import type { BoreOnReadbackResult } from "./types";
import type { QuoteLine } from "@/lib/types";

const base: BoreOnReadbackResult = {
  boreLengthFt: 260,
  totalPlannedFt: 300,
  pits: { entry: null, exit: null, depthFt: 2.5 },
  depthProfile: null,
  rodCount: 26,
  estimatedDrillTime: null,
  estimate: null,
  planImageUrl: null,
};
const priced: BoreOnReadbackResult = {
  ...base,
  estimate: {
    lines: [{ description: 'Bore 1.25" HDPE', quantity: 260, unit: "Foot", rate: 12, total: 3120 }],
    materialLines: [{ description: "1.25in HDPE", quantity: 300, unit: "Foot", rate: 1.5, total: 450 }],
    materialTax: 27,
    subtotal: 3597,
    marginAmount: 312,
    contingencyAmount: 0,
    grandTotal: 3936,
    uncovered: [{ label: "PIT", quantity: 2, unit: "each" }],
  },
};

describe("quoteLinesFromReadback", () => {
  it("copies the designer's priced lines, margin and contingency as auto lines, and names what was not priced", () => {
    const r = quoteLinesFromReadback(priced);
    expect(r?.source).toBe("bore-on");
    expect(r?.lines).toEqual([
      { description: 'Bore 1.25" HDPE (260 Foot)', kind: "work", qty: 1, unitPrice: 3120, source: "auto", key: "bore-on:work:0" },
      { description: "1.25in HDPE (300 Foot)", kind: "material", qty: 1, unitPrice: 450, source: "auto", key: "bore-on:material:0" },
      { description: "Margin", kind: "work", qty: 1, unitPrice: 312, source: "auto", key: "bore-on:margin" },
    ]);
    expect(r?.uncovered).toEqual(["PIT × 2 each"]);
  });

  it("keeps the estimator's own lines and replaces only the generated ones on a re-sync", () => {
    const current: QuoteLine[] = [
      { description: "Extra pit", kind: "work", qty: 1, unitPrice: 400 },
      { description: "Old auto", kind: "work", qty: 1, unitPrice: 999, source: "auto", key: "bore-on:work:0" },
      { description: "Hydrovac", kind: "work", qty: 2, unitPrice: 250, source: "manual" },
    ];
    const r = quoteLinesFromReadback(base, current);
    expect(r?.lines.map((l) => l.description)).toEqual(["Extra pit", "Hydrovac", "Directional bore, ~260 ft"]);
    expect(r?.autoLines).toHaveLength(1);
  });

  it("falls back to our rate sheet on the bore length when Bore-ON had no rate card", () => {
    const r = quoteLinesFromReadback(base);
    expect(r?.source).toBe("rate-sheet");
    expect(r?.lines).toEqual([
      { description: "Directional bore, ~260 ft", kind: "work", qty: 1, unitPrice: 4480, source: "auto", key: "rate-sheet:bore" },
    ]);
    expect(r?.uncovered).toEqual([]);
  });

  it("has nothing to say about a design with no bore and no price", () => {
    expect(quoteLinesFromReadback({ ...base, boreLengthFt: 0 })).toBeNull();
    expect(quoteLinesFromReadback(null)).toBeNull();
    expect(quoteLinesFromReadback({ ...base, boreLengthFt: 0, estimate: { lines: [], materialLines: [], materialTax: 0, subtotal: 0, marginAmount: 0, contingencyAmount: 0, grandTotal: 0, uncovered: [] } })).toBeNull();
  });

  it("writes a note that says where the number came from", () => {
    expect(repriceNote({ source: "bore-on" }, 3936)).toBe("Re-priced from the Bore-ON design: $3,936.00");
    expect(repriceNote({ source: "rate-sheet" }, 4480)).toContain("rate sheet");
  });
});

describe("quoteLinesFromReadback: no double counting", () => {
  it("leaves out an auto line whose key the estimator already holds", () => {
    const current: QuoteLine[] = [
      { description: 'Bore 1.25" HDPE (260 Foot)', kind: "work", qty: 1, unitPrice: 3000, source: "manual", key: "bore-on:work:0" },
    ];
    const r = quoteLinesFromReadback(priced, current);
    expect(r?.lines.filter((l) => l.key === "bore-on:work:0")).toHaveLength(1);
    expect(r?.lines.find((l) => l.key === "bore-on:work:0")?.unitPrice).toBe(3000);
    expect(r?.lines.map((l) => l.key)).toEqual(["bore-on:work:0", "bore-on:material:0", "bore-on:margin"]);
    expect(r?.skipped).toEqual(['Bore 1.25" HDPE (260 Foot)']);
  });

  it("keeps the estimator's edited rate-sheet bore line instead of adding the auto one back", () => {
    const current: QuoteLine[] = [
      { description: "Directional bore, ~150 ft", kind: "work", qty: 1, unitPrice: 3800, source: "manual", key: "rate-sheet:bore" },
    ];
    const r = quoteLinesFromReadback({ ...base, boreLengthFt: 150 }, current);
    expect(r?.lines).toEqual(current);
    expect(r?.autoLines).toEqual([]);
  });

  it("does not add a rate-sheet bore when a work line from the drawing already prices the bore", () => {
    const current: QuoteLine[] = [
      { description: "Directional bore, ~150 ft", kind: "work", qty: 1, unitPrice: 4000, key: "drawing:bore" },
      { description: "Conduit", kind: "material", qty: 150, unitPrice: 2 },
    ];
    const r = quoteLinesFromReadback({ ...base, boreLengthFt: 150 }, current);
    expect(r?.lines).toEqual(current);
    expect(repriceNote(r!, 4318)).toContain("already cover");
  });

  it("does not add a rate-sheet bore when a hand-typed work line says bore", () => {
    const current: QuoteLine[] = [{ description: "Bore under driveway", kind: "work", qty: 1, unitPrice: 2500 }];
    expect(quoteLinesFromReadback(base, current)?.lines).toEqual(current);
  });

  it("still replaces an old auto rate-sheet line with the new one", () => {
    const current: QuoteLine[] = [
      { description: "Hydrovac", kind: "work", qty: 1, unitPrice: 500 },
      { description: "Directional bore, ~100 ft", kind: "work", qty: 1, unitPrice: 3000, source: "auto", key: "rate-sheet:bore" },
    ];
    const r = quoteLinesFromReadback(base, current);
    expect(r?.lines.map((l) => [l.description, l.unitPrice])).toEqual([
      ["Hydrovac", 500],
      ["Directional bore, ~260 ft", 4480],
    ]);
  });
});
