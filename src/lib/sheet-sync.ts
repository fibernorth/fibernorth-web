// Pure helpers for the Google Sheet lead sync (src/app/api/leads/sync):
// what to write back into the marketing firm's tracker columns, and how to
// read their cells. No Firebase here, so it can be tested directly.

import {
  formatLogForSheet,
  latestLog,
  nurturePatch,
  parseMoney,
  sheetColumnsFromLead,
  type Lead,
  type LeadStage,
} from "@/lib/leads";

export const SHEET_COLS = ["notes", "answered", "booked", "taken", "converted", "objection", "cash", "sale"] as const;
export type SheetCol = (typeof SHEET_COLS)[number];

export const COL_LABELS: Record<SheetCol, string> = {
  notes: "NOTES",
  answered: "Lead Answered",
  booked: "Booked Appointment",
  taken: "Taken Appointment",
  converted: "Client Converted",
  objection: "Objection",
  cash: "Cash Collected",
  sale: "Total Sale",
};

/** YYYY-MM-DD from the sheet's Date cell ("9/20/2026", "2026-09-20", "Sep 20, 2026"), or "". */
export function sheetDay(date: string): string {
  const s = (date || "").trim();
  if (!s) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  let y = 0;
  let m = 0;
  let d = 0;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (us) [m, d, y] = [Number(us[1]), Number(us[2]), Number(us[3].length === 2 ? `20${us[3]}` : us[3])];
  else {
    const t = Date.parse(s);
    if (isNaN(t)) return "";
    const dt = new Date(t);
    [y, m, d] = [dt.getFullYear(), dt.getMonth() + 1, dt.getDate()];
  }
  const out = `${y}-${pad(m)}-${pad(d)}`;
  const check = new Date(`${out}T12:00:00Z`);
  return !isNaN(check.getTime()) && check.toISOString().slice(0, 10) === out ? out : "";
}

/** Next action for a lead at this stage when the sheet puts it there. */
export function followUpFor(stage: LeadStage, today: string): Partial<Lead> {
  if (stage === "new") return { nextAction: "Call back", nextActionAt: today, nextActionAuto: false };
  if (stage === "nurture") return { ...nurturePatch({}, today), nextActionAuto: false };
  if (stage === "won" || stage === "lost" || stage === "not_a_lead") {
    return { nextAction: "", nextActionAt: "", nextActionAuto: false };
  }
  // Contacted / walk / quoted from the firm's columns: on today's list so
  // Bill picks it up, instead of sitting with no date forever.
  return { nextAction: "Check back", nextActionAt: today, nextActionAuto: false };
}

export const norm = (v: string | undefined) => (v || "").trim();

/** Same cell value, allowing for the sheet's formatting ("$4,250.00" = "4250"). */
export function sameValue(col: SheetCol, a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (x === y) return true;
  if (col === "cash" || col === "sale") {
    const nx = parseMoney(x);
    const ny = parseMoney(y);
    return nx !== null && nx === ny;
  }
  if (col !== "notes" && col !== "objection") return x.toLowerCase() === y.toLowerCase();
  return false;
}

/** The firm's tracker cells for one row, as the script read them. */
export type SheetCells = Record<SheetCol, string>;

/**
 * The cells to write for a touched lead. Only fills blanks or moves a status
 * forward in cells the firm filled; in a cell we wrote (confirmed, and still
 * showing exactly that) the lead's value goes in even when it's lower or
 * blank. NOTES shows the latest CRM log, but a note that came from the
 * sheet is never written back (it's already there, in full).
 */
export function writeBackSet(lead: Lead, row: SheetCells): Record<string, string> {
  const want = sheetColumnsFromLead(lead);
  const owned = lead.sheetOwned || {};
  const ours = (col: SheetCol) => owned[col] !== undefined && norm(owned[col].value) === norm(row[col]);
  const rank = (v: string) => {
    const s = (v || "").trim().toLowerCase();
    if (!s) return 0;
    if (s === "no") return 1;
    if (s.startsWith("long")) return 2;
    if (s.startsWith("y")) return 3;
    return 1;
  };
  const set: Record<string, string> = {};
  for (const col of ["answered", "booked", "taken", "converted"] as const) {
    const w = want[col];
    const h = row[col];
    if (sameValue(col, w, h)) continue;
    if (ours(col)) set[col] = w;
    else if (w && rank(w) > rank(h)) set[col] = w; // forward only
  }
  for (const col of ["objection", "cash", "sale"] as const) {
    const w = want[col];
    const h = row[col];
    if (sameValue(col, w, h)) continue;
    if (ours(col)) set[col] = w;
    else if (w && !norm(h)) set[col] = w; // fill blanks only
  }
  const newest = latestLog(lead);
  if (newest && newest.via !== "sheet") {
    const text = formatLogForSheet(newest);
    if (text && text !== norm(row.notes)) set.notes = text;
  }
  return set;
}

