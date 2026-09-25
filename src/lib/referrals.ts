// Referral partners: a contractor (or anyone) who sends FiberNorth a job
// gets a cut of the sale, 10% unless set otherwise. The partner is a lead
// too (contractors come in from the letter campaign), and a referred job
// points at it with referredBy. Pure helpers; no Firebase.

import { saleValue, type Lead } from "@/lib/leads";

export const DEFAULT_REFERRAL_PCT = 10;

/** Sources whose leads are partners by default in the picker. */
export const PARTNER_SOURCES = new Set(["contractor-letter"]);

type RefLead = Pick<Lead, "stage" | "saleAmount" | "saleAmountNum"> &
  Partial<Pick<Lead, "referredBy" | "referralFeePct" | "referralFeeStatus" | "referralFeePaidAt">>;

export function feePct(lead: Pick<Lead, "referralFeePct">): number {
  const n = Number(lead.referralFeePct);
  return lead.referralFeePct === undefined || lead.referralFeePct === null || !Number.isFinite(n) || n < 0
    ? DEFAULT_REFERRAL_PCT
    : n;
}

export interface ReferralFee {
  pct: number;
  sale: number;
  amount: number;
  status: "owed" | "paid";
  paidAt?: string;
}

/**
 * The partner's fee on a won, referred job: sale x pct. Null when the job
 * isn't referred, isn't won, or has no sale amount yet.
 */
export function referralFee(lead: RefLead): ReferralFee | null {
  if (!lead.referredBy || lead.stage !== "won") return null;
  const sale = saleValue(lead);
  if (sale === null || sale <= 0) return null;
  const pct = feePct(lead);
  return {
    pct,
    sale,
    amount: Math.round(sale * pct) / 100,
    status: lead.referralFeeStatus === "paid" ? "paid" : "owed",
    ...(lead.referralFeePaidAt ? { paidAt: lead.referralFeePaidAt } : {}),
  };
}

export interface PartnerStats {
  /** Jobs this partner sent (not counting ones marked "not a lead"). */
  referred: number;
  won: number;
  /** Dollars of won work they sent. */
  dollars: number;
  feesOwed: number;
  feesPaid: number;
}

export function partnerStats(partnerId: string, leads: Array<RefLead & Pick<Lead, "id">>): PartnerStats {
  const out: PartnerStats = { referred: 0, won: 0, dollars: 0, feesOwed: 0, feesPaid: 0 };
  if (!partnerId) return out;
  for (const l of leads) {
    if (l.referredBy !== partnerId || l.id === partnerId || l.stage === "not_a_lead") continue;
    out.referred += 1;
    if (l.stage !== "won") continue;
    out.won += 1;
    out.dollars += saleValue(l) ?? 0;
    const fee = referralFee(l);
    if (fee) {
      if (fee.status === "paid") out.feesPaid += fee.amount;
      else out.feesOwed += fee.amount;
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { ...out, dollars: r2(out.dollars), feesOwed: r2(out.feesOwed), feesPaid: r2(out.feesPaid) };
}

/** Name to show for a partner: company plus the person we talk to. */
export function partnerName(p: Pick<Lead, "name"> & Partial<Pick<Lead, "contactName">>): string {
  const name = (p.name || "").trim() || "(no name)";
  const who = (p.contactName || "").trim();
  return who && who !== name ? `${name} (${who})` : name;
}

/**
 * Partner picker search. Partners first (contractor-letter leads and anyone
 * already credited with a referral), then, once something is typed, any
 * other lead that matches. Never the lead itself.
 */
export function searchPartners<T extends Pick<Lead, "id" | "name" | "source"> & Partial<Pick<Lead, "contactName" | "phone" | "address" | "referredBy" | "stage">>>(
  leads: T[],
  query: string,
  selfId: string,
  limit = 8
): T[] {
  const credited = new Set(leads.map((l) => l.referredBy).filter(Boolean) as string[]);
  const isPartner = (l: T) => PARTNER_SOURCES.has(String(l.source)) || credited.has(l.id);
  const q = query.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");
  const matches = (l: T) =>
    !q ||
    [l.name, l.contactName, l.address].join(" ").toLowerCase().includes(q) ||
    (digits.length >= 3 && (l.phone || "").replace(/\D/g, "").includes(digits));
  const pool = leads.filter((l) => l.id !== selfId && l.stage !== "not_a_lead" && matches(l));
  const partners = pool.filter(isPartner);
  const others = q ? pool.filter((l) => !isPartner(l)) : [];
  const byName = (a: T, b: T) => (a.name || "").localeCompare(b.name || "");
  return [...partners.sort(byName), ...others.sort(byName)].slice(0, limit);
}
