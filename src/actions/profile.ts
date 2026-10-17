"use server";

import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyServerActionCaller } from "@/lib/server-action-auth";

// Each admin's own name and phone for the lead texts, emails and voicemail
// scripts ("this is Sam with FiberNorth", "call or text me at ..."). Kept on
// their adminUsers/{uid} profile (name is the same field the Users page
// shows). Everyone edits only their own, under Admin -> My info.

export interface MyProfile {
  name: string;
  phone: string;
  email: string;
  /** A built-in owner: blank info falls back to Bill and the FiberNorth numbers. */
  owner: boolean;
}

const PHONE_RE = /^[0-9()+.\-\s]{7,20}$/;

export async function getMyProfile(authToken: string): Promise<MyProfile> {
  const caller = await verifyServerActionCaller(authToken);
  const snap = await getFirestore(initializeAdminApp()).collection("adminUsers").doc(caller.uid).get();
  const d = snap.data() || {};
  return {
    name: typeof d.name === "string" ? d.name : "",
    phone: typeof d.phone === "string" ? d.phone : "",
    email: caller.email || "",
    owner: caller.owner,
  };
}

export async function saveMyProfile(
  input: { name: string; phone: string },
  authToken: string
): Promise<{ ok: boolean; error?: string }> {
  const caller = await verifyServerActionCaller(authToken);
  const name = (input.name || "").trim().replace(/\s+/g, " ");
  const phone = (input.phone || "").trim();
  if (name.length > 80) return { ok: false, error: "Keep the name under 80 characters." };
  if (!caller.owner && !name) return { ok: false, error: "Add your name; it goes in your texts and emails." };
  if (phone && !PHONE_RE.test(phone)) return { ok: false, error: "That phone number doesn't look right." };
  await getFirestore(initializeAdminApp())
    .collection("adminUsers")
    .doc(caller.uid)
    .set({ name, phone, email: caller.email || "", updatedAt: new Date().toISOString() }, { merge: true });
  return { ok: true };
}
