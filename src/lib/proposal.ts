// Shared proposal helpers: pricing math and the standard terms that go on
// every proposal. No Firebase imports; safe on client and server.

import type { MapAnnotation, Proposal, QuoteLine, QuoteRequest } from "@/lib/types";
import { addDays, localDateOf } from "@/lib/leads";

/** Michigan sales tax, applied to material lines only. */
export const MATERIALS_TAX_RATE = 0.06;

export const DEFAULT_VALID_DAYS = 30;

export function computeLineTotals(lines: QuoteLine[]) {
  let work = 0;
  let materials = 0;
  for (const l of lines) {
    const t = (Number(l.qty) || 0) * (Number(l.unitPrice) || 0);
    if (l.kind === "material") materials += t;
    else work += t;
  }
  work = Math.round(work * 100) / 100;
  materials = Math.round(materials * 100) / 100;
  const tax = Math.round(materials * MATERIALS_TAX_RATE * 100) / 100;
  const total = Math.round((work + materials + tax) * 100) / 100;
  return { work, materials, tax, total };
}

const lineAmount = (l: QuoteLine) => (Number(l.qty) || 0) * (Number(l.unitPrice) || 0);

/**
 * The lines that go on the customer's copy. A $0 line with a description
 * ("Restoration included") is kept and shows as Included; blank rows are
 * dropped. Throws when nothing has a price.
 */
export function proposalLines(lines: QuoteLine[] | null | undefined, quotedPrice?: number | null): QuoteLine[] {
  const kept = (lines || []).filter((l) => lineAmount(l) > 0 || (l.description || "").trim());
  if (kept.some((l) => lineAmount(l) > 0)) return kept;
  if (typeof quotedPrice === "number" && quotedPrice > 0) {
    return [{ description: "Directional drilling, per scope", kind: "work", qty: 1, unitPrice: quotedPrice }, ...kept];
  }
  throw new Error("Save a price or at least one line item before sending.");
}

/**
 * JSON with object keys sorted, so a value read back from Firestore (which
 * does not keep key order) compares equal to the one that was written.
 * Undefined fields are dropped, as Firestore drops them.
 */
export function stableStringify(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .sort()
          .map((k) => [k, norm((v as Record<string, unknown>)[k])])
      );
    }
    return v;
  };
  return JSON.stringify(norm(value));
}

/**
 * What the customer sees on a quote, as one comparable string: price,
 * lines, scope, and the drawn lines, pins and notes. Map panning, zoom and
 * the terrain sample don't count.
 */
export function customerContentKey(q: {
  quotedPrice?: number | null;
  quoteLines?: QuoteLine[] | null;
  mapAnnotation?: MapAnnotation | null;
  scopeText?: string | null;
}): string {
  const ann = q.mapAnnotation;
  return stableStringify({
    price: typeof q.quotedPrice === "number" ? q.quotedPrice : null,
    lines: (q.quoteLines || []).map((l) => [l.description, l.kind, Number(l.qty), Number(l.unitPrice)]),
    scope: (q.scopeText || "").trim(),
    paths: (ann?.paths || []).map((p) => [p.type, p.service || "", p.points]),
    markers: (ann?.markers || []).map((m) => [m.type, m.position]),
    labels: (ann?.labels || []).map((l) => [l.text, l.position]),
    service: ann?.service || "",
    pipeSize: ann?.pipeSize || "",
  });
}

/**
 * Everything the workbench saves (drawing, price, lines, scope), as one
 * comparable string, except the map viewport, which moves on every pan.
 * The workbench remembers the key it loaded; when the saved quote's key
 * moves away from it, someone else changed the quote.
 */
export function workContentKey(q: {
  mapAnnotation?: MapAnnotation | null;
  quotedPrice?: number | null;
  quoteLines?: QuoteLine[] | null;
  scopeText?: string | null;
}): string {
  return stableStringify([
    q.mapAnnotation ? { ...q.mapAnnotation, center: null, zoom: null } : null,
    q.quotedPrice ?? null,
    q.quoteLines ?? null,
    (q.scopeText || "").trim(),
  ]);
}

