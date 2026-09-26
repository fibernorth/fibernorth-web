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
import { historyTooBig, planHistoryArchive } from "@/lib/history-size";

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

/** Fields whose changes get their own history line ("Phone: a → b"). */
export const TRACKED_LEAD_FIELDS: Record<string, string> = {
  name: "Name",
  phone: "Phone",
  email: "Email",
  address: "Address",
  contactName: "Contact person",
  serviceType: "What they want",
  source: "Source",
  objection: "Objection",
  cashCollected: "Cash collected",
  saleAmount: "Total sale",
  notes: "Notes",
  contactEveryDays: "Contact every (days)",
  lastContactAt: "Last contact",
  referralFeePct: "Referral fee %",
  referralFeeStatus: "Referral fee",
};

const OTHER_FIELD_LABELS: Record<string, string> = {
  appointmentAt: "Walk date",
  appointmentTime: "Walk time",
  nextAction: "Next action",
  nextActionAt: "Next action date",
  stage: "Stage",
};

export function leadFieldLabel(k: string): string {
  return TRACKED_LEAD_FIELDS[k] ?? OTHER_FIELD_LABELS[k] ?? k;
}

/** A field's value as the card's form shows it, for comparing with a base value. */
export function leadFieldText(k: string, v: unknown): string {
  if (v === undefined || v === null) return "";
  if (k === "contactEveryDays") return v ? String(v) : "";
  return String(v);
}

function shownValue(k: string, v: unknown): string {
  const t = leadFieldText(k, v).trim();
  if (!t) return "(blank)";
  const max = k === "notes" ? 60 : 120;
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** One history line per tracked field the patch really changes. */
export function fieldChangeLines(fresh: Partial<Lead>, patch: Partial<Lead>, ts: string, by?: string): LeadActivity[] {
  const out: LeadActivity[] = [];
  const f = fresh as Record<string, unknown>;
  const p = patch as Record<string, unknown>;
  for (const k of Object.keys(TRACKED_LEAD_FIELDS)) {
    if (!(k in p)) continue;
    if (leadFieldText(k, f[k]).trim() === leadFieldText(k, p[k]).trim()) continue;
    out.push({
      ts,
      type: "system",
      text: `${TRACKED_LEAD_FIELDS[k]}: ${shownValue(k, f[k])} → ${shownValue(k, p[k])}`,
      ...(by ? { by } : {}),
    });
  }
  return out;
}

/** Who last changed a field, from its change line in the history. */
function lastChangedBy(fresh: Lead, k: string): string {
  const label = leadFieldLabel(k);
  const lines = (fresh.activity || []).filter((a) => a.by && a.text.startsWith(`${label}:`));
  lines.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return lines.length ? String(lines[lines.length - 1].by) : "";
}

/**
 * Fields the save would overwrite although they changed since the form was
 * opened: the stored value is neither the form's base value nor the value
 * being saved. Returns the refusal message, or "" when there is none.
 */
export function staleFieldMessage(fresh: Lead, patch: Partial<Lead>, base: Record<string, string> | undefined): string {
  if (!base) return "";
  const f = fresh as unknown as Record<string, unknown>;
  const p = patch as Record<string, unknown>;
  const stale = Object.keys(base).filter((k) => {
    if (!(k in p)) return false;
    const stored = leadFieldText(k, f[k]);
    return stored !== base[k] && stored !== leadFieldText(k, p[k]);
  });
  if (!stale.length) return "";
  const parts = stale.map((k) => {
    const who = lastChangedBy(fresh, k);
    return `${leadFieldLabel(k)} is now "${shownValue(k, f[k])}"${who ? ` (changed by ${who})` : ""}`;
  });
  return `Not saved: someone changed this lead after you opened it. ${parts.join("; ")}. Your typed values are still in the form; check them and save again.`;
}

/** The card's base values (control key `base` on the patch), cleaned. */
export function cleanBase(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!EDITABLE_LEAD_FIELDS.has(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 5000);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = String(v);
    else if (v === null) out[k] = ""; // the field was blank when the save was made
  }
  return Object.keys(out).length ? out : undefined;
}

export interface SaveLeadOptions {
  /**
   * Email of the person making the save. Goes on the history line and on
   * the "Phone: a → b" lines for changed fields.
   */
  by?: string;
  /**
   * The value each edited field had when the form was opened. A field whose
   * stored value has changed since (and isn't already what's being saved)
   * refuses the whole save with a message naming it.
   */
  base?: Record<string, string>;
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
    const by = opts.by ? opts.by.toLowerCase() : undefined;
    let entry = activity && by && !activity.by ? { ...activity, by } : activity;
    if (opts.reopen) {
      // Already open (a replayed or double-tapped Reopen): nothing to do.
      if (fresh.stage !== "lost" && fresh.stage !== "not_a_lead") return {};
      p = reopenPatch(fresh, today);
      const label = STAGE_LABELS[p.stage as LeadStage] ?? p.stage;
      entry = {
        ts: activity?.ts || now,
        type: "stage",
        text: `Reopened (back to ${label})`,
        ...(activity?.via ? { via: activity.via } : {}),
        ...(by ? { by } : {}),
      };
    }
    const stale = staleFieldMessage(fresh, p, opts.base);
    if (stale) throw new LeadSaveRefused(stale);
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
    const notes = by ? rules.notes.map((n) => (n.by ? n : { ...n, by })) : rules.notes;
    const lines = [...(entry ? [entry] : []), ...notes, ...fieldChangeLines(fresh, p, now, by)];
    if (lines.length && historyTooBig(fresh.activity, lines)) {
      // The history is near the 1 MiB document limit: move the oldest lines
      // to leads/{id}/historyArchive and write back the rest. Safe inside
      // the transaction, which read the whole array. Lines already there are
      // skipped, as arrayUnion would.
      const existing = fresh.activity || [];
      const seen = new Set(existing.map((e) => JSON.stringify(e)));
      const merged = [...existing, ...lines.filter((l) => !seen.has(JSON.stringify(l)))];
      const plan = planHistoryArchive(merged);
      for (const chunk of plan.chunks) {
        tx.set(db.collection(`leads/${leadId}/historyArchive`).doc(), {
          entries: chunk,
          from: chunk[0]?.ts || "",
          to: chunk[chunk.length - 1]?.ts || "",
          archivedAt: now,
        });
      }
      write.activity = plan.keep;
    } else if (lines.length) {
      write.activity = FieldValue.arrayUnion(...lines);
    }
    tx.update(ref, write);
    return out;
  });
}

/** Append history lines (plus any plain fields) without rewriting the array. */
export function activityAppend(...entries: LeadActivity[]): FieldValue {
  return FieldValue.arrayUnion(...entries);
}
