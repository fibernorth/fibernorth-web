import { initializeAdminApp } from "@/services/firebase-admin";
import { getAuth } from "firebase-admin/auth";

export async function verifyServerActionCaller(authToken: string) {
  const adminApp = initializeAdminApp();
  const decoded = await getAuth(adminApp).verifyIdToken(authToken);
  return { uid: decoded.uid, email: decoded.email };
}
