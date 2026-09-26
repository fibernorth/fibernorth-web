"use client";

import { useEffect, useState } from "react";
import { todayISO } from "@/lib/leads";

/**
 * The current time, refreshed every `intervalMs` and whenever the tab comes
 * back into view, so screens left open overnight don't keep yesterday's
 * "today", "due" or "expired".
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
    };
  }, [intervalMs]);
  return now;
}

/** Today's date (YYYY-MM-DD) in America/Detroit, kept current. */
export function useToday(): string {
  const now = useNow();
  return todayISO(new Date(now));
}
