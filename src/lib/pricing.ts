import { pathFeet } from "@/components/quote/map-v2/helpers";
import type { MapAnnotation } from "@/lib/types";

// Internal rate sheet (owner, Sept 2026). Standard conditions: pipe 3" or
// smaller, ground not gravel or rock. Never shown to customers.
export function ratePrice(feet: number): number {
  if (feet <= 0) return 0;
  if (feet <= 100) return 3000;
  if (feet <= 200) return 4000;
  return 4000 + Math.round(feet - 200) * 8;
}

/**
 * Each bore is its own setup, so the rate sheet prices every run on its own
 * and adds them up. Two 80 ft bores are $3,000 + $3,000, not one 160 ft bore.
 */
export function ratePriceRuns(runs: number[]): number {
  return runs.reduce((sum, feet) => sum + ratePrice(Math.round(feet)), 0);
}

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

/** Marks the work line the workbench filled in from the drawing. */
export const DRAWING_BORE_KEY = "drawing:bore";

/** The bore line the rate sheet suggests for the drawing: wording and price. */
export function boreLineFor(runs: number[], totalFeet?: number): { description: string; price: number; feet: number } {
  const feet = Math.round(totalFeet ?? runs.reduce((s, f) => s + f, 0));
  const price = ratePriceRuns(runs);
  const description =
    feet > 0 ? `Directional bore, ~${feet} ft${runs.length > 1 ? ` (${runs.length} runs)` : ""}` : "Directional bore";
  return { description, price, feet };
}

/** The footage written in a bore line ("Directional bore, ~150 ft"), or null. */
export function boreFeetInText(description: string): number | null {
  const m = /~\s*([\d,]+)\s*ft/i.exec(description || "");
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
