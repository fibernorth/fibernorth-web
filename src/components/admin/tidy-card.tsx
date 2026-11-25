"use client";

import { useMemo, useState } from "react";
import { where } from "firebase/firestore";
import { Loader2, Sparkles } from "lucide-react";
import { useFirestoreCollection } from "@/hooks/use-firestore-collection";
import { useIsOwner } from "@/hooks/use-is-owner";
import { useAuth } from "@/context/auth-provider";
import { closeQuotesOnDeadLeads } from "@/actions/leads";
import { money, sentTotalOf } from "@/lib/proposal";
import { quotesClosedByLead } from "@/lib/quote-options";
import type { Lead } from "@/lib/leads";
import type { QuoteRequest } from "@/lib/types";

// Dashboard card (owners): quotes still open on leads already marked Lost or
// Not a lead, from before closing a lead closed its quotes. One tap closes
// them; reopening a lead brings its quotes back. Hidden when there are none.

export function TidyCard() {
  const owner = useIsOwner();
  const { getIdToken } = useAuth();
  const leadC = useMemo(() => [where("stage", "in", ["lost", "not_a_lead"])], []);
  const quoteC = useMemo(() => [where("estimateStatus", "in", ["draft", "sent", "viewed", "declined"])], []);
  const { data: dead } = useFirestoreCollection<Lead>(owner ? "leads" : null, { constraints: leadC });
  const { data: quotes } = useFirestoreCollection<QuoteRequest>(owner ? "quoteRequests" : null, { constraints: quoteC });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const open = useMemo(() => {
    const ids = new Set(dead.map((l) => l.id));
    return quotesClosedByLead(quotes.filter((q) => q.leadId && ids.has(q.leadId)));
  }, [dead, quotes]);
  const dollars = open.reduce((t, q) => t + ((q.version ? sentTotalOf(q) : q.quotedPrice) || 0), 0);
  const leadCount = new Set(open.map((q) => q.leadId)).size;

  if (!owner || (!open.length && !msg)) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-2">
      <h2 className="font-semibold flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-secondary" /> Tidy up
      </h2>
      {open.length > 0 && (
        <>
          <p className="text-sm">
            {open.length} quote{open.length === 1 ? " is" : "s are"} still open on {leadCount} lead
            {leadCount === 1 ? "" : "s"} you marked Lost or Not a lead{dollars > 0 ? ` (${money(dollars)})` : ""}. Close them
            so they stop counting as open. Reopening a lead brings its quotes back.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMsg("");
              try {
                const t = await getIdToken();
                if (!t) throw new Error("Session expired, sign in again");
                const r = await closeQuotesOnDeadLeads(t);
                setMsg(`Closed ${r.quotes} quote${r.quotes === 1 ? "" : "s"} on ${r.leads} lead${r.leads === 1 ? "" : "s"}.`);
              } catch (e) {
                setMsg(e instanceof Error ? e.message : "Couldn't close them");
              } finally {
                setBusy(false);
              }
            }}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 min-h-11 sm:min-h-0 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Close them
          </button>
        </>
      )}
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}
