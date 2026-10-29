// Contractor accounts and their jobs, for the Contractors tab on the Leads
// page. Pure (no Firebase), so the page and the tests share one copy.
//
// A contractor account is a lead with isAccount: true, or any lead that has
// jobs under it (older accounts were made before the checkbox existed). Each
// job is its own lead with parentLeadId = the account's id.

import { saleValue, type Lead } from "@/lib/leads";
import { statusOn } from "@/lib/proposal";

/** Stages a job is finished with (not "open"). Same rule as the account header. */
const NOT_OPEN = ["won", "lost", "not_a_lead"];

export interface ContractorTotals {
  /** Every job under the account. */
  jobs: number;
  /** Jobs still being worked (not won, lost or not a lead). */
  open: number;
  /** Won jobs. */
  won: number;
  /** Dollars won: each won job's sale, else its accepted quote's total. */
  wonDollars: number;
  /** Won jobs with no amount on them (left out of wonDollars). */
  wonUnpriced: number;
  /** Jobs finished on site. */
  done: number;
  /** Won jobs on the jobs calendar that aren't done yet. */
  scheduled: number;
}

export interface ContractorGroup {
  account: Lead;
  /** Newest first. */
  jobs: Lead[];
  totals: ContractorTotals;
}

/** Ids of every lead that has a job under it. */
export function parentIdsOf(leads: Array<Pick<Lead, "parentLeadId">>): Set<string> {
  return new Set(leads.map((l) => l.parentLeadId).filter((x): x is string => Boolean(x)));
}

/** A contractor account: checked as one, or has jobs under it. */
export function isContractorAccount(lead: Pick<Lead, "id" | "isAccount">, parentIds: ReadonlySet<string>): boolean {
  return lead.isAccount === true || parentIds.has(lead.id);
}

/** What a won job is worth: the sale typed on it, else the accepted quote's total. */
export function jobValue(job: Pick<Lead, "saleAmount" | "saleAmountNum" | "quote">): number | null {
  const sale = saleValue(job);
  if (sale !== null) return sale;
  const q = job.quote;
  if (q && q.status === "accepted" && typeof q.total === "number" && Number.isFinite(q.total)) return q.total;
  return null;
}

export function contractorTotals(jobs: Lead[]): ContractorTotals {
  const t: ContractorTotals = { jobs: jobs.length, open: 0, won: 0, wonDollars: 0, wonUnpriced: 0, done: 0, scheduled: 0 };
  for (const j of jobs) {
    const stage = String(j.stage || "new");
    if (!NOT_OPEN.includes(stage)) t.open += 1;
    if (stage === "won") {
      t.won += 1;
      const v = jobValue(j);
      if (v === null) t.wonUnpriced += 1;
      else t.wonDollars += v;
      if (j.jobScheduledAt && !j.jobDoneAt) t.scheduled += 1;
    }
    if (j.jobDoneAt) t.done += 1;
  }
  t.wonDollars = Math.round(t.wonDollars * 100) / 100;
  return t;
}

/**
 * Every contractor account with its jobs and totals. Accounts with open jobs
 * come first (most open first), then by name. `leads` should already be the
 * ones this person may see (visibleLeads), so a private job stays hidden.
 */
export function contractorGroups(leads: Lead[]): ContractorGroup[] {
  const parents = parentIdsOf(leads);
  const kids = new Map<string, Lead[]>();
  for (const l of leads) {
    if (!l.parentLeadId || l.parentLeadId === l.id) continue;
    const k = kids.get(l.parentLeadId) || [];
    k.push(l);
    kids.set(l.parentLeadId, k);
  }
  const groups: ContractorGroup[] = [];
  for (const l of leads) {
    if (!isContractorAccount(l, parents)) continue;
    const jobs = (kids.get(l.id) || []).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    groups.push({ account: l, jobs, totals: contractorTotals(jobs) });
  }
  return groups.sort(
    (a, b) =>
      b.totals.open - a.totals.open ||
      (a.account.name || "").localeCompare(b.account.name || "", undefined, { sensitivity: "base" })
  );
}

/** The quote line for a job row: "sent $4,250", "accepted $3,100", "expired", "". */
export function jobQuoteText(job: Pick<Lead, "quote" | "quoteCount">, today: string): { status: string; total: number | null; count: number } {
  const q = job.quote;
  const count = Number(job.quoteCount || (q ? 1 : 0));
  if (!q) return { status: "", total: null, count };
  return { status: statusOn(q, today), total: typeof q.total === "number" ? q.total : null, count };
}
