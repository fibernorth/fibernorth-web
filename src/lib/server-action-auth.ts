import { initializeAdminApp } from "@/services/firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { isAdminIdentity, isOwnerIdentity, OWNER_ONLY_MESSAGE } from "@/lib/admin-allowlist";
import { assertNotSales, roleOf, type AdminRole } from "@/lib/roles";

export interface ServerActionCaller {
  uid: string;
  email: string | undefined;
  /** A built-in owner account (src/lib/admin-allowlist.ts). */
  owner: boolean;
  /** owner, staff or sales (the role custom claim). Absent means staff. */
  role?: AdminRole;
}

/** Whether the caller is a sales account (src/lib/roles.ts). */
export function isSalesCaller(caller: Pick<ServerActionCaller, "role">): boolean {
  return caller.role === "sales";
}

/**
 * Any admin (owner, staff or sales). checkRevoked: a removed admin's tokens
 * stop working at once instead of up to an hour later.
 */
export async function verifyServerActionCaller(authToken: string): Promise<ServerActionCaller> {
  const adminApp = initializeAdminApp();
  const decoded = await getAuth(adminApp).verifyIdToken(authToken, true);
  if (!isAdminIdentity(decoded.uid, decoded.email, decoded)) {
    throw new Error("Not authorized");
  }
  const owner = isOwnerIdentity(decoded.uid, decoded.email, decoded);
  return {
    uid: decoded.uid,
    email: decoded.email,
    owner,
    role: roleOf(owner, decoded),
  };
}

/** Owner-only actions. Throws OWNER_ONLY_MESSAGE for staff. */
export async function verifyOwnerCaller(authToken: string): Promise<ServerActionCaller> {
  const caller = await verifyServerActionCaller(authToken);
  if (!caller.owner) throw new Error(OWNER_ONLY_MESSAGE);
  return caller;
}

/** Owners and staff, not sales accounts. Throws SALES_DENIED_MESSAGE. */
export async function verifyNotSalesCaller(authToken: string): Promise<ServerActionCaller> {
  const caller = await verifyServerActionCaller(authToken);
  assertNotSales(caller);
  return caller;
}
