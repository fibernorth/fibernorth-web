import { initializeAdminApp } from "@/services/firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { isAdminIdentity, isOwnerIdentity, OWNER_ONLY_MESSAGE } from "@/lib/admin-allowlist";

export interface ServerActionCaller {
  uid: string;
  email: string | undefined;
  /** A built-in owner account (src/lib/admin-allowlist.ts). */
  owner: boolean;
}

/**
 * Any admin (owner or staff). checkRevoked: a removed admin's tokens stop
 * working at once instead of up to an hour later.
 */
export async function verifyServerActionCaller(authToken: string): Promise<ServerActionCaller> {
  const adminApp = initializeAdminApp();
  const decoded = await getAuth(adminApp).verifyIdToken(authToken, true);
  if (!isAdminIdentity(decoded.uid, decoded.email, decoded)) {
    throw new Error("Not authorized");
  }
  return {
    uid: decoded.uid,
    email: decoded.email,
    owner: isOwnerIdentity(decoded.uid, decoded.email, decoded),
  };
}

/** Owner-only actions. Throws OWNER_ONLY_MESSAGE for staff. */
export async function verifyOwnerCaller(authToken: string): Promise<ServerActionCaller> {
  const caller = await verifyServerActionCaller(authToken);
  if (!caller.owner) throw new Error(OWNER_ONLY_MESSAGE);
  return caller;
}
