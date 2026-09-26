// Day keys for the letter-campaign counters (linkStats/camp, linkStats/pros).
// Pure helpers, no Firebase.
//
// Keys are Detroit days (YYYY-MM-DD). Before Sept 2026 the /camp and /pros
// routes keyed by UTC day, so a visit after ~8pm Detroit landed on the next
// day. Old keys are left as they are (a one-evening shift at most); the
// admin camp-reset route's "rekey" action rebuilds them from the visit log.

import { addDays, localDateOf } from "@/lib/leads";

/** Detroit day key for a visit at `now`. */
export function visitDayKey(now: Date = new Date()): string {
  return localDateOf(now);
}

/** The `n` Detroit days ending today, newest first. */
export function lastDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, -i));
}

/** Sum of a days map over the `n` days ending `today`. */
export function sumLastDays(days: Record<string, number> | undefined, today: string, n = 7): number {
  const map = days || {};
  return lastDays(today, n).reduce((s, d) => s + (Number(map[d]) || 0), 0);
}

/**
 * Rebuild day counts from the visit log (ts ISO strings), keyed by Detroit
 * day. Days before the first full logged day keep their old value, since the
 * visit log may not go back as far as the counters do.
 */
export function rekeyDays(days: Record<string, number>, visitTimestamps: string[]): Record<string, number> {
  const fromLog: Record<string, number> = {};
  let first: string | null = null;
  for (const ts of visitTimestamps) {
    const t = Date.parse(ts);
    if (isNaN(t)) continue;
    const d = localDateOf(new Date(t));
    fromLog[d] = (fromLog[d] || 0) + 1;
    if (first === null || d < first) first = d;
  }
  if (first === null) return { ...days };
  // The first logged day may be partial (logging started mid-day), so only
  // trust the log from the day after.
  const cutoff = addDays(first, 1);
  const out: Record<string, number> = {};
  for (const [d, n] of Object.entries(days)) if (d < cutoff) out[d] = n;
  for (const [d, n] of Object.entries(fromLog)) if (d >= cutoff) out[d] = n;
  return out;
}

/** Start of the Detroit day `day` as an ISO instant (handles DST). */
export function detroitDayStartIso(day: string): string {
  // Detroit is UTC-4 or UTC-5; try both and keep the one that is local midnight.
  for (const off of [4, 5]) {
    const t = new Date(`${day}T${String(off).padStart(2, "0")}:00:00.000Z`);
    const hh = new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", hour: "2-digit", hourCycle: "h23" }).format(t);
    if (hh === "00") return t.toISOString();
  }
  return `${day}T05:00:00.000Z`;
}
