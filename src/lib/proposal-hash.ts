// A fingerprint of exactly what the customer was sent: who it's for, the
// scope, terms, lines, totals, map, plan image, version and good-through
// date. Stored on the proposal at send; the customer's page posts it back
// with Accept, and the acceptance record keeps it, so an acceptance is tied
// to the precise content shown. Server-only (node:crypto).

import { createHash } from "crypto";
import { stableStringify } from "@/lib/proposal";
import type { Proposal } from "@/lib/types";

/** Fields that make up what the customer sees. Status fields are not part of it. */
export function proposalContent(p: Pick<Proposal, "customer" | "scopeText" | "terms" | "lines" | "totals" | "annotation" | "planImageUrl" | "version" | "expiresAt">) {
  return {
    customer: { name: p.customer?.name || "", address: p.customer?.address || "" },
    scopeText: p.scopeText || "",
    terms: p.terms || [],
    lines: p.lines || [],
    totals: p.totals,
    annotation: p.annotation ?? null,
    planImageUrl: p.planImageUrl || "",
    version: p.version,
    expiresAt: p.expiresAt,
  };
}

export function proposalContentHash(p: Parameters<typeof proposalContent>[0]): string {
  return createHash("sha256").update(stableStringify(proposalContent(p))).digest("hex");
}
