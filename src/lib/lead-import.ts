// Pure helpers for the one-click lead imports (no Firebase here, so they
// can be tested).

import type { LeadActivity } from "@/lib/leads";
import { leadQuoteRollup, sentTotalOf, type QuoteForRollup } from "@/lib/proposal";
import type { QuoteRequest } from "@/lib/types";

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** externalId used when a contractor or campground was imported. */
export function letterExternalId(kind: "contractor" | "campground", name: string, address: string): string {
  return `${kind}:${slug(name)}:${slug(address).slice(0, 24)}`;
}

/** A row of a mailing list in marketing/ (the merge-print input). */
export interface MailingRow {
  Company_Name?: string;
  Campground_Name?: string;
  Address: string;
  City: string;
  State: string;
  Zip: string;
}

/**
 * externalIds of everyone on a mailing list, built the same way the import
 * built them ("<street>, <city>, <state> <zip>"), so a letter is logged only
 * on the people who actually got it.
 */
export function mailingListIds(kind: "contractor" | "campground", rows: MailingRow[]): Set<string> {
  return new Set(
    rows.map((r) =>
      letterExternalId(
        kind,
        (kind === "contractor" ? r.Company_Name : r.Campground_Name) || "",
        `${r.Address}, ${r.City}, ${r.State} ${r.Zip}`
      )
    )
  );
}

/**
 * Fields to write when logging a mailed letter on an existing lead, or null
 * when it's already logged. Never clears the next action Bill set; only a
 * "Mail letter N" reminder is cleared, since the letter went out.
 */
export function letterLogPatch(
  lead: { activity?: LeadActivity[]; lastContactAt?: string; nextAction?: string },
  entry: LeadActivity,
  date: string
): { lastContactAt?: string; nextAction?: string; nextActionAt?: string } | null {
  if ((lead.activity || []).some((a) => a.type === "letter" && a.text === entry.text)) return null;
  const patch: { lastContactAt?: string; nextAction?: string; nextActionAt?: string } = {};
  if (!lead.lastContactAt || lead.lastContactAt < date) patch.lastContactAt = date;
  if (/^mail letter\b/i.test((lead.nextAction || "").trim())) {
    patch.nextAction = "";
    patch.nextActionAt = "";
  }
  return patch;
}

/**
 * Should a website quote become a new lead? Not when a lead already came
 * from it, and not when it was made from an existing lead (its leadId
 * points at a lead that exists).
 */
export function quoteNeedsLead(
  quote: { id: string; leadId?: string },
  existing: { externalIds: Set<string>; leadIds: Set<string>; quoteIds: Set<string> }
): boolean {
  if (existing.externalIds.has(`quote:${quote.id}`)) return false;
  if (quote.leadId && existing.leadIds.has(quote.leadId)) return false;
  if (existing.quoteIds.has(quote.id)) return false;
  return true;
}

/**
 * The lead for a website quote that has none yet. Stage follows where the
 * quote got to: accepted is won (sale = what was accepted), sent or opened is
 * quoted with a follow-up due today; otherwise the old status field decides.
 * The badge names the quote, like every other badge.
 */
