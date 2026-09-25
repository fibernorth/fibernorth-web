import type { QuoteLine } from "@/lib/types";

// Internal rate sheet (owner, Sept 2026). Standard conditions: pipe 3" or
// smaller, ground not gravel or rock. Never shown to customers.
export function ratePrice(feet: number): number {
  if (feet <= 0) return 0;
  if (feet <= 100) return 3000;
  if (feet <= 200) return 4000;
  return 4000 + Math.round(feet - 200) * 8;
}

/** A second (third...) bore on the same trip: its own line on the map, this much more. */
export const ADDITIONAL_BORE_PRICE = 1000;

const real = (boreFeet: number[]) => boreFeet.filter((f) => Number.isFinite(f) && f >= 1);

/** The rate sheet for every bore on the job: the first by footage, each further bore flat. */
export function rateSheetPrice(boreFeet: number[]): number {
  const bores = real(boreFeet);
  if (!bores.length) return 0;
  return ratePrice(bores[0]) + ADDITIONAL_BORE_PRICE * (bores.length - 1);
}

/** The quote lines behind rateSheetPrice, so the number is explained one bore at a time. */
export function rateSheetLines(boreFeet: number[]): QuoteLine[] {
  const bores = real(boreFeet);
  return bores.map((feet, i) =>
    i === 0
      ? { description: `Directional bore, ~${Math.round(feet)} ft`, kind: "work", qty: 1, unitPrice: ratePrice(feet) }
      : { description: `Additional bore, same trip, ~${Math.round(feet)} ft`, kind: "work", qty: 1, unitPrice: ADDITIONAL_BORE_PRICE }
  );
}
