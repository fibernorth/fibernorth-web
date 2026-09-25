// Turning what Bore-ON read back into quote lines. Pure.
//
// When the designer's rate card priced the design, its lines become ours
// (work and materials, plus margin and contingency as work lines, so the
// customer's total matches what Bore-ON shows). When Bore-ON had no rate
// card, the bore length alone goes through our own rate sheet. Sales tax is
// never copied: the proposal applies Michigan's 6% to material lines itself.
//
// Generated lines are marked `source: "auto"` with a stable key. A re-sync
// replaces the auto lines and keeps every line the estimator typed or edited.

import type { QuoteLine } from "@/lib/types";
import { ratePrice } from "@/lib/pricing";
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
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

export const isAutoLine = (l: QuoteLine) => l.source === "auto";

function autoLinesFor(result: BoreOnReadbackResult): Pick<Reprice, "autoLines" | "source" | "uncovered"> | null {
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
  const price = ratePrice(feet);
  if (price <= 0) return null;
  return {
    autoLines: [{ description: `Directional bore, ~${feet} ft`, kind: "work", qty: 1, unitPrice: price, source: "auto", key: "rate-sheet:bore" }],
    source: "rate-sheet",
    uncovered: [],
  };
}

export function quoteLinesFromReadback(
  result: BoreOnReadbackResult | null | undefined,
  current: QuoteLine[] | null | undefined = []
): Reprice | null {
  if (!result) return null;
  const auto = autoLinesFor(result);
  if (!auto) return null;
  const manual = (current ?? []).filter((l) => !isAutoLine(l));
  return { ...auto, lines: [...manual, ...auto.autoLines] };
}

/** One-line note for the workbench and the lead's history. */
export function repriceNote(r: Pick<Reprice, "source">, total: number): string {
  const money = total.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return r.source === "bore-on"
    ? `Re-priced from the Bore-ON design: ${money}`
    : `Re-priced from the Bore-ON bore length on our rate sheet: ${money}`;
}
