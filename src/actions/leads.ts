"use server";

import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyServerActionCaller } from "@/lib/server-action-auth";
import { cleanLeadPatch, saveLeadServer } from "@/services/lead-writes";
import type { LeadActivity } from "@/lib/leads";

const ACTIVITY_TYPES = new Set<LeadActivity["type"]>([
  "note",
  "call",
  "attempt",
  "text",
  "email",
  "walk",
  "letter",
  "quote",
  "stage",
  "system",
]);

/**
 * Save a lead from the card. The history line is appended on the server
 * (never a whole-array rewrite), and the stage / contact-date rules run
 * against the lead as it is now, not the card's copy. Safe to retry: the
 * same history line is only added once.
 */
export async function saveLead(
  leadId: string,
  patch: Record<string, unknown>,
  activity: LeadActivity | null,
  authToken: string
): Promise<{ ok: true } | { ok: false; error: string; gone?: boolean }> {
  await verifyServerActionCaller(authToken);
  if (!leadId || typeof leadId !== "string" || leadId.includes("/")) return { ok: false, error: "Bad lead id" };
  let entry: LeadActivity | undefined;
  if (activity) {
    if (!ACTIVITY_TYPES.has(activity.type) || typeof activity.ts !== "string" || typeof activity.text !== "string") {
      return { ok: false, error: "Bad history entry" };
    }
    entry = { ts: activity.ts.slice(0, 40), type: activity.type, text: activity.text.slice(0, 2000) };
    if (activity.via === "voice") entry.via = "voice";
  }
  try {
    await saveLeadServer(getFirestore(initializeAdminApp()), leadId, cleanLeadPatch(patch), entry);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Couldn't save";
    return { ok: false, error: msg, gone: msg === "Lead not found" };
  }
}
