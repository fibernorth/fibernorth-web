// Turning what Bore-ON read back into quote lines. Pure.
//
// When the designer's rate card priced the design, its lines become ours
// (work and materials, plus margin and contingency as work lines, so the
// customer's total matches what Bore-ON shows). When Bore-ON had no rate
// card, the bore length alone goes through our price rules
// (src/lib/quote-rules.ts, with the quote's crew). Sales tax is
// never copied: the proposal applies Michigan's 6% to material lines itself.
//
// Generated lines are marked `source: "auto"` with a stable key. A re-sync
// replaces the auto lines and keeps every line the estimator typed or edited.
// An auto line is left out when the estimator already holds its key (he
// edited that line, so it is his now), and the rate-sheet bore is left out
// when one of his work lines already prices the bore. Otherwise the bore
// gets counted twice. Lines from the price rules ("rules:*") belong to the
// workbench, not Bore-ON: a re-sync keeps them, they count as pricing the
// bore, and with them only Bore-ON's material lines are taken.

import type { QuoteLine } from "@/lib/types";
import { DRAWING_BORE_KEY } from "@/lib/pricing";
import { DEFAULT_PRICING_RULES, isRuleKey, quoteRules, type PricingRules } from "@/lib/quote-rules";
import type { BoreOnReadbackResult } from "./types";

export interface Reprice {
  /** The quote's lines after the sync: the estimator's own, then the generated ones. */
  lines: QuoteLine[];
  /** Just the generated lines. */
  autoLines: QuoteLine[];
  /** Where the numbers came from. */
  source: "bore-on" | "rate-sheet";
  /** Work Bore-ON could not price (no rule), for the estimator to add by hand. */
  uncovered: string[];
  /** Generated lines left out because the estimator's own lines already cover them. */
  skipped: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/** A line a Bore-ON sync generated (and replaces on the next sync). */
export const isAutoLine = (l: QuoteLine) => l.source === "auto" && !isRuleKey(l.key);

/** What the rate-sheet fallback prices with: the owner's rules and the quote's crew. */
export interface RepriceOptions {
  rules?: PricingRules;
  people?: number | null;
  days?: number | null;
}

/** One of the estimator's work lines already prices the bore itself. */
export function coversBore(l: QuoteLine): boolean {
  if (l.kind === "material") return false;
  if (isRuleKey(l.key)) return true;
  if (isAutoLine(l)) return false;
  if (l.key === DRAWING_BORE_KEY || l.key === "rate-sheet:bore" || l.key?.startsWith("bore-on:work:")) return true;
  return /\bbor(e|ed|es|ing)\b|directional/i.test(l.description || "");
}

function autoLinesFor(result: BoreOnReadbackResult, opts: RepriceOptions): Pick<Reprice, "autoLines" | "source" | "uncovered"> | null {
  const est = result.estimate;
  if (est && (est.lines.length || est.materialLines.length)) {
    const autoLines: QuoteLine[] = [];
    const push = (kind: QuoteLine["kind"], description: string, amount: number, key: string) =>
      autoLines.push({ description: description.slice(0, 300), kind, qty: 1, unitPrice: round2(amount), source: "auto", key });
    est.lines.forEach((l, i) => {
      if (!positive(l.total)) return;
      push("work", `${l.description} (${positive(l.quantity) ? l.quantity : 1} ${l.unit})`, l.total, `bore-on:work:${i}`);
    });
    est.materialLines.forEach((l, i) => {
      if (!positive(l.total)) return;
      push("material", `${l.description} (${positive(l.quantity) ? l.quantity : 1} ${l.unit})`, l.total, `bore-on:material:${i}`);
    });
    if (positive(est.marginAmount)) push("work", "Margin", est.marginAmount, "bore-on:margin");
    if (positive(est.contingencyAmount)) push("work", "Contingency", est.contingencyAmount, "bore-on:contingency");
    if (autoLines.length) {
      return { autoLines, source: "bore-on", uncovered: est.uncovered.map((u) => `${u.label} × ${u.quantity} ${u.unit}`) };
    }
  }
  const feet = Math.round(positive(result.boreLengthFt) ? result.boreLengthFt : 0);
  if (feet <= 0) return null;
  const rules = opts.rules ?? DEFAULT_PRICING_RULES;
  const people = typeof opts.people === "number" && opts.people > 0 ? opts.people : rules.defaultPeople;
  const days = typeof opts.days === "number" && opts.days > 0 ? opts.days : rules.defaultDays;
  const price = quoteRules({ people, days, lines: [{ feet }] }, rules).labor;
  if (price <= 0) return null;
  return {
    autoLines: [{ description: `Directional bore, ~${feet} ft`, kind: "work", qty: 1, unitPrice: price, source: "auto", key: "rate-sheet:bore" }],
    source: "rate-sheet",
    uncovered: [],
  };
}

export function quoteLinesFromReadback(
  result: BoreOnReadbackResult | null | undefined,
  current: QuoteLine[] | null | undefined = [],
  opts: RepriceOptions = {}
): Reprice | null {
  if (!result) return null;
  const auto = autoLinesFor(result, opts);
  if (!auto) return null;
  const manual = (current ?? []).filter((l) => !isAutoLine(l));
  const heldKeys = new Set(manual.map((l) => l.key).filter(Boolean));
  const boreCovered = auto.source === "rate-sheet" && manual.some(coversBore);
  // The price rules already priced the labor: take Bore-ON's materials only,
  // not its work, margin or contingency, or the labor is counted twice.
  const rulesPriceLabor = auto.source === "bore-on" && manual.some((l) => isRuleKey(l.key));
  const skipped: string[] = [];
  const autoLines = auto.autoLines.filter((l) => {
    const held = !!l.key && heldKeys.has(l.key);
    const drop = held || boreCovered || (rulesPriceLabor && l.kind !== "material");
    if (drop) skipped.push(l.description);
    return !drop;
  });
  return { ...auto, autoLines, skipped, lines: [...manual, ...autoLines] };
}

/**
 * One-line note for the workbench and the lead's history. Given the quote's
 * total before the re-price, the amount reads "old → new".
 */
export function repriceNote(
  r: Pick<Reprice, "source"> & Partial<Pick<Reprice, "autoLines" | "skipped">>,
  total: number,
  previous?: number | null
): string {
  const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const money = typeof previous === "number" && previous !== total ? `${fmt(previous)} → ${fmt(total)}` : fmt(total);
  if (r.autoLines && r.autoLines.length === 0 && r.skipped?.length) {
    return `Bore-ON price left off, your own lines already cover it: ${money}`;
  }
  return r.source === "bore-on"
    ? `Re-priced from the Bore-ON design: ${money}`
    : `Re-priced from the Bore-ON bore length on our rate sheet: ${money}`;
}
