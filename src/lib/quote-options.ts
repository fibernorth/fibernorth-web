// Options on one quote: the same customer and job site priced more than one
// way ("Option A: 1-1/4 in conduit", "Option B: 2 in with a pull box").
// Each option is its own quote (own lines, own drawing, own link), joined by
// optionGroup, which is the id of the quote the first option was copied
// from. Accepting one option closes the others in its group, so a customer
// can't sign two and the sale is the option they picked. Pure: shared by
// the server actions, the respond route and the tests.

import type { QuoteRequest } from "@/lib/types";

type OptionQuote = Pick<QuoteRequest, "id"> & Partial<Pick<QuoteRequest, "optionGroup" | "optionLabel" | "createdAt">>;

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
] as const satisfies ReadonlyArray<keyof QuoteRequest>;

export function optionCopyOf(source: Partial<QuoteRequest>): Partial<QuoteRequest> {
  const out: Record<string, unknown> = {};
  for (const k of OPTION_COPY_FIELDS) {
    const v = source[k];
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<QuoteRequest>;
}

/** Statuses of an option that accepting another option closes. */
export function closesOnOtherAccept(status: string | null | undefined): boolean {
  return status === "sent" || status === "viewed" || status === "declined" || status === "expired";
}
