import { describe, it, expect } from "vitest";
import { ratePrice, rateSheetLines, rateSheetPrice } from "./pricing";

describe("rate sheet", () => {
  it("prices one bore by footage", () => {
    expect(ratePrice(80)).toBe(3000);
    expect(ratePrice(200)).toBe(4000);
    expect(ratePrice(584)).toBe(7072);
    expect(rateSheetPrice([584])).toBe(7072);
  });
  it("adds a flat price for each further bore on the same trip", () => {
    expect(rateSheetPrice([584, 120])).toBe(8072);
    expect(rateSheetPrice([584, 120, 40])).toBe(9072);
    expect(rateSheetPrice([])).toBe(0);
    expect(rateSheetPrice([0, 120])).toBe(4000);
  });
  it("explains the number one bore at a time", () => {
    expect(rateSheetLines([584, 120])).toEqual([
      { description: "Directional bore, ~584 ft", kind: "work", qty: 1, unitPrice: 7072 },
      { description: "Additional bore, same trip, ~120 ft", kind: "work", qty: 1, unitPrice: 1000 },
    ]);
  });
  it("names what goes in each bore when it knows", () => {
    expect(rateSheetLines([{ feet: 584, service: "water" }, { feet: 120, service: "power" }]).map((l) => l.description)).toEqual([
      "Directional bore, water, ~584 ft",
      "Additional bore, same trip, power, ~120 ft",
    ]);
    expect(rateSheetPrice([{ feet: 584, service: "water" }, { feet: 120 }])).toBe(8072);
  });
});
