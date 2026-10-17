import { describe, it, expect } from "vitest";
import { runFeetOf } from "./pricing";
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

describe("drawn footage", () => {
  it("reads the footage of each new line from the drawing, skipping existing utilities", () => {
    const ann = {
      runFeet: 160,
      paths: [run(44.8, -85.5, 80), run(44.9, -85.5, 80), { ...run(44.7, -85.5, 300), type: "existing-power" }],
    } as Pick<MapAnnotation, "paths" | "runFeet">;
    const runs = runFeetOf(ann);
    expect(runs).toHaveLength(2);
    runs.forEach((f) => expect(Math.abs(f - 80)).toBeLessThan(1));
  });

  it("falls back to the saved total for an old drawing with no points", () => {
    expect(runFeetOf({ paths: [], runFeet: 150 })).toEqual([150]);
    expect(runFeetOf(null)).toEqual([]);
  });
});
