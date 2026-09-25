// Server-side lead writes (Admin SDK). Every history line is appended with
// FieldValue.arrayUnion so two writers (the card, the sheet sync, a customer
// accepting a quote, the voice assistant) never erase each other's entries,
// and stage / contact-date rules are decided inside a transaction against
// the fresh document instead of the browser's copy.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { leadSavePatch, todayISO, type Lead, type LeadActivity } from "@/lib/leads";

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
]);

export function cleanLeadPatch(patch: Record<string, unknown>): Partial<Lead> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!EDITABLE_LEAD_FIELDS.has(k) || v === undefined) continue;
    if (k === "contactEveryDays") out[k] = Number(v) || 0;
    else if (typeof v === "string") out[k] = v.slice(0, 5000);
    else if (v === null) out[k] = "";
    else continue; // only strings / numbers belong in these fields
  }
  return out as Partial<Lead>;
}

/**
 * Save a patch and (optionally) one history line on a lead. Returns what was
 * written. Throws "Lead not found" when the lead is gone.
 */
export async function saveLeadServer(
  db: Firestore,
  leadId: string,
  patch: Partial<Lead> | ((fresh: Lead) => Partial<Lead>),
  activity?: LeadActivity,
  opts: { touched?: boolean } = {}
): Promise<Partial<Lead>> {
  const ref = db.collection("leads").doc(leadId);
  const now = new Date().toISOString();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Lead not found");
    const fresh = { id: snap.id, ...snap.data() } as Lead;
    const p = typeof patch === "function" ? patch(fresh) : patch;
    const out = leadSavePatch(fresh, p, activity, todayISO());
    const write: Record<string, unknown> = { ...out, updatedAt: now };
    if (opts.touched !== false) write.touched = true;
    if (activity) write.activity = FieldValue.arrayUnion(activity);
    tx.update(ref, write);
    return out;
  });
}

/** Append history lines (plus any plain fields) without rewriting the array. */
export function activityAppend(...entries: LeadActivity[]): FieldValue {
  return FieldValue.arrayUnion(...entries);
}
