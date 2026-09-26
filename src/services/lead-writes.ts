// Server-side lead writes (Admin SDK). Every history line is appended with
// FieldValue.arrayUnion so two writers (the card, the sheet sync, a customer
// accepting a quote, the voice assistant) never erase each other's entries,
// and stage / contact-date rules are decided inside a transaction against
// the fresh document instead of the browser's copy.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  DISQUALIFY_REASONS,
  LeadSaveRefused,
  STAGE_LABELS,
  isLeadStage,
  leadSaveRules,
  reopenPatch,
  todayISO,
  type Lead,
  type LeadActivity,
  type LeadStage,
} from "@/lib/leads";
import { cadencePatch } from "@/lib/cadence";

/** Fields the lead card and the assistant may change. */
export const EDITABLE_LEAD_FIELDS = new Set<string>([
  "name",
  "phone",
  "email",
  "address",
  "serviceType",
  "source",
  "stage",
  "nextAction",
  "nextActionAt",
  "lastContactAt",
  "contactEveryDays",
  "contactName",
  "appointmentAt",
  "appointmentTime",
  "objection",
  "cashCollected",
  "saleAmount",
  "notes",
  "disqualifyReason",
  "disqualifiedAt",
  "jobDoneAt",
  "referredBy",
  "referralFeePct",
  "referralFeeStatus",
  "referralFeePaidAt",
]);

/** Fields that hold a calendar day (YYYY-MM-DD) or blank. */
const DAY_FIELDS = new Set(["nextActionAt", "lastContactAt", "appointmentAt", "jobDoneAt", "referralFeePaidAt"]);

export function isValidDay(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * Keep only fields the card and the assistant may change, with the right
 * shapes. Throws LeadSaveRefused for an unknown stage or a badly formed date,
 * so a bad value is refused instead of saved.
 */
export function cleanLeadPatch(patch: Record<string, unknown>): Partial<Lead> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!EDITABLE_LEAD_FIELDS.has(k) || v === undefined) continue;
    if (k === "contactEveryDays") {
      const n = Number(v);
      out[k] = Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 3650) : 0;
    } else if (k === "referralFeePct") {
      const n = Number(v);
      out[k] = Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : 10;
    } else if (k === "referralFeeStatus") out[k] = v === "paid" ? "paid" : "owed";
    else if (k === "referredBy") out[k] = typeof v === "string" && !v.includes("/") ? v.slice(0, 200) : "";
    else if (k === "stage") {
      if (!isLeadStage(v)) throw new LeadSaveRefused(`Unknown stage "${String(v).slice(0, 40)}"`);
      out[k] = v;
    } else if (DAY_FIELDS.has(k)) {
      const d = v === null ? "" : typeof v === "string" ? v.trim() : null;
      if (d === null || (d !== "" && !isValidDay(d))) {
        throw new LeadSaveRefused(`${k} must be a date like 2026-10-02`);
      }
      out[k] = d;
    } else if (k === "appointmentTime") {
      const t = v === null ? "" : typeof v === "string" ? v.trim() : null;
      if (t === null || (t !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) {
        throw new LeadSaveRefused("appointmentTime must be a time like 14:30");
      }
      out[k] = t;
    } else if (k === "disqualifiedAt") {
      const t = v === null ? "" : typeof v === "string" ? v.trim() : "";
      out[k] = t === "" || !isNaN(new Date(t).getTime()) ? t.slice(0, 40) : new Date().toISOString();
    } else if (k === "disqualifyReason") {
      const r = v === null ? "" : String(v).trim();
      out[k] = r === "" || (DISQUALIFY_REASONS as readonly string[]).includes(r) ? r : "other";
    } else if (typeof v === "string") out[k] = v.slice(0, 5000);
    else if (v === null) out[k] = "";
    else continue; // only strings / numbers belong in these fields
  }
  return out as Partial<Lead>;
}

export interface SaveLeadOptions {
  /** false for writes that must not gate the sheet write-back (imports). */
  touched?: boolean;
  /**
   * The stage the card showed when this save was made. A stage change is
   * refused when the lead has moved since (a save queued offline must not
   * undo a customer's acceptance).
   */
  expectStage?: string;
  /** Reopen a closed-out lead: the stage is decided here, from the lead. */
  reopen?: boolean;
}

/**
 * Save a patch and (optionally) one history line on a lead. Returns what was
 * written. Throws "Lead not found" when the lead is gone, and
 * LeadSaveRefused when the stage rules say no.
 */
export async function saveLeadServer(
  db: Firestore,
  leadId: string,
  patch: Partial<Lead> | ((fresh: Lead) => Partial<Lead>),
  activity?: LeadActivity,
  opts: SaveLeadOptions = {}
): Promise<Partial<Lead>> {
  const ref = db.collection("leads").doc(leadId);
  const now = new Date().toISOString();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Lead not found");
    const fresh = { id: snap.id, ...snap.data() } as Lead;
    const today = todayISO();
    let p = typeof patch === "function" ? patch(fresh) : patch;
    let entry = activity;
    if (opts.reopen) {
      // Already open (a replayed or double-tapped Reopen): nothing to do.
      if (fresh.stage !== "lost" && fresh.stage !== "not_a_lead") return {};
      p = reopenPatch(fresh, today);
      const label = STAGE_LABELS[p.stage as LeadStage] ?? p.stage;
      entry = { ts: activity?.ts || now, type: "stage", text: `Reopened (back to ${label})`, ...(activity?.via ? { via: activity.via } : {}) };
    }
    if (
      opts.expectStage &&
      p.stage !== undefined &&
      fresh.stage !== opts.expectStage &&
      fresh.stage !== p.stage
    ) {
      const label = STAGE_LABELS[fresh.stage as LeadStage] ?? fresh.stage;
      throw new LeadSaveRefused(`Stage not changed: this lead is ${label} now (it changed after this save was made).`);
    }
    const rules = leadSaveRules(fresh, p, entry, today, now);
    const out = rules.patch;
    // Follow-up schedule: the next suggested step becomes the next action,
    // unless Bill set his own for a later day (src/lib/cadence.ts).
    Object.assign(out, cadencePatch(fresh, p, out, entry, today));
    const write: Record<string, unknown> = { ...out, updatedAt: now };
    if (opts.touched !== false) write.touched = true;
    const lines = [...(entry ? [entry] : []), ...rules.notes];
    if (lines.length) write.activity = FieldValue.arrayUnion(...lines);
    tx.update(ref, write);
    return out;
  });
}

/** Append history lines (plus any plain fields) without rewriting the array. */
export function activityAppend(...entries: LeadActivity[]): FieldValue {
  return FieldValue.arrayUnion(...entries);
}
