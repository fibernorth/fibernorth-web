// The design we push to Bore-ON, built from a saved quote. Pure.
//
// Two things Bore-ON needs that the map tool never draws: an entry-pit and an
// exit-pit marker within 25 ft of the bore's ends (without both, Bore-ON keeps
// the bore as an unbilled line and prices no pits), and the bore profile the
// workbench overlay computes (Bore-ON stores it and reads the rod length out
// of it for the rod count).

import { haversineFeet } from "@/components/quote/map-v2/helpers";
import type { MapAnnotation, QuoteRequest } from "@/lib/types";
import { boreProfileFor } from "./profile";
import { externalRefFor } from "./types";

type Point = { lat: number; lng: number };

const validPoint = (p: unknown): p is Point =>
  !!p && typeof p === "object" && Number.isFinite((p as Point).lat) && Number.isFinite((p as Point).lng);

function feetAlong(points: Point[]): { segmentFeet: number[]; totalFeet: number } {
  const segmentFeet: number[] = [];
  for (let i = 1; i < points.length; i++) segmentFeet.push(Math.round(haversineFeet(points[i - 1], points[i])));
  return { segmentFeet, totalFeet: segmentFeet.reduce((s, f) => s + f, 0) };
}

export type QuoteForPush = Pick<QuoteRequest, "name" | "address" | "serviceType" | "description" | "mapAnnotation">;

export function boreOnPayload(quoteId: string, quote: QuoteForPush, nowIso = new Date().toISOString()) {
  const ann: Partial<MapAnnotation> = quote.mapAnnotation ?? {};
  const paths = ann.paths ?? [];
  const service = ann.service || quote.serviceType || "";

  const borePaths = paths
    .filter((p) => (p.type ?? "") === "bore-path")
    .map((p) => (p.points ?? []).filter(validPoint))
    .filter((points) => points.length >= 2)
    .map((points, i) => {
      const measured = feetAlong(points);
      // The first path is the run the tool measured and saved; trust that.
      const saved = i === 0 && ann.runFeet && ann.segmentFeet?.length === measured.segmentFeet.length;
      return {
        id: `bore-${i + 1}`,
        service,
        points,
        segmentFeet: saved ? ann.segmentFeet! : measured.segmentFeet,
        totalFeet: saved ? ann.runFeet! : measured.totalFeet,
      };
    });

  const existingUtilities = paths
    .filter((p) => (p.type ?? "").startsWith("existing-"))
    .map((p) => ({ service: p.type.slice("existing-".length), points: (p.points ?? []).filter(validPoint) }))
    .filter((p) => p.points.length >= 2);

  const markers: Array<{ type: string; position: Point; label?: string }> = (ann.markers ?? [])
    .filter((m) => validPoint(m.position))
    .map((m) => ({ type: m.type, position: m.position, ...(m.label ? { label: m.label } : {}) }));

  // Pits at the ends of every bore, entry on the side the rig sits (the
  // saved drill side is about the first bore; the rest enter at their start).
  borePaths.forEach((bore, i) => {
    const fromEnd = i === 0 && ann.terrain?.drillSide === "end";
    const entry = fromEnd ? bore.points[bore.points.length - 1] : bore.points[0];
    const exit = fromEnd ? bore.points[0] : bore.points[bore.points.length - 1];
    markers.push({ type: "entry-pit", position: entry }, { type: "exit-pit", position: exit });
  });

  const terrain =
    ann.terrain?.dists?.length && ann.terrain.elevs?.length === ann.terrain.dists.length
      ? {
          samples: ann.terrain.dists.length,
          distFt: ann.terrain.dists,
          elevFt: ann.terrain.elevs,
          sourceDatum: "USGS 3DEP 1m, NAVD88 feet",
        }
      : undefined;
  const boreProfile = terrain ? boreProfileFor(ann.terrain, service) : null;

  return {
    specVersion: 1,
    externalRef: externalRefFor(quoteId),
    source: "fibernorth.com",
    createdAt: nowIso,
    job: {
      customerName: quote.name || "",
      address: ann.address || quote.address || "",
      serviceType: service,
      ...(ann.pipeSize ? { pipeSize: ann.pipeSize } : {}),
      ...(quote.description ? { notes: quote.description } : {}),
    },
    map: {
      ...(ann.center ? { center: ann.center, zoom: ann.zoom ?? 18 } : {}),
      borePaths,
      existingUtilities,
      markers,
      labels: (ann.labels ?? []).filter((l) => validPoint(l.position) && l.text),
    },
    ...(terrain ? { terrain } : {}),
    ...(boreProfile ? { boreProfile } : {}),
  };
}

export type BoreOnPayload = ReturnType<typeof boreOnPayload>;
