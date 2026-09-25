// Bore-path math along the terrain profile. Pure: no React, no DOM, so the
// same numbers drive the workbench overlay (terrain-profile.tsx) and the
// boreProfile block we push to Bore-ON.

import { haversineFeet, type LatLngLit } from "@/components/quote/map-v2/helpers";
import type { MapAnnotation } from "@/lib/types";

export interface Sample {
  dist: number; // feet from start
  elev: number; // feet above sea level
}

export type DrillSide = "start" | "end";

export interface Drill {
  id: string;
  label: string;
  entryPct: number;
  ratePctPerFt: number;
  rodFt: number;
}

// Owner's rig specs (Sept 2026): entry pitch in percent grade, steering rate
// in percent pitch change per foot pushed, rod length (entry pitch is held
// for exactly one rod before steering starts). Entry/exit pits 2.5 ft.
export const PIT_DEPTH = 2.5;
export const DRILLS: Drill[] = [
  { id: "10x15", label: "D10x15", entryPct: 30, ratePctPerFt: 10 / 6, rodFt: 6 },
  { id: "20x22", label: "D20x22", entryPct: 25, ratePctPerFt: 10 / 10, rodFt: 10 },
  { id: "23x30", label: "D23x30", entryPct: 25, ratePctPerFt: 10 / 10, rodFt: 10 },
];

export function drillById(id?: string): Drill {
  return DRILLS.find((d) => d.id === id) ?? DRILLS[0];
}

// Required cover below the ground surface (owner): water and sewer run 5 ft
// or deeper, everything else 2 ft. Unknown service gets the safe 5 ft.
export function coverFor(service?: string): number {
  if (service === "water" || service === "septic") return 5;
  if (service && service in { power: 1, gas: 1, internet: 1, drainage: 1 }) return 2;
  return 5;
}

/**
 * Shallowest bore for a rig, computed in DEPTH-BELOW-GRADE space so the path
 * tracks the terrain the way the drill actually behaves — pitch and steering
 * are relative to the ground the rig sits on, so a steep hillside doesn't
 * read as an impossible climb. From the drill side: hold the entry pitch for
 * one rod (depth grows at `a` per foot), steer off it no faster than `r`,
 * hold the required cover through the middle, and close the last stretch at
 * up to `a` relative so the bore lands in the far 2.5 ft pit — there is no
 * mirrored dive at the exit end. `fromEnd` flips which end the drill is on.
 * Null when the run is too short to get in and back out at all.
 */
export function borePath(
  samples: Sample[],
  entryPct: number,
  ratePctPerFt: number,
  rodFt: number,
  coverFt: number,
  fromEnd: boolean
): { elevs: number[]; deepest: number } | null {
  const L = samples[samples.length - 1].dist;
  const a = entryPct / 100;
  const r = ratePctPerFt / 100;
  const swing = (2 * a) / r; // footage to steer from +a (deepening) to -a (rising)

  // Minimum achievable depth at x feet past the drill-side pit: forced one-rod
  // dive, then steer shallow as fast as the rig allows.
  const minDepth = (x: number): number => {
    if (x <= rodFt) return PIT_DEPTH + a * x;
    const u = x - rodFt;
    if (u < swing) return PIT_DEPTH + a * rodFt + a * u - (r * u * u) / 2;
    return PIT_DEPTH + a * rodFt - a * (u - swing);
  };

  const depthAt = (x: number, sx: number): number =>
    Math.min(
      Math.max(minDepth(x), coverFt), // entry geometry, then required cover
      PIT_DEPTH + a * x, // can't be deeper than a continuous dive from the pit
      PIT_DEPTH + a * sx // must be able to close to the far pit at <= a relative
    );

  const depths = samples.map((s) => {
    const x = fromEnd ? L - s.dist : s.dist;
    return depthAt(x, L - x);
  });

  // Too short: the forced entry dive can't shallow back out by the far pit.
  for (const s of samples) {
    const x = fromEnd ? L - s.dist : s.dist;
    if (minDepth(x) > PIT_DEPTH + a * (L - x) + 0.01) return null;
  }

  const elevs = samples.map((s, i) => s.elev - depths[i]);
  return { elevs, deepest: Math.min(...elevs) };
}

/** Walk the polyline and emit evenly spaced sample coordinates. */
export function samplePath(points: LatLngLit[], maxSamples: number): Array<{ p: LatLngLit; dist: number }> {
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversineFeet(points[i - 1], points[i]);
    segs.push(d);
    total += d;
  }
  if (total <= 0) return [];
  const step = Math.max(total / (maxSamples - 1), 5);
  const out: Array<{ p: LatLngLit; dist: number }> = [{ p: points[0], dist: 0 }];
  let target = step;
  let walked = 0;
  for (let i = 0; i < segs.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    while (target <= walked + segs[i] && out.length < maxSamples - 1) {
      const t = (target - walked) / segs[i];
      out.push({
        p: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
        dist: target,
      });
      target += step;
    }
    walked += segs[i];
  }
  out.push({ p: points[points.length - 1], dist: total });
  return out;
}

/** The `boreProfile` block Bore-ON stores with the design (its import API spec). */
export interface BoreOnBoreProfile {
  /** Depth below grade at each terrain sample, feet. Empty when not feasible. */
  pathDepthFt: number[];
  minCoverFt: number;
  pitDepthFt: number;
  drill: { model: string; entryPitchPct: number; steeringPctPer10Ft: number; rodFt: number };
  drillSide: DrillSide;
  /** Far-end ground minus drill-end ground, feet. */
  endElevationDeltaFt: number;
  feasible: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The bore profile for a saved terrain sample set, with the rig and side the
 * admin picked on the workbench (defaults: the first rig, drilling from the
 * start). Null when there is no usable terrain.
 */
export function boreProfileFor(
  terrain: NonNullable<MapAnnotation["terrain"]> | null | undefined,
  service?: string
): BoreOnBoreProfile | null {
  if (!terrain || !terrain.dists?.length || terrain.dists.length !== terrain.elevs?.length) return null;
  if (terrain.dists.length < 2) return null;
  const samples: Sample[] = terrain.dists.map((dist, i) => ({ dist, elev: terrain.elevs[i] }));
  const drill = drillById(terrain.drillId);
  const drillSide: DrillSide = terrain.drillSide === "end" ? "end" : "start";
  const coverFt = coverFor(service);
  const bore = borePath(samples, drill.entryPct, drill.ratePctPerFt, drill.rodFt, coverFt, drillSide === "end");
  const first = samples[0].elev;
  const last = samples[samples.length - 1].elev;
  return {
    pathDepthFt: bore ? samples.map((s, i) => round1(s.elev - bore.elevs[i])) : [],
    minCoverFt: coverFt,
    pitDepthFt: PIT_DEPTH,
    drill: {
      model: drill.label,
      entryPitchPct: drill.entryPct,
      steeringPctPer10Ft: round1(drill.ratePctPerFt * 10),
      rodFt: drill.rodFt,
    },
    drillSide,
    endElevationDeltaFt: round1(drillSide === "end" ? first - last : last - first),
    feasible: bore !== null,
  };
}
