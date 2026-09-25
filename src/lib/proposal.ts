// Shared proposal helpers: pricing math and the standard terms that go on
// every proposal. No Firebase imports; safe on client and server.

import type { MapAnnotation, Proposal, QuoteLine } from "@/lib/types";

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
