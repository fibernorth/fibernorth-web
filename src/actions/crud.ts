"use server";

import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { verifyServerActionCaller } from "@/lib/server-action-auth";

export async function createDocument(
  collectionName: string,
  data: Record<string, unknown>,
  authToken: string
) {
  await verifyServerActionCaller(authToken);
  const adminApp = initializeAdminApp();
  const db = getFirestore(adminApp);
  const now = new Date().toISOString();
  const docRef = await db.collection(collectionName).add({
    ...data,
    createdAt: now,
    updatedAt: now,
  });
  return docRef.id;
}

export async function updateDocument(
  collectionName: string,
  docId: string,
  data: Record<string, unknown>,
  authToken: string
) {
  await verifyServerActionCaller(authToken);
  const adminApp = initializeAdminApp();
  const db = getFirestore(adminApp);
  await db
    .collection(collectionName)
    .doc(docId)
    .update({ ...data, updatedAt: new Date().toISOString() });
}

export async function deleteDocument(
  collectionName: string,
  docId: string,
  authToken: string
) {
  await verifyServerActionCaller(authToken);
  const adminApp = initializeAdminApp();
  const db = getFirestore(adminApp);
  await db.collection(collectionName).doc(docId).delete();
}

export async function updateSettings(
  settingsId: string,
  data: Record<string, unknown>,
  authToken: string
) {
  await verifyServerActionCaller(authToken);
  const adminApp = initializeAdminApp();
  const db = getFirestore(adminApp);
  await db
    .collection("siteSettings")
    .doc(settingsId)
    .set({ ...data, updatedAt: new Date().toISOString() }, { merge: true });
}