export function leadFromWebsiteQuote(
  q: QuoteForRollup & Partial<Pick<QuoteRequest, "name" | "phone" | "email" | "address" | "serviceType" | "description" | "notes" | "status">>,
  now: string,
  today: string
): Record<string, unknown> {
  const createdAt = String(q.createdAt || now);
  const est = q.estimateStatus || "";
  const sent = !!q.version && !!q.sentAt;
  const status = String(q.status || "new");
  const stage =
    sent && est === "accepted"
      ? "won"
      : sent && ["sent", "viewed", "declined", "expired"].includes(est)
        ? "quoted"
        : status === "quoted"
          ? "quoted"
          : status === "contacted"
            ? "contacted"
            : status === "closed"
              ? "lost"
              : "new";
  const activity: LeadActivity[] = [{ ts: createdAt, type: "system", text: "Quote request from the website (imported)" }];
  const sale = stage === "won" ? sentTotalOf(q) : null;
  if (stage === "won") {
    // Dates the win from the acceptance, not the import (wonDateOf reads this).
    activity.push({ ts: q.acceptedAt || q.sentAt || now, type: "stage", text: "Moved to Won (quote accepted before import)" });
  }
  const r = leadQuoteRollup([q], today);
  const next =
    stage === "new"
      ? { nextAction: "Call back", nextActionAt: today }
      : stage === "quoted" && sent
        ? { nextAction: "Follow up on quote", nextActionAt: today }
        : stage === "won"
          ? { nextAction: "Schedule the job", nextActionAt: today }
          : { nextAction: "", nextActionAt: "" };
  return {
    name: q.name || "",
    phone: q.phone || "",
    email: q.email || "",
    address: q.address || "",
    serviceType: q.serviceType || "",
    source: "website",
    externalId: `quote:${q.id}`,
    quoteId: q.id,
    quoteCount: 1,
    ...(r.quote ? { quote: r.quote } : {}),
    sourceNotes: q.description || "",
    notes: q.notes || "",
    leadAt: createdAt,
    stage,
    ...next,
    ...(sale !== null ? { saleAmount: sale.toFixed(2), saleAmountNum: sale } : {}),
    activity,
    touched: false,
    createdAt,
    updatedAt: now,
  };
}

// ---- Bulk runs (dry run, apply, undo) -----------------------------------

/** How many names a preview lists per bucket. */
export const IMPORT_EXAMPLES = 20;

/** A history line written by an import run, stamped with the run's id. */
export type BatchedActivity = LeadActivity & { batchId: string };

/** The fields a letter log may change, as stored on the run for undo (null = was blank). */
export interface LetterFields {
  lastContactAt?: string | null;
  nextAction?: string | null;
  nextActionAt?: string | null;
}

export interface ImportParams {
  source: "quotes" | "campgrounds" | "contractors";
  letter?: number;
  date?: string;
}

export interface ImportCounts {
  create: number;
  update: number;
  skip: number;
}

export interface ImportPreview {
  dryRun: true;
  params: ImportParams;
  counts: ImportCounts;
  /** Up to IMPORT_EXAMPLES names per bucket. */
  examples: { create: string[]; update: string[]; skip: string[] };
  notOnList: number;
  total: number;
  recipients: number | null;
}

export interface ImportRunSummary {
  id: string;
  kind: "letter" | "import";
  source: string;
  letter: number | null;
  date: string | null;
  by: string;
  at: string;
  status: string;
  counts: ImportCounts;
  undoneAt: string | null;
  undo: { entriesRemoved: number; datesRestored: number; leadsRemoved: number; skipped: Array<{ name: string; reason: string }> } | null;
}

const WHO: Record<ImportParams["source"], string> = {
  quotes: "website quotes",
  campgrounds: "campgrounds",
  contractors: "contractors",
};

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[m - 1]} ${d}`;
}

/** The confirm question for a previewed run ("Log letter 2 on 217 contractors dated Oct 2?"). */
export function confirmQuestion(p: Pick<ImportPreview, "params" | "counts">): string {
  const { params, counts } = p;
  if (params.source === "quotes") return `Add ${counts.create} lead${counts.create === 1 ? "" : "s"} from website quotes?`;
  if (params.letter) {
    const n = counts.update + counts.create;
    const added = counts.create ? ` (${counts.create} of them new leads)` : "";
    return `Log letter ${params.letter} on ${n} ${WHO[params.source]}${added} dated ${shortDate(params.date || "")}?`;
  }
  return `Add ${counts.create} ${WHO[params.source]}?`;
}

/** One line describing a past run for the Undo list. */
export function runLabel(r: Pick<ImportRunSummary, "kind" | "source" | "letter" | "date" | "counts">): string {
  const who = WHO[r.source as ImportParams["source"]] || r.source;
  if (r.kind === "letter" && r.letter) {
    const n = r.counts.update + r.counts.create;
    return `Letter ${r.letter} logged on ${n} ${who}, dated ${shortDate(r.date || "")}${r.counts.create ? ` (${r.counts.create} added)` : ""}`;
  }
  return `Added ${r.counts.create} ${who}`;
}

/** Split into chunks of at most n (Firestore batches take 500 writes). */
export function chunk<T>(items: T[], n = 400): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}
