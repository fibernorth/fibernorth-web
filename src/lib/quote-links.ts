// Which lead a quote belongs to. Pure (no Firebase), so the website quote
// route, the Quotes list and the tests share one copy.
//
// The link is two-way: quote.leadId names the lead, and the lead's quoteId
// names its headline quote (plus quoteCount). Website quotes imported before
// the two-way link only have the lead's side (lead.quoteId, or the lead's
// externalId "quote:<id>"), so both are read here.

import { phoneKey, type Lead } from "@/lib/leads";

type LeadForMatch = Pick<Lead, "id"> &
  Partial<Pick<Lead, "name" | "phone" | "email" | "isAccount" | "parentLeadId" | "stage">>;

export interface WebsiteLeadMatch {
  id: string;
  stage: string;
  by: "phone" | "email";
}

/**
 * The existing lead a new website quote request goes on: someone already in
 * the pipeline with the same phone (last 10 digits) or email (any case).
 * Only one clear match counts. Several matches, or a match that is a
 * contractor account or a job under one (they share the contractor's phone),
 * give null: a new lead is made and the Leads page offers a merge.
 */
export function matchLeadForWebsiteQuote(leads: LeadForMatch[], who: { phone?: string; email?: string }): WebsiteLeadMatch | null {
  const p = phoneKey(who.phone || "");
  const e = (who.email || "").trim().toLowerCase();
  const hits = leads.filter(
    (l) => (p && phoneKey(l.phone || "") === p) || (e && (l.email || "").trim().toLowerCase() === e)
  );
  if (hits.length !== 1) return null;
  const l = hits[0];
  if (l.isAccount || l.parentLeadId) return null;
  const by = p && phoneKey(l.phone || "") === p ? "phone" : "email";
  return { id: l.id, stage: String(l.stage || "new"), by };
}

export interface LeadIndex<L extends Pick<Lead, "id">> {
  byId: Map<string, L>;
  /** Quote id -> the lead that points at it (lead.quoteId or externalId "quote:<id>"). */
  byQuoteId: Map<string, L>;
}

export function indexLeads<L extends Pick<Lead, "id"> & Partial<Pick<Lead, "quoteId" | "externalId">>>(leads: L[]): LeadIndex<L> {
  const byId = new Map<string, L>();
  const byQuoteId = new Map<string, L>();
  for (const l of leads) {
    byId.set(l.id, l);
    if (l.quoteId) byQuoteId.set(l.quoteId, l);
    if (typeof l.externalId === "string" && l.externalId.startsWith("quote:")) {
      const qid = l.externalId.slice(6);
      if (qid && !byQuoteId.has(qid)) byQuoteId.set(qid, l);
    }
  }
  return { byId, byQuoteId };
}

/** The lead a quote belongs to, or null when it has none (or its lead is gone). */
export function leadOfQuote<L extends Pick<Lead, "id">>(q: { id: string; leadId?: string }, index: LeadIndex<L>): L | null {
  if (q.leadId) {
    const l = index.byId.get(q.leadId);
    if (l) return l;
  }
  return index.byQuoteId.get(q.id) ?? null;
}

export interface LeadSuggestion<L> {
  lead: L;
  /** Why it is offered: "same phone", "same email", "same name", "same address". */
  why: string;
}

const norm = (s: string | undefined) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Leads to offer when attaching a quote that has none: same phone first,
 * then same email, same name, same street address. Contractor accounts are
 * offered too (a contractor's quote may belong on the account or a job).
 */
export function suggestLeadsForQuote<L extends LeadForMatch & Partial<Pick<Lead, "address">>>(
  q: { phone?: string; email?: string; name?: string; address?: string },
  leads: L[],
  limit = 5
): Array<LeadSuggestion<L>> {
  const p = phoneKey(q.phone || "");
  const e = (q.email || "").trim().toLowerCase();
  const n = norm(q.name);
  const street = norm((q.address || "").split(",")[0]);
  const scored: Array<{ lead: L; why: string; rank: number }> = [];
  for (const l of leads) {
    if (p && phoneKey(l.phone || "") === p) scored.push({ lead: l, why: "same phone", rank: 0 });
    else if (e && (l.email || "").trim().toLowerCase() === e) scored.push({ lead: l, why: "same email", rank: 1 });
    else if (n.length >= 3 && norm(l.name) === n) scored.push({ lead: l, why: "same name", rank: 2 });
    else if (street.length >= 6 && norm((l.address || "").split(",")[0]) === street)
      scored.push({ lead: l, why: "same address", rank: 3 });
  }
  return scored
    .sort((a, b) => a.rank - b.rank || (a.lead.name || "").localeCompare(b.lead.name || ""))
    .slice(0, limit)
    .map(({ lead, why }) => ({ lead, why }));
}
