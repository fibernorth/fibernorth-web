"use client";

import { useAuth } from "@/context/auth-provider";
import { isOwnerIdentity } from "@/lib/admin-allowlist";

/**
 * Whether the signed-in person is an owner (a built-in account), for hiding
 * owner-only controls. Display only: the server checks every owner-only
 * action itself.
 */
export function useIsOwner(): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return isOwnerIdentity(user.uid, user.email, { email_verified: user.emailVerified });
}
