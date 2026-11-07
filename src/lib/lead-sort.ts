// Sort orders for the leads list. Pure (no Firebase, no clock): pass today
// (Detroit YYYY-MM-DD) for the follow-up order.
//
// The default, "Oldest contact first", is how Bill works the list: leads
// nobody has touched yet come first (oldest arrival first), then everyone
// else by how long it has been since the last touch. A no-answer call or a
// voicemail counts as a touch here: someone he tried yesterday goes after
// someone nobody has tried in a week.

import { parseLeadAtDate } from "@/lib/lead-dates";
import { followUpOf, isTouch, localDateOf, type Lead } from "@/lib/leads";

export const LEAD_SORTS = [
  "contact_oldest",
  "contact_newest",
  "lead_newest",
  "lead_oldest",
  "follow_up",
  "name",
] as const;
export type LeadSort = (typeof LEAD_SORTS)[number];

export const DEFAULT_LEAD_SORT: LeadSort = "contact_oldest";

export const LEAD_SORT_LABELS: Record<LeadSort, string> = {
  contact_oldest: "Oldest contact first",
  contact_newest: "Newest contact first",
  lead_newest: "Newest lead first",
  lead_oldest: "Oldest lead first",
  follow_up: "Next follow-up due",
  name: "Name A–Z",
};

export function isLeadSort(v: unknown): v is LeadSort {
  return typeof v === "string" && (LEAD_SORTS as readonly string[]).includes(v);
}

type SortInput = Pick<Lead, "id" | "name" | "stage"> &
  Partial<Pick<Lead, "leadAt" | "createdAt" | "lastContactAt" | "activity" | "nextAction" | "nextActionAt" | "appointmentAt">>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Day of the last touch (YYYY-MM-DD), or "" for never: lastContactAt or the
 * latest call, no-answer call, text, email, letter or walk in the history,
 * whichever is later.
 */
export function lastTouchDayOf(lead: Pick<Lead, "lastContactAt" | "activity">): string {
  let best = DAY.test(lead.lastContactAt || "") ? (lead.lastContactAt as string) : "";
  for (const a of lead.activity || []) {
    if (!isTouch(a)) continue;
    const d = localDateOf(a.ts);
    if (DAY.test(d) && d > best) best = d;
  }
  return best;
}

/** createdAt as an ISO string: a string as stored, or a Firestore Timestamp read raw. */
function createdIso(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const t = v as { toDate?: () => Date; seconds?: number; _seconds?: number };
    try {
      if (typeof t.toDate === "function") return t.toDate().toISOString();
      const s = typeof t.seconds === "number" ? t.seconds : t._seconds;
      if (typeof s === "number") return new Date(s * 1000).toISOString();
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * When the lead came in, as a sortable string ("" when unknown): the day
 * from leadAt (ISO or the sheet's date text), then createdAt to order leads
 * from the same day. With neither readable, the first line in its history,
 * so an old lead with an odd date never sorts below one from today.
 */
export function arrivalKeyOf(lead: Pick<Lead, "leadAt" | "createdAt"> & Partial<Pick<Lead, "activity">>): string {
  const created = createdIso(lead.createdAt as unknown);
  const createdDay = created ? localDateOf(created) : "";
  const day = parseLeadAtDate(lead.leadAt, DAY.test(createdDay) ? createdDay : null) ?? createdDay;
  if (DAY.test(day)) return `${day}|${created}`;
  let first = "";
  for (const a of lead.activity || []) {
    if (typeof a?.ts === "string" && a.ts && (!first || a.ts < first)) first = a.ts;
  }
  const firstDay = first ? localDateOf(first) : "";
  return DAY.test(firstDay) ? `${firstDay}|${first}` : "";
}

/** Ascending on a key with blanks ("") last. */
function asc(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : 1;
}

/** Descending on a key with blanks ("") last. */
function desc(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a > b ? -1 : 1;
}

function byName(a: SortInput, b: SortInput): number {
  const x = (a.name || "").trim();
  const y = (b.name || "").trim();
  if (!x || !y) return asc(x, y);
  return x.localeCompare(y, undefined, { sensitivity: "base", numeric: true });
}

/** Comparator for one sort order. Ties fall back to oldest arrival, then name, then id. */
export function leadComparator(sort: LeadSort, today: string): (a: SortInput, b: SortInput) => number {
  // Keys are worked out once per lead, not once per comparison.
  const memo = <K>(fn: (l: SortInput) => K) => {
    const cache = new WeakMap<SortInput, K>();
    return (l: SortInput): K => {
      if (!cache.has(l)) cache.set(l, fn(l));
      return cache.get(l) as K;
    };
  };
  const arrivalKey = memo(arrivalKeyOf);
  const lastTouchOf = memo(lastTouchDayOf);
  const tie = (a: SortInput, b: SortInput) =>
    asc(arrivalKey(a), arrivalKey(b)) || byName(a, b) || a.id.localeCompare(b.id);
  switch (sort) {
    case "contact_oldest":
      // "" (never touched) sorts first here on purpose, and among those the
      // oldest arrival first: a lead waiting three weeks is above one from
      // five minutes ago.
      return (a, b) => {
        const x = lastTouchOf(a);
        const y = lastTouchOf(b);
        if (x !== y) return x < y ? -1 : 1;
        return tie(a, b);
      };
    case "contact_newest":
      return (a, b) => desc(lastTouchOf(a), lastTouchOf(b)) || tie(a, b);
    case "lead_newest":
      return (a, b) => desc(arrivalKey(a), arrivalKey(b)) || byName(a, b) || a.id.localeCompare(b.id);
    case "lead_oldest":
      return tie;
    case "follow_up":
    {
      const due = memo((l) => followUpOf(l, today).at);
      return (a, b) => asc(due(a), due(b)) || tie(a, b);
    }
    case "name":
      return (a, b) => byName(a, b) || tie(a, b);
  }
}

/** A sorted copy. */
export function sortLeads<T extends SortInput>(leads: T[], sort: LeadSort, today: string): T[] {
  const cmp = leadComparator(sort, today);
  return [...leads].sort(cmp);
}