// ---- The sheet is the master list for Meta ads leads ---------------------
// The marketing firm's sheet is the true list of ad leads (the CRM holds
// those plus letters, website and referral leads). So when the firm edits a
// row, the CRM hears about it even after Bill has worked the lead. We keep
// what the sheet showed last time (sheetSeen) and compare, so a change can
// be told apart from a value that has always differed.

export const SEEN_FIELDS = [
  "name",
  "phone",
  "email",
  "serviceType",
  "answered",
  "booked",
  "taken",
  "converted",
  "objection",
  "cash",
  "sale",
] as const;
export type SeenField = (typeof SEEN_FIELDS)[number];
export type SheetSeen = Partial<Record<SeenField, string>>;

const CONTACT_LABELS = { name: "name", phone: "phone", email: "email" } as const;

export function seenFromRow(row: Record<SeenField, string>): SheetSeen {
  const out: SheetSeen = {};
  for (const f of SEEN_FIELDS) out[f] = norm(row[f]);
  return out;
}

export interface FirmChanges {
  /** Fields to set on the lead. */
  patch: Partial<Pick<Lead, "name" | "phone" | "email" | "serviceType" | "objection" | "cashCollected" | "saleAmount">> & {
    saleAmountNum?: number | null;
  };
  /** History lines describing what the firm changed. */
  lines: string[];
}

/**
 * What the firm changed on a row since the last sync, for a lead Bill has
 * worked. Contact details the firm corrects win (unless Bill already has the
 * same value). Status cells are reported, not applied: Bill's pipeline
 * stage stays his, but he sees the disagreement in the history. Money and
 * objection fill a blank in the CRM, otherwise they're reported.
 * A cell holding exactly what we wrote, or what the CRM already says, is not
 * a firm change. With no sheetSeen yet (first sync after this shipped) only
 * blanks are filled.
 */
export function firmChanges(lead: Lead, row: Record<SeenField, string>): FirmChanges {
  const prev = lead.sheetSeen;
  const patch: FirmChanges["patch"] = {};
  const lines: string[] = [];
  const changed = (f: SeenField) => prev !== undefined && norm(row[f]) !== norm(prev[f]);

  for (const f of ["name", "phone", "email"] as const) {
    const now = norm(row[f]);
    if (!now || now === norm(lead[f])) continue;
    if (!norm(lead[f])) {
      patch[f] = now;
    } else if (changed(f)) {
      patch[f] = now;
      lines.push(`Marketing sheet changed the ${CONTACT_LABELS[f]}: ${norm(lead[f])} → ${now}`);
    }
  }
  if (norm(row.serviceType) && !norm(lead.serviceType)) patch.serviceType = norm(row.serviceType);

  const want = sheetColumnsFromLead(lead);
  const owned = lead.sheetOwned || {};
  const labels: Record<string, string> = COL_LABELS;
  const firmSaid = (col: SheetCol & SeenField) => {
    const v = norm(row[col]);
    if (!v || !changed(col)) return false;
    if (owned[col] && sameValue(col, owned[col].value, v)) return false; // our own write
    if (sameValue(col, want[col as keyof typeof want] || "", v)) return false; // agrees with the CRM
    return true;
  };

  for (const col of ["answered", "booked", "taken", "converted"] as const) {
    if (firmSaid(col)) lines.push(`Marketing sheet: ${labels[col]} set to ${norm(row[col])}`);
  }
  const money: Array<[SheetCol & SeenField, "objection" | "cashCollected" | "saleAmount"]> = [
    ["objection", "objection"],
    ["cash", "cashCollected"],
    ["sale", "saleAmount"],
  ];
  for (const [col, field] of money) {
    const v = norm(row[col]);
    if (!v) continue;
    // A value we wrote there ourselves is the CRM's old value, not the firm's.
    if (owned[col] && sameValue(col, owned[col].value, v)) continue;
    if (!norm(lead[field])) {
      // Only a value the firm just entered: an old cell could be a value the
      // CRM itself wrote and has since cleared (an undone acceptance).
      if (!changed(col)) continue;
      patch[field] = v;
      if (field === "saleAmount") patch.saleAmountNum = parseMoney(v);
      lines.push(`Marketing sheet: ${labels[col]} set to ${v}`);
    } else if (firmSaid(col)) {
      lines.push(`Marketing sheet: ${labels[col]} set to ${v} (the CRM has ${norm(lead[field])})`);
    }
  }
  return { patch, lines };
}

/** True when the sheet showed something different last time (or never recorded). */
export function seenChanged(lead: Lead, next: SheetSeen): boolean {
  const prev = lead.sheetSeen || {};
  return SEEN_FIELDS.some((f) => norm(prev[f]) !== norm(next[f]));
}
