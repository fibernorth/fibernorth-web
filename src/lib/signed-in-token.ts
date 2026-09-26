"use client";

import type { User } from "firebase/auth";

/**
 * The Firebase ID token of whoever is signed in to this browser (an admin
 * who also uses the CRM here), or null. Used by the public proposal page so
 * the office's own looks aren't counted as customer views. Loads Firebase
 * Auth only when called, and waits briefly for it to restore the session.
 */
export async function signedInIdToken(timeoutMs = 2500): Promise<string | null> {
  try {
    const [{ getFirebaseAuth }, { onAuthStateChanged }] = await Promise.all([
      import("@/lib/firebase"),
      import("firebase/auth"),
    ]);
    const auth = getFirebaseAuth();
    const user = await new Promise<User | null>((resolve) => {
      let unsub: () => void = () => {};
      const timer = setTimeout(() => {
        unsub();
        resolve(auth.currentUser);
      }, timeoutMs);
      unsub = onAuthStateChanged(auth, (u) => {
        clearTimeout(timer);
        unsub();
        resolve(u);
      });
    });
    return user ? await user.getIdToken() : null;
  } catch {
    return null;
  }
}
