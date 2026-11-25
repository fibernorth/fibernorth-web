// Options on one quote: the same customer and job site priced more than one
// way ("Option A: 1-1/4 in conduit", "Option B: 2 in with a pull box").
// Each option is its own quote (own lines, own drawing, own link), joined by
// optionGroup, which is the id of the quote the first option was copied
// from. A group is "pick one" (the default, Bill Nov 2026: accepting one
// option closes the others, and Undo acceptance reopens them) or "add-ons"
// (several can be accepted; the sale is every accepted option). Pure:
// shared by the server actions and the tests.

import type { QuoteRequest } from "@/lib/types";

type OptionQuote = Pick<QuoteRequest, "id"> &
  Partial<
    Pick<
      QuoteRequest,
      "optionGroup" | "optionLabel" | "createdAt" | "optionMode" | "estimateStatus" | "optionClosedAt" | "optionClosedFor"
    >
  >;

export type OptionMode = "pick" | "add";

/** Longest label kept ("Option B: 2 in conduit with pull box"). */
export const OPTION_LABEL_MAX = 60;

export function cleanOptionLabel(label: string | null | undefined): string {
  return String(label ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, OPTION_LABEL_MAX);
}

/** The group a quote is in, or "" when it has no options. */
export function optionGroupOf(q: OptionQuote): string {
  return q.optionGroup || "";
}

/** The other options in the quote's group (not the quote itself), oldest first. */
export function optionSiblings<Q extends OptionQuote>(quote: OptionQuote, quotes: Q[]): Q[] {
  const group = optionGroupOf(quote);
  if (!group) return [];
  return quotes
    .filter((q) => q.id !== quote.id && optionGroupOf(q) === group)
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
}

/** Every quote in the group, the given one included, oldest first. */
export function optionGroupQuotes<Q extends OptionQuote>(quote: Q, quotes: Q[]): Q[] {
  if (!optionGroupOf(quote)) return [quote];
  const all = quotes.some((q) => q.id === quote.id) ? quotes : [...quotes, quote];
  return all
    .filter((q) => optionGroupOf(q) === optionGroupOf(quote))
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
}

/**
 * The next free "Option X" label: "Option A" for the first, then B, C...
 * Labels typed by hand ("Option B: 2 in") still count as their letter.
 */
export function nextOptionLabel(labels: Array<string | null | undefined>): string {
  const used = new Set<string>();
  for (const l of labels) {
    const m = String(l ?? "").match(/^option\s+([a-z])\b/i);
    if (m) used.add(m[1].toUpperCase());
  }
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    if (!used.has(letter)) return `Option ${letter}`;
  }
  return `Option ${labels.length + 1}`;
}

/** "Option B: 2 in conduit" for a quote in a group, "" otherwise. */
export function optionLabelOf(q: OptionQuote): string {
  return optionGroupOf(q) ? cleanOptionLabel(q.optionLabel) : "";
}

/**
 * The fields a new option copies from the quote it starts from: the site,
 * the drawing and the pricing, but nothing about sending, approval,
 * Bore-ON or QuickBooks (the new option starts as a fresh draft).
 */
export const OPTION_COPY_FIELDS = [
  "name",
  "email",
  "phone",
  "address",
  "serviceType",
  "description",
  "urgency",
  "mapAnnotation",
  "mapImageUrl",
  "propertyPhotos",
  "howHeard",
  "soilType",
  "quotedPrice",
  "quoteLines",
  "people",
  "days",
  "lineFeet",
  "needsApprovalReason",
  "scopeText",
  "leadId",
  "leadPrivate",
  "optionMode",
] as const satisfies ReadonlyArray<keyof QuoteRequest>;

