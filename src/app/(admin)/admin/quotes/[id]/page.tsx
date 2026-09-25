"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, ExternalLink, Loader2, Mail, MessageSquare, Phone, Send } from "lucide-react";
import { useFirestoreDocument } from "@/hooks/use-firestore-document";
import { useAuth } from "@/context/auth-provider";
import { QuoteWorkbench } from "@/components/admin/quote-workbench";
import { sendProposal, syncQuoteToQuickBooks, undoAcceptance } from "@/actions/quotes";
import { DEFAULT_VALID_DAYS, defaultScope, money, proposalUrl } from "@/lib/proposal";
import type { QuoteRequest } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-secondary/15 text-secondary",
  viewed: "bg-primary/15 text-primary",
  accepted: "bg-accent/20 text-accent",
  declined: "bg-destructive/10 text-destructive",
  expired: "bg-muted text-muted-foreground",
};

const inputCls =
  "w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary";

export default function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error } = useFirestoreDocument<Omit<QuoteRequest, "id">>(`quoteRequests/${id}`);
  const [fallback, setFallback] = useState<QuoteRequest | null>(null);
  const { getIdToken } = useAuth();

  // If client reads are blocked (rules not yet published), read through the server.
  useEffect(() => {
    if (!error) return;
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch(`/api/admin/quotes/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setFallback((await res.json()).quote);
    })();
  }, [error, id, getIdToken]);

  const quote: QuoteRequest | null = data ? ({ id, ...data } as QuoteRequest) : fallback;

  if (loading && !quote) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!quote) {
    return (
      <div className="space-y-4">
        <Link href="/admin/leads" className="text-sm text-primary inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to leads
        </Link>
        <p className="text-muted-foreground">Quote not found.</p>
      </div>
    );
  }

  const status = quote.estimateStatus || "draft";

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <Link
          href={quote.leadId ? `/admin/leads?lead=${quote.leadId}` : "/admin/quotes"}
          className="text-sm text-primary inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> {quote.leadId ? "Back to lead" : "Back to quotes"}
        </Link>
        <span className={`text-xs px-2.5 py-1 rounded-full capitalize ${STATUS_STYLES[status] ?? "bg-muted"}`}>
          {status}
          {quote.version ? ` · v${quote.version}` : ""}
        </span>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 flex flex-wrap gap-x-6 gap-y-2 items-center">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{quote.name || "(no name)"}</h1>
          <p className="text-sm text-muted-foreground">{quote.address || "No address yet. Search it on the map."}</p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {quote.phone && (
            <a href={`tel:${quote.phone}`} className="inline-flex items-center gap-1 text-primary">
              <Phone className="h-4 w-4" /> {quote.phone}
            </a>
          )}
          {quote.email && (
            <a href={`mailto:${quote.email}`} className="inline-flex items-center gap-1 text-primary">
              <Mail className="h-4 w-4" /> {quote.email}
            </a>
          )}
        </div>
      </div>

      {quote.description && (
        <p className="text-sm bg-muted rounded-md p-3 text-muted-foreground">{quote.description}</p>
      )}

      <QuoteWorkbench quote={quote} onClose={() => history.back()} />

      <SendPanel quote={quote} />
    </div>
  );
}

function SendPanel({ quote }: { quote: QuoteRequest }) {
  const { getIdToken } = useAuth();
  const [to, setTo] = useState(quote.email || "");
  const [scope, setScope] = useState(quote.scopeText || defaultScope(quote.serviceType, quote.mapAnnotation?.runFeet));
  const [message, setMessage] = useState("");
  const [days, setDays] = useState(String(DEFAULT_VALID_DAYS));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [url, setUrl] = useState(quote.proposalId ? proposalUrl(quote.proposalId) : "");
  const [copied, setCopied] = useState(false);
  const [qboBusy, setQboBusy] = useState(false);
  const [qboNote, setQboNote] = useState("");
  const [undoStep, setUndoStep] = useState<0 | 1 | 2>(0);

  const undo = async () => {
    if (undoStep === 0) {
      setUndoStep(1);
      return;
    }
    setUndoStep(2);
    setErr("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      await undoAcceptance(quote.id, token);
      setMsg("Acceptance undone. The quote is back to sent and can be revised.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't undo");
    } finally {
      setUndoStep(0);
    }
  };

  const recordInQuickBooks = async () => {
    setQboBusy(true);
    setQboNote("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const r = await syncQuoteToQuickBooks(quote.id, token);
      if ("error" in r) setQboNote(r.error);
      else if ("skipped" in r) setQboNote("QuickBooks isn't connected, or recording is turned off in Settings.");
      else setQboNote(`Recorded in QuickBooks as estimate #${r.docNumber}.`);
    } catch (e) {
      setQboNote(e instanceof Error ? e.message : "Couldn't reach QuickBooks");
    } finally {
      setQboBusy(false);
    }
  };

  const saved = typeof quote.quotedPrice === "number" && quote.quotedPrice > 0 ? quote.quotedPrice : null;
  const accepted = quote.estimateStatus === "accepted";

  const send = async (sendEmail: boolean) => {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const r = await sendProposal(
        quote.id,
        { to, message, scopeText: scope, validDays: Number(days) || DEFAULT_VALID_DAYS, sendEmail },
        token
      );
      setUrl(r.url);
      if ("error" in r.quickbooks) setQboNote(`QuickBooks: ${r.quickbooks.error}`);
      else if ("docNumber" in r.quickbooks) setQboNote(`Recorded in QuickBooks as estimate #${r.quickbooks.docNumber}.`);
      if (sendEmail && r.emailed) setMsg(`Version ${r.version} emailed to ${to}.`);
      else if (sendEmail && r.emailError) setErr(`Version ${r.version} is ready, but ${r.emailError}`);
      else setMsg(`Version ${r.version} is ready. Copy or text the link.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const smsBody = encodeURIComponent(`Here's your quote from FiberNorth Underground: ${url}`);

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Send to the customer</h2>
        <p className="text-sm text-muted-foreground">
          Sends the last <strong>saved</strong> version: {saved ? <strong className="text-foreground">{money(saved)}</strong> : "nothing saved yet"}
        </p>
      </div>

      {accepted ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-accent font-medium">The customer accepted this quote. Start a new quote for any changes.</p>
          <button
            type="button"
            onClick={undo}
            disabled={undoStep === 2}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border disabled:opacity-50 ${
              undoStep === 1 ? "border-destructive text-destructive" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {undoStep === 2 ? "Undoing..." : undoStep === 1 ? "Yes, it was a test: undo it" : "Undo acceptance"}
          </button>
          {undoStep === 1 && (
            <button type="button" onClick={() => setUndoStep(0)} className="text-xs text-muted-foreground hover:underline">
              Keep it
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-[1fr_120px] gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Customer email</label>
              <input type="email" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} placeholder="name@example.com" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Good for (days)</label>
              <input type="number" min={1} max={120} value={days} onChange={(e) => setDays(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Scope (what the customer reads above the map)</label>
            <textarea rows={3} value={scope} onChange={(e) => setScope(e.target.value)} className={`${inputCls} resize-y`} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Note in the email (optional)</label>
            <textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className={`${inputCls} resize-y`}
              placeholder="Good talking with you today. Here's the number we talked about."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => send(true)}
              disabled={busy || !saved || !to.includes("@")}
              className="px-4 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {quote.version ? "Send revised quote" : "Email the quote"}
            </button>
            <button
              onClick={() => send(false)}
              disabled={busy || !saved}
              className="px-4 py-2.5 border border-border rounded-md text-sm font-medium disabled:opacity-50"
            >
              Make link only
            </button>
          </div>
          {!saved && <p className="text-xs text-muted-foreground">Save a price or line items in the workbench above first.</p>}
        </>
      )}

      {msg && <p className="text-sm text-accent">{msg}</p>}
      {err && <p className="text-sm text-destructive">{err}</p>}

      {(quote.proposalId || quote.qboEstimateId) && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {quote.qboEstimateUrl && quote.qboDocNumber && !quote.qboError ? (
            <a href={quote.qboEstimateUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary">
              <ExternalLink className="h-4 w-4" /> Estimate #{quote.qboDocNumber} in QuickBooks
            </a>
          ) : quote.qboError ? (
            <span className="text-destructive">QuickBooks: {quote.qboError}</span>
          ) : (
            <span className="text-muted-foreground">Not in QuickBooks yet.</span>
          )}
          {quote.proposalId && (
            <button
              type="button"
              onClick={recordInQuickBooks}
              disabled={qboBusy}
              className="px-3 py-1.5 border border-border rounded-md text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {qboBusy ? "Working..." : quote.qboError ? "Try again" : quote.qboEstimateId ? "Refresh in QuickBooks" : "Record in QuickBooks"}
            </button>
          )}
          {qboNote && <span className={qboNote.startsWith("Recorded") ? "text-accent" : "text-muted-foreground"}>{qboNote}</span>}
        </div>
      )}

      {url && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 text-sm">
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary font-medium">
            <ExternalLink className="h-4 w-4" /> See what the customer sees
          </a>
          <button onClick={copy} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy link"}
          </button>
          {quote.phone && (
            <a href={`sms:${quote.phone}?&body=${smsBody}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <MessageSquare className="h-4 w-4" /> Text it
            </a>
          )}
        </div>
      )}
    </div>
  );
}
