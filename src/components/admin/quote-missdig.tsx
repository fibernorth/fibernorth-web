"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, Shovel } from "lucide-react";
import { useAuth } from "@/context/auth-provider";
import { useAdminAccess } from "@/context/admin-access";
import { needMissDig } from "@/actions/missdig";
import type { QuoteRequest } from "@/lib/types";

// MISS DIG on the quote page: an accepted quote shows whether its ticket is
// still needed (with the sheet), already in (ticket and dig day), or, for
// jobs accepted before the MISS DIG list existed, a button to add it.

export function QuoteMissDig({ quote }: { quote: QuoteRequest }) {
  const { getIdToken } = useAuth();
  const { role } = useAdminAccess();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (role === "sales") return null;
  if (quote.estimateStatus !== "accepted" && !quote.missDigStatus) return null;

  const box = "bg-card border rounded-lg p-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm";
  if (quote.missDigStatus === "entered") {
    return (
      <div className={`${box} border-border`}>
        <Shovel className="h-4 w-4 text-accent" />
        <span>
          MISS DIG ticket <strong>{quote.missDigTicket}</strong>, dig from {quote.missDigDigDate}.
        </span>
        <Link href={`/admin/missdig/${quote.id}`} className="text-primary hover:underline">
          Ticket sheet
        </Link>
      </div>
    );
  }
  if (quote.missDigStatus === "needed") {
    return (
      <div className={`${box} border-secondary/60`}>
        <Shovel className="h-4 w-4 text-secondary" />
        <span className="font-medium">Needs a MISS DIG ticket.</span>
        <Link href={`/admin/missdig/${quote.id}`} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium">
          Open the ticket sheet
        </Link>
      </div>
    );
  }
  return (
    <div className={`${box} border-border`}>
      <Shovel className="h-4 w-4 text-muted-foreground" />
      <span>Accepted. Needs a MISS DIG ticket?</span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setErr("");
          setBusy(true);
          try {
            const t = await getIdToken();
            if (!t) throw new Error("Session expired, sign in again");
            await needMissDig(quote.id, t);
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Couldn't add it");
          } finally {
            setBusy(false);
          }
        }}
        className="px-3 py-1.5 rounded-md border border-primary/50 text-primary inline-flex items-center gap-1.5 disabled:opacity-50"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add to the MISS DIG list
      </button>
      {err && <span className="w-full text-destructive">{err}</span>}
    </div>
  );
}
