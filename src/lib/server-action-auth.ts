import { initializeAdminApp } from "@/services/firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { isAdminIdentity } from "@/lib/admin-allowlist";

export async function verifyServerActionCaller(authToken: string) {
  const adminApp = initializeAdminApp();
  const decoded = await getAuth(adminApp).verifyIdToken(authToken);
  if (!isAdminIdentity(decoded.uid, decoded.email)) {
    throw new Error("Not authorized");
  }
  return { uid: decoded.uid, email: decoded.email };
}
