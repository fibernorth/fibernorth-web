"use server";

import { initializeAdminApp } from "@/services/firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { verifyServerActionCaller } from "@/lib/server-action-auth";
import { ADMIN_EMAILS, ADMIN_UIDS } from "@/lib/admin-allowlist";

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
): Promise<{ uid: string }> {
  await verifyServerActionCaller(authToken);
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const password = input.password;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email");
  if (password.length < 8) throw new Error("Password needs at least 8 characters");

  const app = initializeAdminApp();
  const auth = getAuth(app);
  const db = getFirestore(app);

  let uid: string;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    await auth.updateUser(uid, { password, displayName: name || undefined, disabled: false });
  } catch {
    const created = await auth.createUser({ email, password, displayName: name || undefined });
    uid = created.uid;
  }

  await auth.setCustomUserClaims(uid, { admin: true });
  await db.collection("adminUsers").doc(uid).set(
    { email, name, role: "admin", updatedAt: new Date().toISOString() },
    { merge: true }
  );
  return { uid };
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

export async function resetAdminPassword(
  uid: string,
  password: string,
  authToken: string
): Promise<void> {
  await verifyServerActionCaller(authToken);
  if (password.length < 8) throw new Error("Password needs at least 8 characters");
  await getAuth(initializeAdminApp()).updateUser(uid, { password });
}
