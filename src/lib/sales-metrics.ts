// The dashboard's sales numbers, as pure functions over the leads list (and
// the monthly spend Bill types in). No Firebase; `today` is Detroit
// YYYY-MM-DD.

import { quoteExpiryDate } from "@/lib/cadence";
import {
  CLOSED_STAGES,
  SOURCE_LABELS,
  addDays,
  daysBetween,
  isDue,
  localDateOf,
  saleValue,
  type Lead,
  type LeadStage,
} from "@/lib/leads";

/** Sources Bill spends money on; the spend form has a box for each. */
export const SPEND_SOURCES = ["meta-ads", "google-ads", "campground-letter", "contractor-letter", "referral", "other"] as const;
export type SpendSource = (typeof SPEND_SOURCES)[number];

/** marketingSpend/{YYYY-MM}: dollars per source for that month. */
export type MonthSpend = Partial<Record<string, number>>;

export const sourceLabel = (s: string) => SOURCE_LABELS[s as keyof typeof SOURCE_LABELS] ?? (s || "Unknown");

const r2 = (n: number) => Math.round(n * 100) / 100;

/** "2026-09", "2026-08", ... counting back from today's month. */
export function monthsBack(today: string, n: number): string[] {
  const [y, m] = today.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Day the lead was won: the accept or "Moved to Won" line, else its last contact. */
export function wonDateOf(lead: Pick<Lead, "stage"> & Partial<Pick<Lead, "activity" | "lastContactAt" | "createdAt">>): string | null {
  if (lead.stage !== "won") return null;
  const hits = (lead.activity || []).filter(
    (a) => (a.type === "stage" && /^Moved to Won\b/.test(a.text)) || (a.type === "quote" && /ACCEPTED/.test(a.text))
  );
  if (hits.length) return localDateOf(hits.reduce((a, b) => (b.ts > a.ts ? b : a)).ts);
  if (lead.lastContactAt) return lead.lastContactAt;
  return lead.createdAt ? localDateOf(lead.createdAt) : null;
}

/** Day the first quote went to this lead (history line, else the badge). */
export function quoteSentDateOf(lead: Partial<Pick<Lead, "activity" | "quote">>): string | null {
  const sends = (lead.activity || []).filter((a) => a.type === "quote" && /^Quote v\d+ sent\b/.test(a.text));
  if (sends.length) return localDateOf(sends.reduce((a, b) => (b.ts < a.ts ? b : a)).ts);
  return lead.quote?.sentAt ? localDateOf(lead.quote.sentAt) : null;
}

export interface CallsToday {
  total: number;
  bySource: Array<{ source: string; label: string; n: number }>;
}

/** Leads on the Due list today, split by where they came from. */
export function callsToday(leads: Lead[], today: string): CallsToday {
  const counts = new Map<string, number>();
  let total = 0;
  for (const l of leads) {
    if (!isDue(l, today)) continue;
    total += 1;
    const s = String(l.source || "other");
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  const bySource = [...counts.entries()]
    .map(([source, n]) => ({ source, label: sourceLabel(source), n }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  return { total, bySource };
}

export interface OpenQuotes {
  count: number;
  dollars: number;
  /** Days since the oldest open quote went out; null with none open. */
  oldestDays: number | null;
  oldest: Lead | null;
  /** Open quotes that expire within `soonDays`. */
  expiringSoon: Array<{ lead: Lead; expires: string }>;
}

/** Quotes out with the customer (sent or opened, not expired, not decided). */
export function openQuotes(leads: Lead[], today: string, soonDays = 7): OpenQuotes {
  const out: OpenQuotes = { count: 0, dollars: 0, oldestDays: null, oldest: null, expiringSoon: [] };
  for (const l of leads) {
    const q = l.quote;
    if (!q?.sentAt || !["sent", "viewed"].includes(q.status)) continue;
    if (CLOSED_STAGES.includes(l.stage as LeadStage)) continue;
    const expires = quoteExpiryDate(q);
    if (expires && expires <= today) continue;
    out.count += 1;
    out.dollars += Number(q.total) || 0;
    const age = daysBetween(localDateOf(q.sentAt), today);
    if (out.oldestDays === null || age > out.oldestDays) {
      out.oldestDays = age;
      out.oldest = l;
    }
    if (expires && expires <= addDays(today, soonDays)) out.expiringSoon.push({ lead: l, expires });
  }
  out.dollars = r2(out.dollars);
  out.expiringSoon.sort((a, b) => a.expires.localeCompare(b.expires));
  return out;
}

export interface WinRate {
  sent: number;
  won: number;
  lost: number;
  /** Still out with the customer. */
  open: number;
  /** won / sent, 0..1; null when nothing was sent. */
  rate: number | null;
}

/** Of leads whose first quote went out in the last `days`, how many were won. */
export function quoteWinRate(leads: Lead[], today: string, days = 90): WinRate {
  const since = addDays(today, -days);
  const out: WinRate = { sent: 0, won: 0, lost: 0, open: 0, rate: null };
  for (const l of leads) {
    if (l.stage === "not_a_lead") continue;
    const sent = quoteSentDateOf(l);
    if (!sent || sent < since || sent > today) continue;
    out.sent += 1;
    if (l.stage === "won") out.won += 1;
    else if (l.stage === "lost" || l.quote?.status === "declined") out.lost += 1;
    else out.open += 1;
  }
  out.rate = out.sent ? out.won / out.sent : null;
  return out;
}

export interface WonSummary {
  count: number;
  dollars: number;
  /** Average of won jobs with a sale amount; null with none. */
  avgJob: number | null;
}

function wonBetween(leads: Lead[], from: string, to: string): WonSummary {
  let count = 0;
  let dollars = 0;
  let priced = 0;
  for (const l of leads) {
    const d = wonDateOf(l);
    if (!d || d < from || d > to) continue;
    count += 1;
    const v = saleValue(l);
    if (v !== null && v > 0) {
      dollars += v;
      priced += 1;
    }
  }
  return { count, dollars: r2(dollars), avgJob: priced ? r2(dollars / priced) : null };
}

/** Won this calendar month (Detroit). */
export function wonThisMonth(leads: Lead[], today: string): WonSummary {
  return wonBetween(leads, `${today.slice(0, 7)}-01`, today);
}

/** Won in the last `days` days (for a steadier average job size). */
export function wonLastDays(leads: Lead[], today: string, days = 90): WonSummary {
  return wonBetween(leads, addDays(today, -days), today);
}

export interface SourceCost {
  source: string;
  label: string;
  spend: number;
  leads: number;
  won: number;
  dollars: number;
  /** spend / won; null when nothing won (or no spend entered). */
  costPerWon: number | null;
}

/**
 * Spend, leads, won jobs and cost per won job by source, over the given
 * months. A lead counts in the month it came in; a win in the month it was won.
 */
export function costPerWonBySource(leads: Lead[], spend: Record<string, MonthSpend>, months: string[]): SourceCost[] {
  const inMonths = (d: string | null | undefined) => Boolean(d) && months.includes(d!.slice(0, 7));
  const rows = new Map<string, SourceCost>();
  const row = (s: string) => {
    if (!rows.has(s)) rows.set(s, { source: s, label: sourceLabel(s), spend: 0, leads: 0, won: 0, dollars: 0, costPerWon: null });
    return rows.get(s)!;
  };
  for (const s of SPEND_SOURCES) row(s);
  for (const m of months) {
    for (const [s, v] of Object.entries(spend[m] || {})) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) row(s).spend += n;
    }
  }
  for (const l of leads) {
    if (l.stage === "not_a_lead") continue;
    const s = String(l.source || "other");
    if (inMonths(l.createdAt ? localDateOf(l.createdAt) : null)) row(s).leads += 1;
    const w = wonDateOf(l);
    if (inMonths(w)) {
      row(s).won += 1;
      row(s).dollars += saleValue(l) ?? 0;
    }
  }
  return [...rows.values()]
    .map((r) => ({
      ...r,
      spend: r2(r.spend),
      dollars: r2(r.dollars),
      costPerWon: r.spend > 0 && r.won > 0 ? r2(r.spend / r.won) : null,
    }))
    .filter((r) => r.spend > 0 || r.leads > 0 || r.won > 0 || (SPEND_SOURCES as readonly string[]).includes(r.source))
    .sort((a, b) => b.spend - a.spend || b.won - a.won || a.label.localeCompare(b.label));
}

/** Clean a spend form: numbers >= 0 for known sources only. */
export function cleanSpend(input: Record<string, unknown>): Record<SpendSource, number> {
  const out = {} as Record<SpendSource, number>;
  for (const s of SPEND_SOURCES) {
    const raw = input[s];
    const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/[$,\s]/g, ""));
    out[s] = Number.isFinite(n) && n > 0 ? r2(Math.min(n, 10_000_000)) : 0;
  }
  return out;
}
