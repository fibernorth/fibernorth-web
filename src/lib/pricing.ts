import { pathFeet } from "@/components/quote/map-v2/helpers";
import type { MapAnnotation } from "@/lib/types";

/** Footage of each new line drawn on the map (existing utilities don't count). */
export function runFeetOf(annotation: Pick<MapAnnotation, "paths" | "runFeet"> | null | undefined): number[] {
  if (!annotation) return [];
  const runs = (annotation.paths || [])
    .filter((p) => !p.type.startsWith("existing") && (p.points?.length ?? 0) >= 2)
    .map((p) => pathFeet(p.points).total)
    .filter((f) => f > 0);
  if (runs.length) return runs;
  // Legacy drawings with only a total.
  return annotation.runFeet && annotation.runFeet > 0 ? [annotation.runFeet] : [];
}

/**
 * Marks the bore work line the old rate sheet filled in from the drawing.
 * Quotes saved before the price rules (src/lib/quote-rules.ts) still carry it.
 */
export const DRAWING_BORE_KEY = "drawing:bore";
