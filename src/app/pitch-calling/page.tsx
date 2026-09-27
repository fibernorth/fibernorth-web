"use client";

import { useEffect } from "react";
import { AuthProvider } from "@/context/auth-provider";
import { PitchGate } from "@/components/pitch/pitch-gate";
import { PitchCaller } from "@/components/pitch/pitch-caller";

export default function PitchCallingPage() {
  // Offline support: the service worker keeps this page and its files on the
  // phone after the first visit.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/pitch-calling-sw.js", { scope: "/pitch-calling" })
      .then(async (reg) => {
        await navigator.serviceWorker.ready;
        // Files loaded before the worker took over: hand them over to cache.
        const urls = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin));
        (reg.active || navigator.serviceWorker.controller)?.postMessage({ type: "cache", urls: [location.pathname, ...urls] });
      })
      .catch(() => {});
  }, []);

  return (
    <AuthProvider>
      <PitchGate>{(signOut) => <PitchCaller onSignOut={signOut} />}</PitchGate>
    </AuthProvider>
  );
}
