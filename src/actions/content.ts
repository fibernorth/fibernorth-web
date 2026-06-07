"use server";

import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { verifyServerActionCaller } from "@/lib/server-action-auth";

export async function updatePageContent(
  pageId: string,
  data: Record<string, unknown>,
  authToken: string
) {
  await verifyServerActionCaller(authToken);
  const adminApp = initializeAdminApp();
  const db = getFirestore(adminApp);
  await db
    .collection("siteContent")
    .doc(pageId)
    .set({ ...data, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function getPageContent(pageId: string) {
  const adminApp = initializeAdminApp();
  const db = getFirestore(adminApp);
  const doc = await db.collection("siteContent").doc(pageId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}
