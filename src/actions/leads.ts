"use server";

import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyServerActionCaller } from "@/lib/server-action-auth";
import { cleanBase, cleanLeadPatch, saveLeadServer } from "@/services/lead-writes";
import { findExistingLead } from "@/lib/assistant-logic";
import { ACTIVITY_TYPES, LEAD_SOURCES, todayISO, type Lead, type LeadActivity } from "@/lib/leads";

/**
 * Save a lead from the card. The history line is appended on the server
 * (never a whole-array rewrite), and the stage / contact-date rules run
 * against the lead as it is now, not the card's copy. Safe to retry: the
 * same history line is only added once.
 *
 * Control keys ride along in `patch` (so the phone's offline outbox
 * replays them unchanged): `expectStage`, the stage the card showed,
 * `reopen: true` for the Reopen button, and `base`, the value each edited
 * field had when the details form was opened (a field changed since by
 * someone else refuses the save instead of being overwritten).
 */
export async function saveLead(
  leadId: string,
  patch: Record<string, unknown>,
  activity: LeadActivity | null,
  authToken: string
): Promise<{ ok: true } | { ok: false; error: string; gone?: boolean }> {
  const caller = await verifyServerActionCaller(authToken);
  if (!leadId || typeof leadId !== "string" || leadId.includes("/")) return { ok: false, error: "Bad lead id" };
  let entry: LeadActivity | undefined;
  if (activity) {
    if (!ACTIVITY_TYPES.includes(activity.type) || typeof activity.ts !== "string" || typeof activity.text !== "string") {
      return { ok: false, error: "Bad history entry" };
    }
    entry = { ts: activity.ts.slice(0, 40), type: activity.type, text: activity.text.slice(0, 2000) };
    if (activity.via === "voice") entry.via = "voice";
  }
  const expectStage = typeof patch.expectStage === "string" ? patch.expectStage : undefined;
  const reopen = patch.reopen === true;
  try {
    await saveLeadServer(getFirestore(initializeAdminApp()), leadId, cleanLeadPatch(patch), entry, {
      expectStage,
      reopen,
      base: cleanBase(patch.base),
      by: caller.email || caller.uid,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Couldn't save";
    return { ok: false, error: msg, gone: msg === "Lead not found" };
  }
}

const newLeadSchema = z.object({
  name: z.string().trim().min(1, "Add a name").max(200),
  phone: z.string().trim().max(40).default(""),
  email: z.string().trim().max(200).default(""),
  address: z.string().trim().max(300).default(""),
  serviceType: z.string().trim().max(100).default(""),
  source: z.enum(LEAD_SOURCES).default("phone"),
  notes: z.string().trim().max(5000).default(""),
});

/**
 * Add a lead by hand. Checks for someone already in the pipeline with the
 * same phone or email first; `allowDuplicate` adds it anyway.
 */
export async function createLead(
  input: Record<string, unknown>,
  authToken: string,
  opts: { allowDuplicate?: boolean } = {}
): Promise<
  | { ok: true; id: string }
  | { ok: false; error: string; duplicateOf?: { id: string; name: string } }
> {
  const caller = await verifyServerActionCaller(authToken);
  const parsed = newLeadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || "Check the fields" };
  const f = parsed.data;
  const db = getFirestore(initializeAdminApp());
  if (!opts.allowDuplicate && (f.phone || f.email)) {
    const snap = await db.collection("leads").select("name", "phone", "email", "stage").get();
    const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Lead, "id">) }) as Lead);
    const hit = findExistingLead(all, { phone: f.phone, email: f.email });
    if (hit) {
      return {
        ok: false,
        error: `${hit.name || "Someone"} already has that ${hit.match}.`,
        duplicateOf: { id: hit.id, name: hit.name || "" },
      };
    }
  }
  const now = new Date().toISOString();
  const doc: Omit<Lead, "id"> = {
    ...f,
    stage: "new",
    nextAction: "Call back",
    nextActionAt: todayISO(),
    touched: true,
    activity: [{ ts: now, type: "system", text: "Added by hand", by: (caller.email || caller.uid).toLowerCase() }],
    createdAt: now,
    updatedAt: now,
  };
  const ref = await db.collection("leads").add(doc);
  return { ok: true, id: ref.id };
}
