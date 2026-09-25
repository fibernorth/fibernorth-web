// Shared proposal helpers: pricing math and the standard terms that go on
// every proposal. No Firebase imports; safe on client and server.

import type { QuoteLine } from "@/lib/types";

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
