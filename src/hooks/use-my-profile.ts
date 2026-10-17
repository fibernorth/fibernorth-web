"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/auth-provider";
import { getMyProfile, saveMyProfile, type MyProfile } from "@/actions/profile";
import type { Sender } from "@/lib/lead-email-templates";

// One fetch per page load, shared by every text, email and call screen.
let cache: MyProfile | null = null;
let cacheUid = "";
let loading = false;
const listeners = new Set<(p: MyProfile | null) => void>();

function publish(p: MyProfile | null) {
  cache = p;
  listeners.forEach((fn) => fn(p));
}

/** "sam.jones@x.com" -> "Sam Jones", for staff who haven't filled in a name. */
function nameFromEmail(email: string): string {
  return (email.split("@")[0] || "")
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * The signed-in person's name and phone, and `me` for the templates. Owners
 * with nothing filled in stay "Bill" with the FiberNorth numbers; anyone
 * else falls back to a name from their email until they fill it in.
 */
export function useMyProfile() {
  const { user, getIdToken } = useAuth();
  const [profile, setProfile] = useState<MyProfile | null>(cache);

  useEffect(() => {
    listeners.add(setProfile);
    if (user && user.uid !== cacheUid) {
      cacheUid = user.uid;
      publish(null);
    }
    if (!cache && !loading && user) {
      loading = true;
      void (async () => {
        try {
          const token = await getIdToken();
          if (token) publish(await getMyProfile(token));
        } catch {
          // Templates fall back to the defaults.
        } finally {
          loading = false;
        }
      })();
    }
    return () => {
      listeners.delete(setProfile);
    };
  }, [user, getIdToken]);

  const save = useCallback(
    async (input: { name: string; phone: string }): Promise<string> => {
      const token = await getIdToken();
      if (!token) return "Session expired, sign in again.";
      const r = await saveMyProfile(input, token);
      if (!r.ok) return r.error || "Didn't save.";
      publish({ ...(cache || { email: user?.email || "", owner: false }), name: input.name.trim(), phone: input.phone.trim() });
      return "";
    },
    [getIdToken, user]
  );

  const me = useMemo<Sender | undefined>(() => {
    if (!profile) return undefined;
    const name = profile.name || (profile.owner ? "" : nameFromEmail(profile.email));
    return { name: name || undefined, phone: profile.phone || undefined };
  }, [profile]);

  /** Staff who still need to fill in their info. */
  const missing = Boolean(profile && !profile.owner && (!profile.name || !profile.phone));

  return { profile, me, save, missing };
}
