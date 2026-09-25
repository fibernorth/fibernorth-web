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

/** A bore as the rate sheet sees it: its footage and, for the line's wording, what goes in it. */
export interface RateSheetBore {
  feet: number;
  service?: string;
}

const real = (bores: Array<number | RateSheetBore>): RateSheetBore[] =>
  bores
    .map((b) => (typeof b === "number" ? { feet: b } : b))
    .filter((b) => Number.isFinite(b.feet) && b.feet >= 1);

/** The rate sheet for every bore on the job: the first by footage, each further bore flat. */
export function rateSheetPrice(bores: Array<number | RateSheetBore>): number {
  const list = real(bores);
  if (!list.length) return 0;
  return ratePrice(list[0].feet) + ADDITIONAL_BORE_PRICE * (list.length - 1);
}

const named = (service?: string) => {
  const s = (service || "").replace(/-/g, " ").trim().toLowerCase();
  return s ? `, ${s}` : "";
};

/** The quote lines behind rateSheetPrice, so the number is explained one bore at a time. */
export function rateSheetLines(bores: Array<number | RateSheetBore>): QuoteLine[] {
  return real(bores).map((b, i) =>
    i === 0
      ? { description: `Directional bore${named(b.service)}, ~${Math.round(b.feet)} ft`, kind: "work", qty: 1, unitPrice: ratePrice(b.feet) }
      : { description: `Additional bore, same trip${named(b.service)}, ~${Math.round(b.feet)} ft`, kind: "work", qty: 1, unitPrice: ADDITIONAL_BORE_PRICE }
  );
}
