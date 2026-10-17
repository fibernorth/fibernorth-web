"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/auth-provider";
import { getMyTextTemplates, saveMyTextTemplate } from "@/actions/text-templates";
import type { CustomTexts } from "@/lib/lead-email-templates";

// One fetch per page load, shared by every Text screen and suggested step.
let cache: CustomTexts | null = null;
let cacheUid = "";
let loading: Promise<CustomTexts> | null = null;
const listeners = new Set<(t: CustomTexts) => void>();

function publish(t: CustomTexts) {
  cache = t;
  listeners.forEach((fn) => fn(t));
}

/** The signed-in user's saved text starters, and a way to save or reset one. */
export function useMyTextTemplates() {
  const { user, getIdToken } = useAuth();
  const [texts, setTexts] = useState<CustomTexts>(cache || {});

  useEffect(() => {
    listeners.add(setTexts);
    // A different person signed in on this tab: drop the last one's texts.
    if (user && user.uid !== cacheUid) {
      cache = null;
      cacheUid = user.uid;
      setTexts({});
    }
    if (!cache && !loading && user) {
      loading = (async () => {
        try {
          const token = await getIdToken();
          const t = token ? await getMyTextTemplates(token) : {};
          publish(t);
          return t;
        } catch {
          return {};
        } finally {
          loading = null;
        }
      })();
    }
    return () => {
      listeners.delete(setTexts);
    };
  }, [user, getIdToken]);

  const save = useCallback(
    async (key: string, body: string): Promise<string> => {
      const token = await getIdToken();
      if (!token) return "Session expired, sign in again.";
      const r = await saveMyTextTemplate(key, body, token);
      if (!r.ok) return r.error || "Didn't save.";
      const next = { ...(cache || {}) };
      if (body.trim()) next[key] = body.trim();
      else delete next[key];
      publish(next);
      return "";
    },
    [getIdToken]
  );

  return { texts, save };
}
