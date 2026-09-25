"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { where } from "firebase/firestore";
import { Loader2, Plus } from "lucide-react";
import { useFirestoreCollection } from "@/hooks/use-firestore-collection";
import { useAuth } from "@/context/auth-provider";
import { createQuoteForLead } from "@/actions/quotes";
import { SERVICES } from "@/lib/constants";
import { money } from "@/lib/proposal";
import type { Lead } from "@/lib/leads";
import type { QuoteRequest } from "@/lib/types";

// Every quote on a lead, one per job site. A homeowner has one; a contractor
// sends address after address and each gets its own map, Bore-ON design and
// proposal link, while the lead itself stays one row in the pipeline.

const BORE_ON_LABEL: Record<string, string> = {
  draft: "in Bore-ON",
  "in-review": "designed",
  approved: "design approved",
  transferred: "job in Bore-ON",
  archived: "archived",
};

const inputCls =
  "px-3 py-2 bg-muted border border-border rounded-md text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary";

export function LeadQuotes({ lead }: { lead: Lead }) {
  const { getIdToken } = useAuth();
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const constraints = useMemo(() => [where("leadId", "==", lead.id)], [lead.id]);
  const { data, loading } = useFirestoreCollection<QuoteRequest>("quoteRequests", { constraints });
  const quotes = useMemo(
    () => [...data].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    [data]
  );

  const [adding, setAdding] = useState(false);
  const [address, setAddress] = useState("");
  const [serviceType, setServiceType] = useState(lead.serviceType || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const add = async () => {
    setErr("");
    setBusy(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const { quoteId } = await createQuoteForLead(lead.id, { address, serviceType }, token);
      router.push(`/admin/quotes/${quoteId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't start the quote");
      setBusy(false);
    }
  };

  if (lead.stage === "not_a_lead") return null;

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">
          Quotes{quotes.length > 1 ? ` (${quotes.length})` : ""}
        </p>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs px-2.5 py-1 border border-border rounded-md hover:border-primary hover:text-primary transition-colors"
          >
            <Plus className="h-3 w-3" /> {quotes.length ? "Quote another site" : "Make a quote"}
          </button>
        )}
      </div>

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : quotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No quote yet.</p>
      ) : (
        <ul className="space-y-1">
          {quotes.map((q) => {
            const status = q.estimateStatus && q.estimateStatus !== "draft"
              ? `${q.estimateStatus}${q.version ? ` v${q.version}` : ""}`
              : "draft";
            return (
              <li key={q.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                <Link href={`/admin/quotes/${q.id}`} className="text-primary hover:underline font-medium">
                  {q.address || "No address yet"}
                </Link>
                <span className="text-muted-foreground capitalize">{status}</span>
                {(q.estimateStatus === "sent" || q.estimateStatus === "viewed") &&
                  q.expiresAt &&
                  new Date(q.expiresAt).getTime() < now && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">Expired</span>
                  )}
                {typeof q.quotedPrice === "number" && q.quotedPrice > 0 && (
                  <span className="tabular-nums">{money(q.quotedPrice)}</span>
                )}
                {q.boreOnStatus && (
                  <span className="text-xs text-muted-foreground">{BORE_ON_LABEL[q.boreOnStatus] ?? q.boreOnStatus}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <div className="flex flex-wrap gap-2 items-start">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Job site address"
            aria-label="Job site address"
            className={`${inputCls} flex-1 min-w-[220px]`}
            autoFocus
          />
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            aria-label="Service"
            className={inputCls}
          >
            <option value="">Service...</option>
            {SERVICES.map((s) => (
              <option key={s.slug} value={s.slug}>{s.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={add}
            disabled={busy || !address.trim()}
            className="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50 flex items-center gap-2"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Start quote
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setErr(""); }}
            disabled={busy}
            className="px-3 py-2 text-sm border border-border rounded-md hover:bg-muted"
          >
            Cancel
          </button>
          {err && <p className="w-full text-sm text-destructive">{err}</p>}
        </div>
      )}
    </div>
  );
}
