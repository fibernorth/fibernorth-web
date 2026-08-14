import { initializeAdminApp } from "@/services/firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { ADMIN_UIDS } from "@/lib/admin-allowlist";

export async function verifyServerActionCaller(authToken: string) {
  const adminApp = initializeAdminApp();
  const decoded = await getAuth(adminApp).verifyIdToken(authToken);
  if (!ADMIN_UIDS.has(decoded.uid)) {
    throw new Error("Not authorized");
  }
  return { uid: decoded.uid, email: decoded.email };
}
