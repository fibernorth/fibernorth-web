"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Link2, Search, UserPlus } from "lucide-react";
import { useAuth } from "@/context/auth-provider";
import { useIsOwner } from "@/hooks/use-is-owner";
import { useFirestoreCollection } from "@/hooks/use-firestore-collection";
import { attachQuoteToLead } from "@/actions/quotes";
import { STAGE_LABELS, type Lead, type LeadStage } from "@/lib/leads";
import { buildHaystack, matchesSearch } from "@/lib/quote-search";
import { indexLeads, suggestLeadsForQuote } from "@/lib/quote-links";
import type { QuoteRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

// "Attach to lead" on a quote that has none (owners only): pick the lead
// from suggestions (same phone, email, name or address) or a search, or
// make a new lead from the quote. The server links both sides and logs it.

const btn =
  "px-3 py-1.5 min-h-11 sm:min-h-0 rounded-md text-sm border flex items-center justify-center gap-1.5 disabled:opacity-50";
const inputCls =
  "w-full px-3 py-2 min-h-11 sm:min-h-0 bg-muted border border-border rounded-md text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary";

type QuoteForAttach = Pick<QuoteRequest, "id" | "name" | "phone" | "email" | "address">;

export function AttachQuoteToLead({
  quote,
  leads: given,
  onDone,
  compact,
}: {
  quote: QuoteForAttach;
  /** The leads, when the page already has them (else loaded on open). */
  leads?: Lead[];
  onDone?: (leadId: string) => void;
  /** Smaller button (the Quotes list). */
  compact?: boolean;
}) {
  const isOwner = useIsOwner();
  const { getIdToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean; leadId?: string } | null>(null);
  const loaded = useFirestoreCollection<Lead>(open && !given ? "leads" : null);
  const leads = useMemo(() => given ?? loaded.data, [given, loaded.data]);

  const suggestions = useMemo(() => {
    if (!open) return [];
    const out = suggestLeadsForQuote(quote, leads, 5);
    // A lead that already points at this quote (the old one-way link) first.
    const pointer = indexLeads(leads).byQuoteId.get(quote.id);
    if (pointer && !out.some((s) => s.lead.id === pointer.id)) out.unshift({ lead: pointer, why: "already points at this quote" });
    return out;
  }, [open, quote, leads]);

  const results = useMemo(() => {
    if (!open || !q.trim()) return [];
    return leads
      .filter((l) => matchesSearch(q, buildHaystack([l.name, l.contactName, l.email, l.address, l.phone], [l.phone])))
      .slice(0, 8);
  }, [open, q, leads]);

  if (!isOwner) return null;

  const run = async (leadId: string, label: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const r = await attachQuoteToLead(quote.id, leadId, token);
      if (!r.ok) throw new Error(r.error);
      setMsg({ text: label, error: false, leadId: r.leadId });
      setOpen(false);
      setQ("");
      onDone?.(r.leadId);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Couldn't attach the quote", error: true });
    } finally {
      setBusy(false);
    }
  };

  const pick = (l: Lead) => {
    if (!window.confirm(`Put this quote on ${l.name || "that lead"}?`)) return;
    void run(l.id, `Attached to ${l.name || "the lead"}.`);
  };

  const row = (l: Lead, why?: string) => (
    <li key={l.id}>
      <button
        type="button"
        disabled={busy}
        onClick={() => pick(l)}
        className="w-full text-left px-3 py-2 min-h-11 sm:min-h-0 rounded-md hover:bg-muted text-sm disabled:opacity-50"
      >
        <span className="font-medium">{l.name || "(no name)"}</span>
        <span className="text-muted-foreground"> · {STAGE_LABELS[l.stage as LeadStage] ?? l.stage}</span>
        {why && <span className="ml-1 text-xs text-accent">({why})</span>}
        <span className="block text-muted-foreground truncate">
          {[l.contactName, l.phone, l.email, l.address].filter(Boolean).join(" · ")}
        </span>
      </button>
    </li>
  );

  return (
    <div className="space-y-2">
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setMsg(null);
          }}
          className={cn(btn, "border-secondary/60 text-secondary hover:bg-secondary/10", compact && "text-xs px-2.5 py-1")}
        >
          <Link2 className="h-4 w-4" /> Attach to lead
        </button>
      ) : (
        <div className="space-y-2 border border-border rounded-md p-3 bg-muted/30">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Which lead is this quote for?</p>
            <button type="button" onClick={() => setOpen(false)} className="text-sm underline text-muted-foreground">
              Cancel
            </button>
          </div>
          {loaded.loading && !given ? (
            <p className="text-sm text-muted-foreground">Loading leads…</p>
          ) : (
            <>
              {suggestions.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Likely matches</p>
                  <ul className="space-y-1">{suggestions.map((s) => row(s.lead, s.why))}</ul>
                </>
              )}
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  aria-label="Find a lead"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Name, phone, email or address"
                  className={cn(inputCls, "pl-9")}
                />
              </div>
              {q.trim() && (results.length === 0 ? <p className="text-sm text-muted-foreground">No lead matches.</p> : <ul className="space-y-1">{results.map((l) => row(l))}</ul>)}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`Make a new lead for ${quote.name || "this customer"} from this quote?`)) return;
                  void run("", "Made a new lead from this quote.");
                }}
                className={cn(btn, "border-border hover:bg-muted")}
              >
                <UserPlus className="h-4 w-4" /> None of these: make a new lead
              </button>
            </>
          )}
        </div>
      )}
      {msg && (
        <p className={cn("text-sm", msg.error ? "text-destructive" : "text-accent")}>
          {msg.text}{" "}
          {msg.leadId && (
            <Link href={`/admin/leads?lead=${msg.leadId}`} className="underline">
              Open lead
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
