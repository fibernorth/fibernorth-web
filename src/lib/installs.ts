// The Installs board: every sold job, by the step it's on, from the sale to
// the money in the bank. Pure (no Firebase), so the page and the tests share
// one copy.
//
//   Sold       won, no MISS DIG ticket in yet, not on the calendar
//   Ticket in  ticket entered, not on the calendar yet: schedule it
//   Scheduled  on the jobs calendar, not marked done
//   Done       finished on site, not paid in full: collect
//   Paid       paid in full (the last PAID_DAYS days)
//
// A job is on the furthest step it has reached, so a job put on the
// calendar before its ticket went in shows under Scheduled with a
// "ticket needed" flag. Contractor accounts (isAccount) are not jobs; their
// jobs are their own leads and show here one by one.

import { addDays, parseMoney, type Lead } from "@/lib/leads";
import type { QuoteRequest } from "@/lib/types";

export const INSTALL_STEPS = ["sold", "ticket", "scheduled", "done", "paid"] as const;
export type InstallStep = (typeof INSTALL_STEPS)[number];

export const INSTALL_STEP_LABELS: Record<InstallStep, string> = {
  sold: "Sold",
  ticket: "Ticket in",
  scheduled: "Scheduled",
  done: "Done",
  paid: "Paid",
};

/** What each step is waiting on, shown under its count. */
export const INSTALL_STEP_NEXT: Record<InstallStep, string> = {
  sold: "Enter the MISS DIG ticket",
  ticket: "Put it on the calendar",
  scheduled: "Do the job",
  done: "Collect the money",
  paid: "Finished",
};

/** Paid jobs stay on the board this many days. */
export const PAID_DAYS = 60;

export type TicketState = "in" | "needed" | "none";

type QuoteLike = Pick<QuoteRequest, "id"> &
  Partial<Pick<QuoteRequest, "leadId" | "estimateStatus" | "missDigStatus" | "missDigTicket" | "missDigDigDate" | "address">>;

export interface InstallRow {
  lead: Lead;
  step: InstallStep;
  /** MISS DIG: ticket entered, needed (on the MISS DIG list), or not tracked (sold before the list existed). */
  ticket: TicketState;
  /** The accepted quote whose ticket sheet to open. */
  ticketQuoteId: string;
  sale: number | null;
  cash: number | null;
  /** Scheduled (or finished) and the last scheduled day has passed, not marked done. */
  overdue: boolean;
  /** Done, not marked paid, but the cash collected covers the sale. */
  looksPaid: boolean;
}

export interface InstallBoard {
  rows: Record<InstallStep, InstallRow[]>;
  totals: Record<InstallStep, { count: number; dollars: number }>;
  /** Jobs that need a look today: past their scheduled day, or paid but not marked. */
  attention: number;
}

function saleOf(l: Lead): number | null {
  if (typeof l.saleAmountNum === "number" && Number.isFinite(l.saleAmountNum) && l.saleAmountNum > 0) return l.saleAmountNum;
  const typed = parseMoney(l.saleAmount);
  if (typed !== null && typed > 0) return typed;
  const q = l.quote;
  return q && q.status === "accepted" && typeof q.total === "number" && q.total > 0 ? q.total : null;
}

/** The step a sold job is on. */
export function installStepOf(l: Pick<Lead, "jobDoneAt" | "paidAt" | "jobScheduledAt">, ticket: TicketState): InstallStep {
  if (l.paidAt) return "paid";
  if (l.jobDoneAt) return "done";
  if (l.jobScheduledAt) return "scheduled";
  return ticket === "in" ? "ticket" : "sold";
}

/** Whether a lead is a sold job for the board (not a contractor account). */
export function isInstallJob(l: Pick<Lead, "stage"> & Partial<Pick<Lead, "isAccount">>): boolean {
  return l.stage === "won" && l.isAccount !== true;
}

export function installBoard(leads: Lead[], quotes: QuoteLike[], today: string): InstallBoard {
  const accepted = new Map<string, QuoteLike[]>();
  for (const q of quotes) {
    if (!q.leadId || q.estimateStatus !== "accepted") continue;
    const list = accepted.get(q.leadId) ?? [];
    list.push(q);
    accepted.set(q.leadId, list);
  }
  const paidCutoff = addDays(today, -PAID_DAYS);
  const rows = Object.fromEntries(INSTALL_STEPS.map((s) => [s, [] as InstallRow[]])) as Record<InstallStep, InstallRow[]>;

  for (const l of leads) {
    if (!isInstallJob(l)) continue;
    if (l.paidAt && l.paidAt < paidCutoff) continue;
    const qs = accepted.get(l.id) ?? [];
    const inQ = qs.find((q) => q.missDigStatus === "entered");
    const neededQ = qs.find((q) => q.missDigStatus === "needed");
    const ticket: TicketState = inQ ? "in" : neededQ ? "needed" : "none";
    const step = installStepOf(l, ticket);
    const sale = saleOf(l);
    const cash = parseMoney(l.cashCollected);
    const lastDay = l.jobEndAt || l.jobScheduledAt || "";
    rows[step].push({
      lead: l,
      step,
      ticket,
      ticketQuoteId: (inQ ?? neededQ ?? qs[0])?.id || "",
      sale,
      cash,
      overdue: step === "scheduled" && Boolean(lastDay) && lastDay < today,
      looksPaid: step === "done" && sale !== null && cash !== null && cash + 0.005 >= sale,
    });
  }

  // Oldest work first; on the calendar, soonest day first; paid, newest first.
  const key = (r: InstallRow): string => {
    const l = r.lead;
    if (r.step === "scheduled") return l.jobScheduledAt || "";
    if (r.step === "done") return l.jobDoneAt || "";
    if (r.step === "paid") return l.paidAt || "";
    return l.updatedAt || l.createdAt || "";
  };
  for (const s of INSTALL_STEPS) {
    rows[s].sort((a, b) => (s === "paid" ? key(b).localeCompare(key(a)) : key(a).localeCompare(key(b))));
  }

  const totals = Object.fromEntries(
    INSTALL_STEPS.map((s) => [
      s,
      {
        count: rows[s].length,
        dollars: Math.round(rows[s].reduce((t, r) => t + (r.sale ?? 0), 0) * 100) / 100,
      },
    ])
  ) as InstallBoard["totals"];
  const attention = rows.scheduled.filter((r) => r.overdue).length + rows.done.filter((r) => r.looksPaid).length;
  return { rows, totals, attention };
}
