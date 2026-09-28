/**
 * Business days: Monday to Friday, minus the holidays the office is closed.
 * Follow-up dates, contact frequencies and "overdue" all count these, so a
 * lead is never overdue because of a weekend or a holiday.
 *
 * Dates are YYYY-MM-DD (Detroit calendar days).
 */

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const dow = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 Sun .. 6 Sat

function shift(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The nth weekday (0 Sun..6 Sat) of a month; n = -1 for the last one. */
function nthWeekday(y: number, m: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = iso(y, m, 1);
    const offset = (weekday - dow(first) + 7) % 7;
    return shift(first, offset + (n - 1) * 7);
  }
  const last = shift(iso(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1), -1);
  return shift(last, -((dow(last) - weekday + 7) % 7));
}

/** A fixed-date holiday on a weekend is taken Friday (Saturday) or Monday (Sunday). */
function observed(date: string): string {
  const w = dow(date);
  return w === 6 ? shift(date, -1) : w === 0 ? shift(date, 1) : date;
}

const cache = new Map<number, Set<string>>();

/** Holidays the office is closed in a year (observed dates). */
export function holidaysOf(year: number): Set<string> {
  let set = cache.get(year);
  if (set) return set;
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  set = new Set([
    observed(iso(year, 1, 1)), // New Year's Day
    nthWeekday(year, 5, 1, -1), // Memorial Day
    observed(iso(year, 7, 4)), // Independence Day
    nthWeekday(year, 9, 1, 1), // Labor Day
    thanksgiving, // Thanksgiving
    shift(thanksgiving, 1), // Day after Thanksgiving
    observed(iso(year, 12, 25)), // Christmas Day
  ]);
  // Next New Year's Day observed on Friday Dec 31.
  const nextNewYear = observed(iso(year + 1, 1, 1));
  if (nextNewYear.startsWith(String(year))) set.add(nextNewYear);
  cache.set(year, set);
  return set;
}

export function isBusinessDay(date: string): boolean {
  const w = dow(date);
  if (w === 0 || w === 6) return false;
  return !holidaysOf(Number(date.slice(0, 4))).has(date);
}

/** The date itself if it's a business day, else the next one. */
export function nextBusinessDay(date: string): string {
  let d = date;
  while (!isBusinessDay(d)) d = shift(d, 1);
  return d;
}

/** The date itself if it's a business day, else the one before. */
export function prevBusinessDay(date: string): string {
  let d = date;
  while (!isBusinessDay(d)) d = shift(d, -1);
  return d;
}

/** `n` business days after `date` (n <= 0: the date, moved to a business day). */
export function addBusinessDays(date: string, n: number): string {
  let d = date;
  for (let i = 0; i < n; i++) d = nextBusinessDay(shift(d, 1));
  return n > 0 ? d : nextBusinessDay(d);
}

/** Business days from a to b: how many business days after a, up to and including b. Negative if b is before a. */
export function businessDaysBetween(a: string, b: string): number {
  if (b < a) return -businessDaysBetween(b, a);
  let n = 0;
  for (let d = shift(a, 1); d <= b; d = shift(d, 1)) if (isBusinessDay(d)) n++;
  return n;
}

/**
 * Overdue: a business day has passed since it was due. Something due on a
 * Saturday isn't overdue until Monday's work day is over.
 */
export function isPastDue(date: string, today: string): boolean {
  return nextBusinessDay(date) < today;
}