/**
 * The sale amount for a lead: every accepted proposal across the lead's
 * quotes, added up. A contractor can accept two job sites on one lead.
 */
export function acceptedSaleTotal(proposals: Array<Pick<Proposal, "status" | "totals">>): number {
  const sum = proposals
    .filter((p) => p.status === "accepted")
    .reduce((s, p) => s + (Number(p.totals?.total) || 0), 0);
  return Math.round(sum * 100) / 100;
}

export const money = (n: number): string =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Standard terms on every proposal. Bill's wording from the Holiday Park
 * proposal: known utilities only, hardware not included, restoration to
 * grade. Edit here to change them everywhere.
 */
export const STANDARD_TERMS: string[] = [
  "Price covers the work and materials listed above. Hardware such as wire, fittings, and terminations is not included unless it is listed. We are glad to talk through it at no charge.",
  "Before drilling we locate all known utilities: public lines marked through MISS DIG, plus private lines the owner points out or that we find with our own locating equipment. We are not responsible for private lines that are not disclosed and cannot be located.",
  "Pricing assumes normal soil. If we hit rock, cobble, or other conditions that stop the drill, we stop and talk with you before going any further.",
  "Entry and exit pits are backfilled and restored with topsoil and seed, brought to grade. In frozen ground, final restoration is done after the thaw.",
  "Permits and road agency fees are not included unless they are listed.",
  "Payment is due on completion unless we agree otherwise in writing.",
];

export function defaultScope(serviceType: string, feet?: number): string {
  const svc = (serviceType || "").replace(/-/g, " ").trim();
  const run = feet && feet > 0 ? `approximately ${Math.round(feet)} feet` : "the run shown on the map";
  return `Directional drill ${run}${svc ? ` for ${svc}` : ""}, as drawn on the map below. Install the line, locate known utilities before drilling, and restore the entry and exit pits.`;
}

/**
 * True when a scope is just the generated default (for any footage), not
 * wording the estimator typed. A default keeps following the drawing.
 */
export function isDefaultScope(text: string | null | undefined, serviceType: string): boolean {
  const t = (text || "").trim();
  if (!t) return true;
  const m = /approximately (\d+) feet/.exec(t);
  return t === defaultScope(serviceType, m ? Number(m[1]) : undefined).trim();
}

/**
 * The subject line of the quote email. Says what it is, where, and how much,
 * so it reads right in a crowded inbox and a re-send is plainly a revision:
 *   "Your directional drilling quote, 123 Main St: $7,072"
 *   "Revised quote (v2), 123 Main St: $7,072"
 */
export function proposalSubject(input: { version: number; address?: string; name?: string; total: number }): string {
  const where = (input.address || "").trim() || (input.name || "").trim();
  const amount = money(input.total);
  const lead = input.version > 1 ? `Revised quote (v${input.version})` : "Your directional drilling quote";
  return `${lead}${where ? `, ${where.slice(0, 80)}` : ""}: ${amount}`;
}

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://fibernorth.com";

export function proposalUrl(token: string): string {
  return `${SITE_URL}/proposal/${token}`;
}

/**
 * The customer's link as the office opens it: marked as a preview, so the
 * page doesn't record Bill looking at it as the customer opening it.
 */
