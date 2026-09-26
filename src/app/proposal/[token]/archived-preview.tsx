"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadArchivedProposalDetails } from "@/actions/proposal-preview";
import { signedInIdToken } from "@/lib/signed-in-token";
import { ProposalDrawings, ProposalPrice } from "./proposal-details";

type Details = NonNullable<Awaited<ReturnType<typeof loadArchivedProposalDetails>>>;

/**
 * An old acceptance hides its map and prices from the public link. With
 * ?preview=1, a signed-in admin still gets them, loaded through an
 * admin-checked server action.
 */
export function ArchivedPreview({ token }: { token: string }) {
  const [details, setDetails] = useState<Details | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "denied">("loading");

  useEffect(() => {
    let live = true;
    (async () => {
      const auth = await signedInIdToken();
      if (!auth) {
        if (live) setState("denied");
        return;
      }
      try {
        const d = await loadArchivedProposalDetails(token, auth);
        if (!live) return;
        setDetails(d);
        setState(d ? "ready" : "denied");
      } catch {
        if (live) setState("denied");
      }
    })();
    return () => {
      live = false;
    };
  }, [token]);

  if (state === "loading") {
    return (
      <p className="mt-6 text-sm text-black/50 flex items-center gap-2 print:hidden">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking for an office sign-in…
      </p>
    );
  }
  if (state === "denied" || !details) {
    return (
      <p className="mt-6 text-xs text-black/50 print:hidden">
        Office preview: sign in to the admin panel in this browser to see the map and prices.
      </p>
    );
  }
  return (
    <div className="mt-6 rounded-lg border border-dashed border-black/20 p-4">
      <p className="text-xs uppercase tracking-wider text-black/50">Office preview (hidden from the public link)</p>
      {details.address && <p className="mt-2 text-sm">{details.address}</p>}
      <ProposalDrawings annotation={details.annotation} planImageUrl={details.planImageUrl} />
      <ProposalPrice lines={details.lines} totals={details.totals} />
    </div>
  );
}
