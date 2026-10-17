"use server";

import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyServerActionCaller } from "@/lib/server-action-auth";
import { LEAD_TEXT_TEMPLATES, LEAD_VM_SCRIPTS, type CustomTexts } from "@/lib/lead-email-templates";

// Each admin's own versions of the Text button's starters and the Call
// button's voicemail scripts, saved from those screens ("Save as my
// default"). One doc per user: textTemplates/{uid}
// { texts: { [starterKey]: body } }. Server-only (no firestore.rules entry),
// so a user only ever reads and writes their own.

const MAX_LEN = 1000;

export async function getMyTextTemplates(authToken: string): Promise<CustomTexts> {
  const caller = await verifyServerActionCaller(authToken);
  const snap = await getFirestore(initializeAdminApp()).collection("textTemplates").doc(caller.uid).get();
  const texts = (snap.data()?.texts || {}) as Record<string, unknown>;
  const out: CustomTexts = {};
  for (const [k, v] of Object.entries(texts)) if (typeof v === "string" && v.trim()) out[k] = v;
  return out;
}

/** Saves (or, with an empty body, resets) one starter for the caller. */
export async function saveMyTextTemplate(
  key: string,
  body: string,
  authToken: string
): Promise<{ ok: boolean; error?: string }> {
  const caller = await verifyServerActionCaller(authToken);
  if (![...LEAD_TEXT_TEMPLATES, ...LEAD_VM_SCRIPTS].some((t) => t.key === key)) return { ok: false, error: "Unknown text starter." };
  const text = (body || "").trim();
  if (text.length > MAX_LEN) return { ok: false, error: `Keep it under ${MAX_LEN} characters.` };
  await getFirestore(initializeAdminApp())
    .collection("textTemplates")
    .doc(caller.uid)
    .set(
      { texts: { [key]: text ? text : FieldValue.delete() }, updatedAt: new Date().toISOString(), email: caller.email || "" },
      { merge: true }
    );
  return { ok: true };
}
