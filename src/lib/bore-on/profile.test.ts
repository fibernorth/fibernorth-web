import { describe, it, expect } from "vitest";
import { borePath, boreProfileFor, coverFor, DRILLS, PIT_DEPTH, samplePath } from "./profile";

const flat = (len: number, step = 10) => {
  const dists: number[] = [];
  const elevs: number[] = [];
  for (let d = 0; d <= len; d += step) {
    dists.push(d);
    elevs.push(600);
  }
  return { dists, elevs };
};

describe("coverFor", () => {
  it("keeps water and sewer at 5 ft, dry utilities at 2 ft, unknown at the safe 5 ft", () => {
    expect(coverFor("water")).toBe(5);
    expect(coverFor("septic")).toBe(5);
    expect(coverFor("power")).toBe(2);
    expect(coverFor("internet")).toBe(2);
    expect(coverFor(undefined)).toBe(5);
    expect(coverFor("mystery")).toBe(5);
  });
});

describe("borePath", () => {
  const d = DRILLS[0];
  it("starts and ends in the pits and holds the required cover through the middle", () => {
    const t = flat(200);
    const samples = t.dists.map((dist, i) => ({ dist, elev: t.elevs[i] }));
    const bore = borePath(samples, d.entryPct, d.ratePctPerFt, d.rodFt, 5, false);
    expect(bore).not.toBeNull();
    expect(600 - bore!.elevs[0]).toBeCloseTo(PIT_DEPTH, 5);
    expect(600 - bore!.elevs[samples.length - 1]).toBeCloseTo(PIT_DEPTH, 5);
    const mid = 600 - bore!.elevs[10];
    expect(mid).toBeGreaterThanOrEqual(5);
  });
  it("is null when the run is too short to get in and back out", () => {
    const samples = [
      { dist: 0, elev: 600 },
      { dist: 4, elev: 600 },
      { dist: 8, elev: 600 },
    ];
    expect(borePath(samples, d.entryPct, d.ratePctPerFt, d.rodFt, 5, false)).toBeNull();
  });
});

describe("samplePath", () => {
  it("walks the line from the first point to the last", () => {
    const pts = [
      { lat: 44.7631, lng: -85.3935 },
      { lat: 44.7641, lng: -85.3935 },
    ];
    const out = samplePath(pts, 10);
    expect(out[0]).toEqual({ p: pts[0], dist: 0 });
    expect(out[out.length - 1].p).toEqual(pts[1]);
    expect(out[out.length - 1].dist).toBeGreaterThan(300);
    expect(out.length).toBeLessThanOrEqual(10);
  });
});

describe("boreProfileFor", () => {
  it("describes the rig, the pits and the depth at every sample, in feet", () => {
    const p = boreProfileFor({ ...flat(200), drillId: "20x22", drillSide: "end" }, "power");
    expect(p).not.toBeNull();
    expect(p!.drill).toEqual({ model: "D20x22", entryPitchPct: 25, steeringPctPer10Ft: 10, rodFt: 10 });
    expect(p!.drillSide).toBe("end");
    expect(p!.pitDepthFt).toBe(PIT_DEPTH);
    expect(p!.minCoverFt).toBe(2);
    expect(p!.pathDepthFt).toHaveLength(21);
    // Drilling from the far end: the last sample is the entry pit.
    expect(p!.pathDepthFt[20]).toBe(PIT_DEPTH);
    expect(p!.feasible).toBe(true);
    expect(p!.endElevationDeltaFt).toBe(0);
  });
  it("defaults to the first rig from the start, and says so when the run is not feasible", () => {
    const p = boreProfileFor({ dists: [0, 4, 8], elevs: [600, 601, 602] }, "water");
    expect(p!.drill.model).toBe(DRILLS[0].label);
    expect(p!.drillSide).toBe("start");
    expect(p!.feasible).toBe(false);
    expect(p!.pathDepthFt).toEqual([]);
    expect(p!.endElevationDeltaFt).toBe(2);
  });
  it("is null without usable terrain", () => {
    expect(boreProfileFor(null)).toBeNull();
    expect(boreProfileFor({ dists: [0], elevs: [600] })).toBeNull();
    expect(boreProfileFor({ dists: [0, 10], elevs: [600] })).toBeNull();
  });
});