export function proposalPreviewUrl(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}preview=1`;
}

// ---------------------------------------------------------------------------
// Expiry and customer-facing dates. Everything the customer reads, and every
// "expired" the office sees, is worked out in Detroit time from these.

export const QUOTE_TIME_ZONE = "America/Detroit";

const detroitClock = new Intl.DateTimeFormat("en-US", {
  timeZone: QUOTE_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function detroitParts(at: Date): Record<string, string> {
  return Object.fromEntries(detroitClock.formatToParts(at).map((p) => [p.type, p.value]));
}

/** Detroit's offset from UTC in ms (negative) at an instant. */
function detroitOffsetMs(at: Date): number {
  const p = detroitParts(at);
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

/** ISO instant of 23:59:59.999 Detroit time on a YYYY-MM-DD. */
export function endOfDetroitDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  // US clocks change at 2am, so the offset at noon UTC (8am local) holds
  // for the rest of that local day.
  const offset = detroitOffsetMs(new Date(Date.UTC(y, m - 1, d, 12)));
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - offset).toISOString();
}

/**
 * When a proposal sent at `sent` and good for `validDays` stops working: the
 * end of the last valid day in Detroit, not the minute of the send. Sent
 * Sept 26 for 30 days is good through Oct 26, all day.
 */
export function expiresAtFor(sent: Date, validDays: number): string {
  return endOfDetroitDay(addDays(localDateOf(sent), validDays));
}

function isEndOfDetroitDay(iso: string): boolean {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const p = detroitParts(d);
  return p.hour === "23" && p.minute === "59";
}

type ExpiryFields = { expiresAt?: string | null; sentAt?: string | null };

/**
 * First Detroit day (YYYY-MM-DD) the quote is expired, or null when it was
 * never sent. Quotes sent since this fix expire at the end of their last day;
 * older ones expired at the minute of the send, so their last whole valid
 * day is the day before. A badge with no expiresAt: sentAt + 30 days.
 */
export function quoteFirstExpiredDay(q: ExpiryFields | null | undefined): string | null {
  if (!q) return null;
  if (q.expiresAt) {
    const day = localDateOf(q.expiresAt);
    return isEndOfDetroitDay(q.expiresAt) ? addDays(day, 1) : day;
  }
  if (!q.sentAt) return null;
  return addDays(localDateOf(q.sentAt), DEFAULT_VALID_DAYS);
}

/** Last Detroit day (YYYY-MM-DD) the quote is good through. */
export function quoteLastValidDay(q: ExpiryFields | null | undefined): string | null {
  const first = quoteFirstExpiredDay(q);
  return first ? addDays(first, -1) : null;
}

/**
 * The one "expired" rule for office screens and metrics: a sent or opened
 * quote whose good-through day is behind us. `today` is Detroit YYYY-MM-DD
 * (todayISO()). Pass a quote doc (estimateStatus) or a lead badge (status).
 * Accepted, declined, draft and replaced quotes are never "expired".
 */
export function isQuoteExpiredOn(
  q: (ExpiryFields & { status?: string | null; estimateStatus?: string | null }) | null | undefined,
  today: string
): boolean {
  if (!q) return false;
  const status = String(q.estimateStatus ?? q.status ?? "");
  if (status !== "sent" && status !== "viewed" && status !== "expired") return false;
  const first = quoteFirstExpiredDay(q);
  return !!first && today >= first;
}

/** True once the instant `expiresAt` has passed. For the customer-facing routes. */
export function isPastExpiry(expiresAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) && now > t;
}

/** A date for the customer ("October 26, 2026"), in Detroit time. */
export function formatCustomerDate(
  iso: string,
  opts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" }
): string {
  return new Date(iso).toLocaleDateString("en-US", { ...opts, timeZone: QUOTE_TIME_ZONE });
}

/** A YYYY-MM-DD shown as a date, with no time zone shift. */
export function formatDay(
  ymd: string,
  opts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" }
): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

/** The good-through date as text ("October 26, 2026"); "" when never sent. */
export function goodThroughText(q: ExpiryFields | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  const last = quoteLastValidDay(q);
  return last ? formatDay(last, opts) : "";
}

// ---------------------------------------------------------------------------
// Sent total vs the draft on screen.

/** What the customer was sent: sentTotal, else (quotes sent before it was kept) the saved price. */
export function sentTotalOf(q: Partial<Pick<QuoteRequest, "sentTotal" | "quotedPrice" | "version">>): number | null {
  if (!q.version) return null;
  if (typeof q.sentTotal === "number") return q.sentTotal;
  return typeof q.quotedPrice === "number" ? q.quotedPrice : null;
}

/**
 * Whether the quote changed, in a way the customer would see, after it was
 * sent (their copy is out of date), and the saved draft's price if so.
 */
export function unsentChanges(
  q: Partial<Pick<QuoteRequest, "version" | "sentAt" | "contentChangedAt" | "quotedPrice">>
): { changed: boolean; total: number | null } {
  const changed = !!q.version && !!q.sentAt && (q.contentChangedAt || "") > q.sentAt;
  return { changed, total: changed && typeof q.quotedPrice === "number" ? q.quotedPrice : null };
}

// ---------------------------------------------------------------------------
// The lead's quote badge, worked out from all of its quotes.

/** The denormalized badge on a lead. quoteId says which quote it describes. */
export interface QuoteBadge {
  quoteId: string;
  proposalId?: string;
  status: string;
  total: number | null;
  version: number;
  sentAt?: string;
  expiresAt?: string;
  viewedAt?: string;
  url?: string;
}

export type QuoteForRollup = Pick<QuoteRequest, "id"> &
  Partial<
    Pick<
      QuoteRequest,
      | "estimateStatus"
      | "version"
      | "proposalId"
      | "sentAt"
      | "expiresAt"
      | "viewedAt"
      | "acceptedAt"
      | "createdAt"
      | "quotedPrice"
      | "sentTotal"
    >
  >;

function newest<T>(list: T[], key: (t: T) => string): T | undefined {
  return list.reduce<T | undefined>((best, t) => (best === undefined || key(t) > key(best) ? t : best), undefined);
}

const isDraftQuote = (q: QuoteForRollup) => !q.version || !q.estimateStatus || q.estimateStatus === "draft";

/** The badge for one quote. Never has undefined fields (Firestore refuses them). */
export function badgeForQuote(q: QuoteForRollup): QuoteBadge {
  if (isDraftQuote(q)) return { quoteId: q.id, status: "draft", total: null, version: 0 };
  const badge: QuoteBadge = { quoteId: q.id, status: String(q.estimateStatus), total: sentTotalOf(q), version: q.version || 0 };
  if (q.proposalId) {
    badge.proposalId = q.proposalId;
    badge.url = proposalUrl(q.proposalId);
  }
  if (q.sentAt) badge.sentAt = q.sentAt;
  if (q.expiresAt) badge.expiresAt = q.expiresAt;
  if (q.viewedAt) badge.viewedAt = q.viewedAt;
  return badge;
}

/**
 * The lead's quoteId, badge and quoteCount from every quote on it. One rule
 * everywhere, so a customer acting on site A's quote can't repaint site B's
 * badge, and a new draft can't hide a quote that is out with the customer:
 *   1. the newest sent or opened quote that hasn't expired,
 *   2. else the newest accepted one,
 *   3. else the newest draft,
 *   4. else the newest sent one (declined or expired).
 */
export function leadQuoteRollup(
  quotes: QuoteForRollup[],
  today: string
): { quoteId: string; quote: QuoteBadge | null; quoteCount: number } {
  const open = quotes.filter(
    (q) => !isDraftQuote(q) && (q.estimateStatus === "sent" || q.estimateStatus === "viewed") && !isQuoteExpiredOn(q, today)
  );
  const pick =
    newest(open, (q) => q.sentAt || "") ??
    newest(
      quotes.filter((q) => q.estimateStatus === "accepted"),
      (q) => q.acceptedAt || q.sentAt || ""
    ) ??
    newest(quotes.filter(isDraftQuote), (q) => q.createdAt || "") ??
    newest(quotes, (q) => q.sentAt || q.createdAt || "");
  return { quoteId: pick?.id || "", quote: pick ? badgeForQuote(pick) : null, quoteCount: quotes.length };
}

/** A badge or quote status as the office should read it: "expired" once it has. */
export function statusOn(
  q: (ExpiryFields & { status?: string | null; estimateStatus?: string | null }) | null | undefined,
  today: string
): string {
  const status = String(q?.estimateStatus ?? q?.status ?? "");
  if (!status) return "";
  return isQuoteExpiredOn(q, today) ? "expired" : status;
}
