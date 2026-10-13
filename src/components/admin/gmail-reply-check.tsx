"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/auth-provider";

// Lead replies: while an admin tab is open and in view, ask the server to
// check bill@'s Gmail on load and every five minutes. The server decides
// whether it's time (at most every two minutes across all tabs), so this
// needs no cron. Stops for this page load when Gmail isn't connected.

const EVERY_MS = 5 * 60_000;

export function GmailReplyCheck() {
  const { user, getIdToken } = useAuth();

  useEffect(() => {
    if (!user) return;
    let stop = false;
    let last = 0;
    const ping = async () => {
      if (stop || document.visibilityState !== "visible") return;
      // Coming back into view: only if the last ping is a full interval old.
      if (Date.now() - last < EVERY_MS - 5_000) return;
      last = Date.now();
      try {
        const token = await getIdToken();
        if (!token || stop) return;
        const res = await fetch("/api/gmail/sync", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: "{}",
        });
        const json = (await res.json().catch(() => ({}))) as { reason?: string };
        if (res.status === 401 || res.status === 403 || json.reason === "not_connected") stop = true;
      } catch {
        // Offline: the next tick tries again.
      }
    };
    const t = setInterval(ping, EVERY_MS);
    document.addEventListener("visibilitychange", ping);
    void ping();
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [user, getIdToken]);

  return null;
}
