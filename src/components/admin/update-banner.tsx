"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

// After the site is updated, a page that was already open still runs the old
// code, and its buttons fail with "Server Action ... was not found". This
// checks the server's build every few minutes and whenever the tab comes back
// into view, and asks for a reload before anything breaks. It also catches
// that error if it slips through first.

const MINE = process.env.NEXT_PUBLIC_BUILD_STAMP || "";
const STALE_ERROR = /server action .*not found|failed to find server action/i;

export function UpdateBanner() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!MINE) return;
    let stop = false;
    const check = async () => {
      if (stop || document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/build", { cache: "no-store" });
        const { build } = (await res.json()) as { build?: string };
        if (build && build !== MINE) setStale(true);
      } catch {
        // offline: try again later
      }
    };
    const onError = (e: PromiseRejectionEvent | ErrorEvent) => {
      const reason = "reason" in e ? e.reason : e.error;
      const msg = reason instanceof Error ? reason.message : String(reason ?? (e as ErrorEvent).message ?? "");
      if (STALE_ERROR.test(msg)) setStale(true);
    };
    const t = setInterval(check, 3 * 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener("unhandledrejection", onError);
    window.addEventListener("error", onError);
    void check();
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("unhandledrejection", onError);
      window.removeEventListener("error", onError);
    };
  }, []);

  if (!stale) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[60] bg-primary text-primary-foreground px-4 py-2 flex items-center justify-center gap-3 text-sm shadow-md print:hidden">
      <span>The CRM was updated. Save what you&apos;re typing, then reload.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1 font-semibold hover:bg-white/25"
      >
        <RefreshCw className="h-4 w-4" /> Reload
      </button>
    </div>
  );
}
