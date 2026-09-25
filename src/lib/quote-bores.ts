// The bores on a quote, one record each: what goes in, what size, how long,
// and its own ground profile. Pure.
//
// Newer annotations keep these on each bore-path entry. Older ones (one bore)
// kept service, pipe size, terrain and footage at the top level; those read
// as a single bore, so nothing saved before this needs touching.

import type { MapAnnotation } from "@/lib/types";

export type BoreTerrain = NonNullable<MapAnnotation["terrain"]>;

export interface QuoteBore {
  /** 0-based, in drawing order. */
  index: number;
  service: string;
  pipeSize: string;
  feet: number;
  points: Array<{ lat: number; lng: number }>;
  terrain: BoreTerrain | null;
}

const feetOf = (points: QuoteBore["points"], saved?: number): number => {
  if (typeof saved === "number" && Number.isFinite(saved) && saved > 0) return Math.round(saved);
  return points.length >= 2 ? 0 : 0;
};

export function boresFromAnnotation(ann: Partial<MapAnnotation> | null | undefined): QuoteBore[] {
  if (!ann) return [];
  const paths = (ann.paths ?? []).filter((p) => (p.type ?? "") === "bore-path" && (p.points?.length ?? 0) >= 2);
  return paths.map((p, i) => ({
    index: i,
    service: p.service ?? (i === 0 ? ann.service || "" : ""),
    pipeSize: p.pipeSize ?? (i === 0 ? ann.pipeSize || "not-sure" : "not-sure"),
    feet: feetOf(p.points, p.feet ?? ann.boreFeet?.[i] ?? (i === 0 && paths.length === 1 ? ann.runFeet : undefined)),
    points: p.points,
    terrain: p.terrain ?? (i === 0 ? ann.terrain ?? null : null),
  }));
}

/** "Water" / "Power", or "" when nothing was picked. */
export function boreServiceName(service: string, names: Record<string, string>): string {
  return service ? names[service] ?? service.replace(/-/g, " ") : "";
}
