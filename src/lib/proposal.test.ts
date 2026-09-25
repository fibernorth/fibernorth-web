import { describe, it, expect } from "vitest";
import { acceptedSaleTotal, customerContentKey, proposalLines, proposalSubject } from "./proposal";
import type { MapAnnotation, QuoteLine } from "@/lib/types";

describe("proposalLines", () => {
  it("keeps a $0 line with a description so it shows as Included, and drops blank rows", () => {
    const lines: QuoteLine[] = [
      { description: "Directional bore, ~150 ft", kind: "work", qty: 1, unitPrice: 4000 },
      { description: "Restoration, topsoil and seed", kind: "work", qty: 1, unitPrice: 0 },
      { description: "  ", kind: "material", qty: 1, unitPrice: 0 },
    ];
    expect(proposalLines(lines).map((l) => l.description)).toEqual(["Directional bore, ~150 ft", "Restoration, topsoil and seed"]);
  });
  it("uses the saved price when no line has one, and refuses when nothing is priced", () => {
    expect(proposalLines([], 3000)).toEqual([{ description: "Directional drilling, per scope", kind: "work", qty: 1, unitPrice: 3000 }]);
    expect(() => proposalLines([{ description: "Included", kind: "work", qty: 1, unitPrice: 0 }], null)).toThrow(/price/);
  });
});

describe("customerContentKey", () => {
  const ann = {
    center: { lat: 44, lng: -85 },
    zoom: 18,
    markers: [],
    paths: [{ type: "bore-path", color: "#f00", points: [{ lat: 44, lng: -85 }, { lat: 44.001, lng: -85 }] }],
    polygons: [],
  } as MapAnnotation;
  const q = { quotedPrice: 4000, quoteLines: null, mapAnnotation: ann, scopeText: "Bore it." };
  it("ignores map panning and zoom", () => {
    expect(customerContentKey({ ...q, mapAnnotation: { ...ann, center: { lat: 45, lng: -86 }, zoom: 12 } })).toBe(customerContentKey(q));
  });
  it("changes with the price, the scope or the drawing", () => {
    expect(customerContentKey({ ...q, quotedPrice: 4100 })).not.toBe(customerContentKey(q));
    expect(customerContentKey({ ...q, scopeText: "Bore it twice." })).not.toBe(customerContentKey(q));
    expect(customerContentKey({ ...q, mapAnnotation: { ...ann, paths: [] } })).not.toBe(customerContentKey(q));
  });
});

describe("acceptedSaleTotal", () => {
  it("adds up every accepted proposal on the lead and skips the rest", () => {
    const t = (total: number) => ({ work: total, materials: 0, tax: 0, total });
    expect(
      acceptedSaleTotal([
        { status: "accepted", totals: t(4000) },
        { status: "accepted", totals: t(2500.5) },
        { status: "superseded", totals: t(9999) },
        { status: "sent", totals: t(1234) },
      ])
    ).toBe(6500.5);
    expect(acceptedSaleTotal([])).toBe(0);
  });
});

describe("proposalSubject", () => {
  it("names the job, the place and the amount", () => {
    expect(proposalSubject({ version: 1, address: "123 Main St, Lake Ann", total: 7072 })).toBe(
      "Your directional drilling quote, 123 Main St, Lake Ann: $7,072.00"
    );
  });
  it("says it is a revision, and which one", () => {
    expect(proposalSubject({ version: 2, address: "123 Main St", total: 7072 })).toBe("Revised quote (v2), 123 Main St: $7,072.00");
  });
  it("falls back to the customer's name, then to nothing", () => {
    expect(proposalSubject({ version: 1, name: "Pat Example", total: 3000 })).toBe("Your directional drilling quote, Pat Example: $3,000.00");
    expect(proposalSubject({ version: 1, total: 3000 })).toBe("Your directional drilling quote: $3,000.00");
  });
});
