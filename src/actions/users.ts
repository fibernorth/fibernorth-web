"use server";

import { initializeAdminApp } from "@/services/firebase-admin";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { verifyServerActionCaller } from "@/lib/server-action-auth";
import { ADMIN_EMAILS, ADMIN_UIDS } from "@/lib/admin-allowlist";
import { sendPasswordResetEmail } from "@/services/notifications";

// Admin user management. Access is granted through a Firebase custom claim
// (admin: true) so firestore.rules, storage.rules, and the server checks all
// see it without a database lookup. The hardcoded allowlist stays as a
// fallback so the owner accounts can never be locked out from here.

export interface AdminUser {
  uid: string;
  email: string;
  name: string;
  disabled: boolean;
  lastSignIn: string;
  builtIn: boolean; // from the code allowlist; can't be removed here
}

export async function listAdminUsers(authToken: string): Promise<AdminUser[]> {
  await verifyServerActionCaller(authToken);
  const app = initializeAdminApp();
  const auth = getAuth(app);
  const db = getFirestore(app);

  const profiles = new Map<string, string>();
  const snap = await db.collection("adminUsers").get();
  snap.forEach((d) => profiles.set(d.id, (d.data().name as string) || ""));

  const out: AdminUser[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      const email = (u.email || "").toLowerCase();
      const builtIn = ADMIN_UIDS.has(u.uid) || ADMIN_EMAILS.has(email);
      const claimed = u.customClaims?.admin === true;
      if (!builtIn && !claimed) continue;
      out.push({
        uid: u.uid,
        email: u.email || "",
        name: profiles.get(u.uid) || u.displayName || "",
        disabled: u.disabled,
        lastSignIn: u.metadata.lastSignInTime || "",
        builtIn,
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);

  return out.sort((a, b) => a.email.localeCompare(b.email));
}

export async function createAdminUser(
  input: { email: string; name: string; password: string },
  authToken: string
): Promise<{ uid: string; existing: boolean }> {
  await verifyServerActionCaller(authToken);
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const password = input.password;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email");

  const app = initializeAdminApp();
  const auth = getAuth(app);
  const db = getFirestore(app);

  let uid: string;
  let existing = false;
  let found: UserRecord | null = null;
  try {
    found = await auth.getUserByEmail(email);
  } catch (e) {
    if ((e as { code?: string })?.code !== "auth/user-not-found") throw e;
  }
  if (found) {
    // Never touch the password of an account that already exists: granting
    // admin must not double as "take over whoever owns this email". The
    // person keeps their own password (or uses "Email reset link").
    uid = found.uid;
    existing = true;
    await auth.updateUser(uid, {
      ...(name && !found.displayName ? { displayName: name } : {}),
      disabled: false,
    });
  } else {
    if (password.length < 8) throw new Error("Password needs at least 8 characters");
    const created = await auth.createUser({ email, password, displayName: name || undefined });
    uid = created.uid;
  }

  await auth.setCustomUserClaims(uid, { ...(found?.customClaims ?? {}), admin: true });
  await db.collection("adminUsers").doc(uid).set(
    { email, name, role: "admin", updatedAt: new Date().toISOString() },
    { merge: true }
  );
  return { uid, existing };
}

export async function removeAdminUser(uid: string, authToken: string): Promise<void> {
  const caller = await verifyServerActionCaller(authToken);
  if (caller.uid === uid) throw new Error("You can't remove yourself");
  const app = initializeAdminApp();
  const auth = getAuth(app);
  const user = await auth.getUser(uid);
  const email = (user.email || "").toLowerCase();
  if (ADMIN_UIDS.has(uid) || ADMIN_EMAILS.has(email)) {
    throw new Error("That account is a built-in owner and can't be removed here");
  }
  await auth.setCustomUserClaims(uid, { admin: false });
  await auth.updateUser(uid, { disabled: true });
  await auth.revokeRefreshTokens(uid);
  await getFirestore(app).collection("adminUsers").doc(uid).delete();
}

function isBuiltInOwner(user: UserRecord): boolean {
  return ADMIN_UIDS.has(user.uid) || ADMIN_EMAILS.has((user.email || "").toLowerCase());
}

/**
 * Who may have their password reset from Admin -> Users:
 * - only accounts that are admins (admin claim) or built-in owners, and
 * - a built-in owner only by that same owner (no admin can take over Bill).
 */
async function loadResettableTarget(uid: string, callerUid: string): Promise<UserRecord> {
  const user = await getAuth(initializeAdminApp()).getUser(uid);
  if (isBuiltInOwner(user)) {
    if (user.uid !== callerUid) {
      throw new Error("Only that owner can change an owner account's password. Use \"Email reset link\" instead.");
    }
    return user;
  }
  if (user.customClaims?.admin !== true) {
    throw new Error("That account isn't an admin user");
  }
  return user;
}

export async function resetAdminPassword(
  uid: string,
  password: string,
  authToken: string
): Promise<void> {
  const caller = await verifyServerActionCaller(authToken);
  if (password.length < 8) throw new Error("Password needs at least 8 characters");
  await loadResettableTarget(uid, caller.uid);
  const auth = getAuth(initializeAdminApp());
  await auth.updateUser(uid, { password });
  if (uid !== caller.uid) await auth.revokeRefreshTokens(uid);
}

/**
 * Email a Firebase password-reset link to the account's own address. Safe for
 * any admin or owner account (including the built-in owners): the link only
 * goes to that person's inbox, never back to the caller.
 */
export async function sendAdminPasswordResetEmail(
  uid: string,
  authToken: string
): Promise<{ email: string }> {
  await verifyServerActionCaller(authToken);
  const auth = getAuth(initializeAdminApp());
  const user = await auth.getUser(uid);
  if (!isBuiltInOwner(user) && user.customClaims?.admin !== true) {
    throw new Error("That account isn't an admin user");
  }
  if (!user.email) throw new Error("That account has no email address");
  const link = await auth.generatePasswordResetLink(user.email);
  await sendPasswordResetEmail({ to: user.email, link });
  return { email: user.email };
}