export function optionCopyOf(source: Partial<QuoteRequest>): Partial<QuoteRequest> {
  const out: Record<string, unknown> = {};
  for (const k of OPTION_COPY_FIELDS) {
    const v = source[k];
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<QuoteRequest>;
}

/** Whether the office can close this option (anything but accepted or already closed). */
export function canCloseOption(q: Partial<Pick<QuoteRequest, "estimateStatus" | "optionClosedAt">>): boolean {
  return !q.optionClosedAt && q.estimateStatus !== "accepted";
}

/** "add" when any quote in the group says add-ons; otherwise "pick" (the default). */
export function optionModeOf(groupQuotes: ReadonlyArray<object>): OptionMode {
  return groupQuotes.some((q) => (q as { optionMode?: string }).optionMode === "add") ? "add" : "pick";
}

/** The optionClosedFor mark of an option closed because the customer chose `quoteId`. */
export function pickMark(quoteId: string): string {
  return `pick:${quoteId}`;
}

/**
 * The options to close when the customer accepts `accepted`: in a pick-one
 * group, every other option still open (not accepted, not already closed).
 * Add-on groups and quotes without options close nothing.
 */
export function optionsClosedByAccept<Q extends OptionQuote>(accepted: OptionQuote, quotes: Q[]): Q[] {
  if (!optionGroupOf(accepted)) return [];
  const group = optionGroupQuotes(accepted as Q, quotes);
  if (optionModeOf(group) !== "pick") return [];
  return group.filter((q) => q.id !== accepted.id && canCloseOption(q));
}

/** The options Undo acceptance reopens: the ones this acceptance closed. */
export function optionsReopenedByUndo<Q extends OptionQuote>(accepted: OptionQuote, quotes: Q[]): Q[] {
  if (!optionGroupOf(accepted)) return [];
  const mark = pickMark(accepted.id);
  return optionGroupQuotes(accepted as Q, quotes).filter((q) => q.id !== accepted.id && q.optionClosedFor === mark);
}

/** The optionClosedFor mark of a quote closed because its lead was marked Lost or Not a lead. */
export const LEAD_CLOSED_MARK = "lead";

type CloseableQuote = OptionQuote & Partial<Pick<QuoteRequest, "jobDoneAt" | "status">>;

/**
 * The quotes to close when the lead is marked Lost or Not a lead: every one
 * still open (not accepted, not finished, not already closed), drafts
 * included, so a dead lead's quotes stop counting as open money.
 */
export function quotesClosedByLead<Q extends CloseableQuote>(quotes: Q[]): Q[] {
  return quotes.filter((q) => canCloseOption(q) && !q.jobDoneAt && q.status !== "closed");
}

/** The quotes reopening the lead brings back: the ones closing it closed. */
export function quotesReopenedByLead<Q extends OptionQuote>(quotes: Q[]): Q[] {
  return quotes.filter((q) => q.optionClosedFor === LEAD_CLOSED_MARK);
}

/** An address reduced for comparing: street part, lowercase, no punctuation, common words shortened. */
export function siteKey(address: string | null | undefined): string {
  const street = String(address || "").split(",")[0].toLowerCase();
  return street
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(road)\b/g, "rd")
    .replace(/\b(street)\b/g, "st")
    .replace(/\b(drive)\b/g, "dr")
    .replace(/\b(avenue)\b/g, "ave")
    .replace(/\b(lane)\b/g, "ln")
    .replace(/\b(highway)\b/g, "hwy")
    .replace(/\b(north)\b/g, "n")
    .replace(/\b(south)\b/g, "s")
    .replace(/\b(east)\b/g, "e")
    .replace(/\b(west)\b/g, "w")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A quote already on the lead for the same job site, so starting another
 * one is probably an option or a revision, not a second job. Open quotes
 * first, then the newest.
 */
export function sameSiteQuote<Q extends OptionQuote & Partial<Pick<QuoteRequest, "address">>>(
  address: string,
  quotes: Q[]
): Q | null {
  const key = siteKey(address);
  if (key.length < 4) return null;
  const hits = quotes.filter((q) => siteKey(q.address) === key);
  hits.sort(
    (a, b) =>
      Number(Boolean(a.optionClosedAt)) - Number(Boolean(b.optionClosedAt)) ||
      String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  );
  return hits[0] ?? null;
}
