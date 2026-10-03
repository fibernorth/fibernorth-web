// How a printout is corrected when the browser or printer does not print at
// true size.
//
// A printed card is drawn in inches, but the print dialog (fit to page, scale,
// phone printing) decides what comes out. The app cannot see that, so it prints
// a test box, the person measures it, and this works out the correction. It is
// kept on the device and applied only to what is printed: it is never part of a
// card, its number or its team code.

export const MIN_SCALE = 50;
export const MAX_SCALE = 200;

/** A printer scale in percent, kept in range. Anything that is not a number is 100. */
export function clampScale(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(n * 10) / 10));
}

/**
 * The scale that makes a printout the size it should be.
 *
 * `measured` is what the printed test box measured while `current` was set, so
 * the answer corrects the print that was measured, not the card itself. An
 * unusable measurement leaves the scale as it was.
 */
export function scaleFromMeasure(expectedIn: number, measuredIn: number, current: number): number {
  const c = clampScale(current);
  if (!(expectedIn > 0) || !(measuredIn > 0) || !Number.isFinite(expectedIn) || !Number.isFinite(measuredIn)) return c;
  return clampScale((expectedIn / measuredIn) * c);
}

/** Inches to the nearest eighth, the way a ruler reads: 3.375 is "3 3/8", 2.5 is "2 1/2". */
export function inchesLabel(inches: number): string {
  if (!Number.isFinite(inches) || inches < 0) return "";
  const eighths = Math.round(inches * 8);
  const whole = Math.floor(eighths / 8);
  let num = eighths % 8;
  let den = 8;
  while (num > 0 && num % 2 === 0) { num /= 2; den /= 2; }
  if (num === 0) return String(whole);
  return whole > 0 ? `${whole} ${num}/${den}` : `${num}/${den}`;
}
