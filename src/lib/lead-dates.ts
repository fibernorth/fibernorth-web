// When a lead really came in, and when it was really won, for the dashboard's
// sales numbers. Pure functions (no Firebase). Every date returned is a
// Detroit YYYY-MM-DD.
//
// Why this exists: the sheet sync and the imports stamp `createdAt` with the
// moment they ran, so counting by `createdAt` puts old sheet rows and whole
// mailing lists into the month they were imported.

import { TALKED_TYPES, localDateOf, type Lead, type LeadActivity } from "@/lib/leads";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const pad = (n: number) => String(n).padStart(2, "0");

function ymd(y: number, m: number, d: number): string | null {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  if (dt.getUTCMonth() !== m - 1) return null; // 2/30 and friends
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Read the day out of a `leadAt` value. It is ISO for website leads
 * ("2026-09-14T19:02:11.000Z") and the sheet's display text for sheet leads
 * ("9/14/2026 3:45 PM", "9/14/26", "9/14", "Sep 14, 2026", "2026-09-14").
 * A year left off is taken from `refDate` (the import day): the latest year
 * that doesn't put the lead after it. Returns null when it can't be read.
 */
export function parseLeadAtDate(leadAt: string | undefined | null, refDate?: string | null): string | null {
  const s = (leadAt || "").trim();
  if (!s) return null;

  // Full ISO timestamp: convert to the Detroit day.
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const t = Date.parse(s);
    return isNaN(t) ? null : localDateOf(new Date(t));
  }
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return ymd(+m[1], +m[2], +m[3]);

  const refYear = refDate && ISO_DATE.test(refDate) ? Number(refDate.slice(0, 4)) : null;
  const withYear = (mo: number, d: number, yRaw: string | undefined): string | null => {
    if (yRaw) {
      const y = yRaw.length <= 2 ? 2000 + Number(yRaw) : Number(yRaw);
      return ymd(y, mo, d);
    }
    if (refYear === null) return null;
    const same = ymd(refYear, mo, d);
    // "12/30" read in January belongs to last year.
    if (same && refDate && same > refDate) return ymd(refYear - 1, mo, d);
    return same;
  };

  // US numeric: 9/14/2026, 9/14/26, 9/14, 9-14-2026
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?\b/);
  if (m) return withYear(+m[1], +m[2], m[3]);

  // Month name: "Sep 14, 2026", "September 14 2026", "Mon, Sep 14, 2026"
  m = s.match(/(?:^|[\s,])([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/);
  if (m) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    if (mo > 0) return withYear(mo, +m[2], m[3]);
  }
  return null;
}

/** Letter-campaign sources: mailing lists imported as prospects, not people who asked. */
export const LETTER_SOURCES: readonly string[] = ["campground-letter", "contractor-letter"];

/** Stages that mean real two-way contact happened. */
const ENGAGED_STAGES: readonly string[] = ["walk_scheduled", "walk_done", "quoted", "won"];

type DateInput = Partial<Pick<Lead, "source" | "stage" | "leadAt" | "createdAt" | "activity" | "quote" | "quoteId">>;

function firstEngagedActivity(activity: LeadActivity[] | undefined): LeadActivity | null {
  const hits = (activity || []).filter(
    (a) => TALKED_TYPES.includes(a.type) || (a.type === "quote" && /^Quote v\d+ sent\b/.test(a.text))
  );
  if (!hits.length) return null;
  return hits.reduce((a, b) => (b.ts < a.ts ? b : a));
}

/**
 * A letter-campaign prospect who never became a real lead: no conversation,
 * no quote, still at the start of the pipeline. These are left out of the
 * dashboard's Leads column.
 */
export function isLetterProspect(lead: DateInput): boolean {
  if (!LETTER_SOURCES.includes(String(lead.source || ""))) return false;
  if (ENGAGED_STAGES.includes(String(lead.stage || ""))) return false;
  if (lead.quoteId || lead.quote?.sentAt) return false;
  return firstEngagedActivity(lead.activity) === null;
}

/**
 * Day a lead came in. For letter-campaign leads that became real, the day of
 * the first conversation or quote (the mailing list's import day means
 * nothing). Otherwise `leadAt` when it can be read, else `createdAt`.
 */
export function leadDateOf(lead: DateInput): string | null {
  const created = lead.createdAt ? localDateOf(lead.createdAt) : null;
  if (LETTER_SOURCES.includes(String(lead.source || ""))) {
    const first = firstEngagedActivity(lead.activity);
    if (first) return localDateOf(first.ts);
    if (lead.quote?.sentAt) return localDateOf(lead.quote.sentAt);
    return created;
  }
  return parseLeadAtDate(lead.leadAt, created) ?? created;
}

type WonInput = DateInput &
  Partial<Pick<Lead, "lastContactAt">> & {
    /** Set by the accept route on newer data (lead or badge); read when present. */
    acceptedAt?: string;
  };

/**
 * Day a lead was won, best evidence first:
 *   1. the latest "Moved to Won" or customer ACCEPTED history line
 *   2. an `acceptedAt` on the lead or on an accepted quote badge
 *   3. for a lead that arrived already won (imported sheet row, no move
 *      recorded) the day it came in, when that is before the import
 *   4. its last contact (a hand-set win with no history)
 *   5. createdAt
 */
export function wonDateOf(lead: Pick<Lead, "stage"> & WonInput): string | null {
  if (lead.stage !== "won") return null;
  const hits = (lead.activity || []).filter(
    (a) => (a.type === "stage" && /^Moved to Won\b/.test(a.text)) || (a.type === "quote" && /ACCEPTED/.test(a.text))
  );
  if (hits.length) return localDateOf(hits.reduce((a, b) => (b.ts > a.ts ? b : a)).ts);

  const badge = lead.quote as (Lead["quote"] & { acceptedAt?: string }) | undefined;
  const accepted = lead.acceptedAt || (badge?.status === "accepted" ? badge.acceptedAt : undefined);
  if (accepted && !isNaN(Date.parse(accepted))) return localDateOf(accepted);

  const created = lead.createdAt ? localDateOf(lead.createdAt) : null;
  const came = parseLeadAtDate(lead.leadAt, created);
  if (came && created && came < created) return came;

  if (lead.lastContactAt) return lead.lastContactAt;
  return created;
}
