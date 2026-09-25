import { describe, it, expect } from "vitest";
import { boreOnPayload } from "./payload";
import type { MapAnnotation } from "@/lib/types";

const a = { lat: 44.7631, lng: -85.3935 };
const b = { lat: 44.7641, lng: -85.3935 };
const base: MapAnnotation = {
  center: a,
  zoom: 18,
  markers: [{ type: "well", position: a, label: "Well" }],
  paths: [
    { type: "bore-path", points: [a, b], color: "#fff" },
    { type: "existing-power", points: [a, b], color: "#f00" },
    { type: "existing-gas", points: [a], color: "#f00" },
  ],
  polygons: [],
  labels: [{ position: a, text: "Gate" }, { position: a, text: "" }],
  terrain: { dists: [0, 100, 200, 300, 364], elevs: [600, 601, 602, 601, 600] },
  runFeet: 364,
  segmentFeet: [364],
  service: "internet",
  pipeSize: '1"',
  address: "1 Main St",
};
const quote = { name: "Pat", address: "2 Other St", serviceType: "water", description: "Under the drive", mapAnnotation: base };

describe("boreOnPayload", () => {
  const p = boreOnPayload("q1", quote, "2026-09-25T12:00:00.000Z");

  it("keys the design to the quote and nests the map the way Bore-ON expects", () => {
    expect(p.externalRef).toBe("fibernorth:quote:q1");
    expect(p.specVersion).toBe(1);
    expect(p.createdAt).toBe("2026-09-25T12:00:00.000Z");
    expect(p.map.center).toEqual(a);
    expect(p.job).toEqual({ customerName: "Pat", address: "1 Main St", serviceType: "internet", pipeSize: '1"', notes: "Under the drive" });
  });

  it("puts an entry pit and an exit pit at the bore's ends so Bore-ON bills them", () => {
    const pits = p.map.markers.filter((m) => m.type.endsWith("-pit"));
    expect(pits).toEqual([
      { type: "entry-pit", position: a },
      { type: "exit-pit", position: b },
    ]);
    // The customer's own markers ride along.
    expect(p.map.markers[0]).toEqual({ type: "well", position: a, label: "Well" });
  });

  it("swaps the pits when the rig sits at the far end", () => {
    const q = { ...quote, mapAnnotation: { ...base, terrain: { ...base.terrain!, drillSide: "end" as const } } };
    const pits = boreOnPayload("q1", q).map.markers.filter((m) => m.type.endsWith("-pit"));
    expect(pits[0]).toEqual({ type: "entry-pit", position: b });
    expect(pits[1]).toEqual({ type: "exit-pit", position: a });
  });

  it("gives every bore its own pits and its own footage", () => {
    const c = { lat: 44.7651, lng: -85.3945 };
    const d = { lat: 44.7651, lng: -85.3955 };
    const q = { ...quote, mapAnnotation: { ...base, paths: [...base.paths, { type: "bore-path", points: [c, d], color: "#fff" }], boreFeet: [364, 260] } };
    const out = boreOnPayload("q1", q);
    expect(out.map.borePaths.map((b) => b.id)).toEqual(["bore-1", "bore-2"]);
    expect(out.map.borePaths[1].totalFeet).toBeGreaterThan(200);
    const pits = out.map.markers.filter((m) => m.type.endsWith("-pit"));
    expect(pits).toEqual([
      { type: "entry-pit", position: a },
      { type: "exit-pit", position: b },
      { type: "entry-pit", position: c },
      { type: "exit-pit", position: d },
    ]);
  });

  it("uses the saved footage for the drawn run and sends the terrain and bore profile", () => {
    expect(p.map.borePaths).toHaveLength(1);
    expect(p.map.borePaths[0].totalFeet).toBe(364);
    expect(p.map.borePaths[0].segmentFeet).toEqual([364]);
    expect(p.terrain).toEqual({ samples: 5, distFt: base.terrain!.dists, elevFt: base.terrain!.elevs, sourceDatum: "USGS 3DEP 1m, NAVD88 feet" });
    expect(p.boreProfile?.drill.rodFt).toBe(6);
    expect(p.boreProfile?.minCoverFt).toBe(2);
  });

  it("measures a path the tool did not save footage for", () => {
    const q = { ...quote, mapAnnotation: { ...base, runFeet: undefined, segmentFeet: undefined } };
    const bp = boreOnPayload("q1", q).map.borePaths[0];
    expect(bp.totalFeet).toBeGreaterThan(350);
    expect(bp.totalFeet).toBeLessThan(380);
    expect(bp.segmentFeet).toEqual([bp.totalFeet]);
  });

  it("keeps existing utilities as context and drops one-point lines and empty labels", () => {
    expect(p.map.existingUtilities).toEqual([{ service: "power", points: [a, b] }]);
    expect(p.map.labels).toEqual([{ position: a, text: "Gate" }]);
  });

  it("sends no bore, no pits and no profile when nothing is drawn", () => {
    const q = { ...quote, mapAnnotation: null };
    const e = boreOnPayload("q2", q);
    expect(e.map.borePaths).toEqual([]);
    expect(e.map.markers).toEqual([]);
    expect(e.terrain).toBeUndefined();
    expect(e.boreProfile).toBeUndefined();
    expect(e.job.serviceType).toBe("water");
    expect(e.job.address).toBe("2 Other St");
  });
});
