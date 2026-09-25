import { describe, it, expect } from "vitest";
import { boreFeetInText, boreLineFor, ratePrice, ratePriceRuns, runFeetOf } from "./pricing";
import type { MapAnnotation } from "@/lib/types";

// About 80 ft of latitude (1 degree is roughly 364,000 ft).
const DEG_80FT = 80 / 364_000;
const run = (lat: number, lng: number, feetNorth: number) => ({
  type: "bore-path",
  color: "#fff",
  points: [
    { lat, lng },
    { lat: lat + (feetNorth / 80) * DEG_80FT, lng },
  ],
});

describe("rate sheet", () => {
  it("prices one run by its length", () => {
    expect(ratePrice(0)).toBe(0);
    expect(ratePrice(80)).toBe(3000);
    expect(ratePrice(160)).toBe(4000);
    expect(ratePrice(260)).toBe(4480);
  });

  it("prices each run on its own and adds them up", () => {
    expect(ratePriceRuns([80, 80])).toBe(6000);
    expect(ratePriceRuns([160])).toBe(4000);
    expect(ratePriceRuns([])).toBe(0);
  });

  it("reads the footage of each new line from the drawing, skipping existing utilities", () => {
    const ann = {
      runFeet: 160,
      paths: [run(44.8, -85.5, 80), run(44.9, -85.5, 80), { ...run(44.7, -85.5, 300), type: "existing-power" }],
    } as Pick<MapAnnotation, "paths" | "runFeet">;
    const runs = runFeetOf(ann);
    expect(runs).toHaveLength(2);
    runs.forEach((f) => expect(Math.abs(f - 80)).toBeLessThan(1));
    expect(ratePriceRuns(runs)).toBe(6000);
  });

  it("falls back to the saved total for an old drawing with no points", () => {
    expect(runFeetOf({ paths: [], runFeet: 150 })).toEqual([150]);
    expect(runFeetOf(null)).toEqual([]);
  });

  it("writes the bore line for the drawing and reads the footage back", () => {
    expect(boreLineFor([150])).toEqual({ description: "Directional bore, ~150 ft", price: 4000, feet: 150 });
    const two = boreLineFor([80, 80], 160);
    expect(two).toEqual({ description: "Directional bore, ~160 ft (2 runs)", price: 6000, feet: 160 });
    expect(boreFeetInText(two.description)).toBe(160);
    expect(boreFeetInText("Directional bore, ~1,250 ft")).toBe(1250);
    expect(boreFeetInText("Hydrovac")).toBeNull();
  });
});
