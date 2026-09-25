"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, ExternalLink, Loader2, Mail, MessageSquare, Pencil, Phone, Send } from "lucide-react";
import { useFirestoreDocument } from "@/hooks/use-firestore-document";
import { useAuth } from "@/context/auth-provider";
import { QuoteWorkbench, type WorkbenchSaveResult, type WorkbenchState } from "@/components/admin/quote-workbench";
import {
  checkEmailDelivery,
  getLeadContact,
  resendProposalEmail,
  sendProposal,
  undoAcceptance,
  updateQuoteContact,
} from "@/actions/quotes";
import { DEFAULT_VALID_DAYS, defaultScope, isDefaultScope, money, proposalUrl } from "@/lib/proposal";
import { cn } from "@/lib/utils";
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

  return <QuoteBody quote={quote} />;
}

const LEAVE_WARNING = "This quote has changes that aren't saved. Leave without saving?";

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** A sent quote past its good-through date, still waiting on the customer. */
function isQuoteExpired(quote: QuoteRequest, now: number): boolean {
  const status = quote.estimateStatus || "draft";
  return (status === "sent" || status === "viewed") && !!quote.expiresAt && new Date(quote.expiresAt).getTime() < now;
}

/** The page once the quote has loaded: workbench and send panel share state here. */
function QuoteBody({ quote }: { quote: QuoteRequest }) {
  const workbenchSave = useRef<(() => Promise<WorkbenchSaveResult>) | null>(null);
  const [now] = useState(() => Date.now());
  const [wb, setWb] = useState<WorkbenchState>({
    dirty: false,
    total: typeof quote.quotedPrice === "number" ? quote.quotedPrice : null,
    feet: quote.mapAnnotation?.runFeet ?? 0,
  });

  // Scope: the default follows the footage until the estimator types his own.
  const initialCustom = !!quote.scopeText && !isDefaultScope(quote.scopeText, quote.serviceType);
  const [scopeDraft, setScopeDraft] = useState(initialCustom ? quote.scopeText || "" : "");
  const [scopeCustom, setScopeCustom] = useState(initialCustom);
  const scope = scopeCustom ? scopeDraft : defaultScope(quote.serviceType, wb.feet || undefined);

  // Warn before closing the tab or reloading with unsaved work.
  useEffect(() => {
    if (!wb.dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [wb.dirty]);

  const status = quote.estimateStatus || "draft";
  const expired = isQuoteExpired(quote, now);

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <Link
          href={quote.leadId ? `/admin/leads?lead=${quote.leadId}` : "/admin/quotes"}
          onClick={(e) => {
            if (wb.dirty && !window.confirm(LEAVE_WARNING)) e.preventDefault();
          }}
          className="text-sm text-primary inline-flex items-center gap-1 min-h-[44px]"
        >
          <ArrowLeft className="h-4 w-4" /> {quote.leadId ? "Back to lead" : "Back to quotes"}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 justify-end">
          {quote.viewedAt && (
            <span className="text-xs text-muted-foreground">
              Viewed {shortDate(quote.viewedAt)}
              {quote.viewCount && quote.viewCount > 0 ? `, ${quote.viewCount} ${quote.viewCount === 1 ? "time" : "times"}` : ""}
              {quote.lastViewedAt && quote.viewCount && quote.viewCount > 1 ? ` (last ${shortDate(quote.lastViewedAt)})` : ""}
            </span>
          )}
          {quote.expiresAt && (status === "sent" || status === "viewed") && (
            <span className={cn("text-xs", expired ? "text-destructive" : "text-muted-foreground")}>
              {expired ? `Expired ${shortDate(quote.expiresAt)}` : `Good through ${shortDate(quote.expiresAt)}`}
            </span>
          )}
          <span className={cn("text-xs px-2.5 py-1 rounded-full capitalize", STATUS_STYLES[status] ?? "bg-muted")}>
            {status}
            {quote.version ? ` · v${quote.version}` : ""}
          </span>
          {expired && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-destructive/10 text-destructive font-medium">Expired</span>
          )}
        </div>
      </div>

      <ContactCard quote={quote} />

      {quote.description && (
        <p className="text-sm bg-muted rounded-md p-3 text-muted-foreground">{quote.description}</p>
      )}

      <QuoteWorkbench
        quote={quote}
        onClose={() => {
          if (!wb.dirty || window.confirm(LEAVE_WARNING)) history.back();
        }}
        saveRef={workbenchSave}
        scopeText={scope}
        scopeCustom={scopeCustom}
        onStateChange={setWb}
      />

      <SendPanel
        quote={quote}
        saveRef={workbenchSave}
        scope={scope}
        scopeCustom={scopeCustom}
        onScopeChange={(v) => {
          setScopeDraft(v);
          setScopeCustom(true);
        }}
        onScopeReset={() => {
          setScopeDraft("");
          setScopeCustom(false);
        }}
        onScreenTotal={wb.total}
        dirty={wb.dirty}
        expired={expired}
      />
    </div>
  );
}

/** Who the quote is for: shown as a card, edited in place. */
function ContactCard({ quote }: { quote: QuoteRequest }) {
  const { getIdToken } = useAuth();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [f, setF] = useState({ name: quote.name || "", phone: quote.phone || "", email: quote.email || "", address: quote.address || "" });

  const start = () => {
    setF({ name: quote.name || "", phone: quote.phone || "", email: quote.email || "", address: quote.address || "" });
    setErr("");
    setEditing(true);
  };
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      await updateQuoteContact(quote.id, f, token);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs text-muted-foreground space-y-1">
            <span>Customer name</span>
            <input value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} className={inputCls} autoFocus />
          </label>
          <label className="text-xs text-muted-foreground space-y-1">
            <span>Phone</span>
            <input value={f.phone} onChange={(e) => setF((p) => ({ ...p, phone: e.target.value }))} className={inputCls} inputMode="tel" />
          </label>
          <label className="text-xs text-muted-foreground space-y-1">
            <span>Email</span>
            <input value={f.email} onChange={(e) => setF((p) => ({ ...p, email: e.target.value }))} className={inputCls} inputMode="email" />
          </label>
          <label className="text-xs text-muted-foreground space-y-1">
            <span>Job address</span>
            <input value={f.address} onChange={(e) => setF((p) => ({ ...p, address: e.target.value }))} className={inputCls} />
          </label>
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={busy} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50 flex items-center gap-2">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save details
          </button>
          <button onClick={() => setEditing(false)} disabled={busy} className="px-3 py-2 text-sm border border-border rounded-md hover:bg-muted">
            Cancel
          </button>
          {quote.version ? (
            <span className="text-xs text-muted-foreground">Sent quotes keep the old details until you re-send.</span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
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
      <button
        type="button"
        onClick={start}
        className="ml-auto inline-flex items-center gap-1 text-xs px-2.5 py-1.5 border border-border rounded-md hover:bg-muted"
      >
        <Pencil className="h-3.5 w-3.5" /> Edit details
      </button>
    </div>
  );
}

function SendPanel({
  quote,
  saveRef,
  scope,
  scopeCustom,
  onScopeChange,
  onScopeReset,
  onScreenTotal,
  dirty,
  expired,
}: {
  quote: QuoteRequest;
  saveRef: { current: (() => Promise<WorkbenchSaveResult>) | null };
  scope: string;
  scopeCustom: boolean;
  onScopeChange: (v: string) => void;
  onScopeReset: () => void;
  /** The total on screen in the workbench right now. */
  onScreenTotal: number | null;
  dirty: boolean;
  expired: boolean;
}) {
  const { getIdToken } = useAuth();

  // The email on the lead card wins over the quote's copy: the quote copies
  // it once when it's made, and a fix made on the lead afterward only lives
  // on the lead.
  const [leadEmail, setLeadEmail] = useState("");
  useEffect(() => {
    if (!quote.leadId) return;
    let live = true;
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const c = await getLeadContact(quote.leadId!, token);
        if (live && c?.email) setLeadEmail(c.email);
      } catch {
        /* the quote's own email still works */
      }
    })();
    return () => {
      live = false;
    };
  }, [quote.leadId, getIdToken]);
  const quoteEmail = (quote.email || "").trim().toLowerCase();
  const fileEmail = leadEmail || quoteEmail;
  const leadNewer = !!leadEmail && leadEmail !== quoteEmail;

  const [to, setTo] = useState(quote.email || "");
  // Keep the address in step with the email on file (lead first, then the
  // quote) until the estimator types his own.
  const [toTouched, setToTouched] = useState(false);
  useEffect(() => {
    if (!toTouched) setTo(fileEmail);
  }, [fileEmail, toTouched]);
  const [message, setMessage] = useState("");
  const [days, setDays] = useState(String(DEFAULT_VALID_DAYS));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [url, setUrl] = useState(quote.proposalId ? proposalUrl(quote.proposalId) : "");
  const [copied, setCopied] = useState(false);
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

  const accepted = quote.estimateStatus === "accepted";
  const sentVersion = quote.version || 0;
  // Changes the customer would see, saved after the last send, mean their
  // copy is out of date. contentChangedAt (not updatedAt) so a Save with
  // nothing changed doesn't ask for a pointless revision.
  const editedSinceSend = sentVersion > 0 && !!quote.sentAt && (quote.contentChangedAt || "") > quote.sentAt;
  const primaryBtn =
    "px-4 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold disabled:opacity-50 flex items-center gap-2";
  const secondaryBtn =
    "px-4 py-2.5 border border-border rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-2";

  // Every send saves the workbench first, so the customer gets what's on screen.
  const saveFirst = async (): Promise<WorkbenchSaveResult | null> => {
    const fn = saveRef.current;
    if (!fn) return null;
    const r = await fn();
    if (!r.ok) {
      setErr(r.error || "Couldn't save the quote. Nothing was sent.");
      return r;
    }
    if (r.price === null) {
      setErr("Add a price or line items before sending.");
      return { ...r, ok: false };
    }
    return r;
  };

  // "Send again": if the quote changed since it went out, send the update as a
  // new version; otherwise re-send the same version.
  const sendAgainSmart = async () => {
    setErr("");
    setMsg("");
    setResending(true);
    const r = await saveFirst();
    setResending(false);
    if (r && !r.ok) return;
    // An expired link is dead: send a fresh version (same price, new date).
    if ((r && r.changed) || editedSinceSend || expired) await send(true, true);
    else await emailAgain();
  };

  const send = async (sendEmail: boolean, alreadySaved = false) => {
    setBusy(true);
    setErr("");
    setMsg("");
    if (!alreadySaved) {
      const r = await saveFirst();
      if (r && !r.ok) {
        setBusy(false);
        return;
      }
    }
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const r = await sendProposal(
        quote.id,
        { to, message, scopeText: scope, validDays: Number(days) || DEFAULT_VALID_DAYS, sendEmail },
        token
      );
      setUrl(r.url);
      if (sendEmail && r.emailed) setMsg(`Version ${r.version} emailed to ${to}.`);
      else if (sendEmail && r.emailError) setErr(`Version ${r.version} is ready, but ${r.emailError}`);
      else setMsg(`Version ${r.version} is ready. Copy or text the link.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setBusy(false);
    }
  };

  const [resending, setResending] = useState(false);
  const emailAgain = async () => {
    setResending(true);
    setErr("");
    setMsg("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const r = await resendProposalEmail(quote.id, { to, message }, token);
      if (r.emailed) setMsg(`Version ${r.version} emailed again to ${to}.`);
      else setErr(`Couldn't email it: ${r.emailError}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't email it");
    } finally {
      setResending(false);
    }
  };

  const when = (iso: string) =>
    new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

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
          {onScreenTotal && onScreenTotal > 0 ? (
            <>
              Total on screen: <strong className="text-foreground">{money(onScreenTotal)}</strong>
              {dirty && !accepted ? " (saved when you send)" : ""}
            </>
          ) : (
            "No price yet"
          )}
        </p>
      </div>

      {expired && !accepted && (
        <p className="text-sm rounded-md border border-destructive/40 bg-destructive/5 p-3">
          Version {sentVersion} expired{quote.expiresAt ? ` ${new Date(quote.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}.
          Its link only says the quote expired. Send a fresh copy: same price, new good-through date.
        </p>
      )}

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
              <input type="email" value={to} onChange={(e) => { setTo(e.target.value); setToTouched(true); }} className={inputCls} placeholder="name@example.com" />
              {to.trim().toLowerCase().endsWith("@fibernorth.com") || to.trim().toLowerCase().endsWith("@fibernorth.net") ? (
                <p className="text-xs text-destructive">That's a FiberNorth address, not the customer's. Put their email here.</p>
              ) : fileEmail && to.trim().toLowerCase() !== fileEmail ? (
                <p className="text-xs text-secondary">
                  Different from the email on {leadEmail ? "the lead" : "file"} ({fileEmail}).
                </p>
              ) : leadNewer && !toTouched ? (
                <p className="text-xs text-muted-foreground">
                  Using the lead&apos;s email. The quote had {quoteEmail || "none"}.
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Good for (days)</label>
              <input type="number" min={1} max={120} value={days} onChange={(e) => setDays(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label htmlFor={`scope-${quote.id}`} className="text-xs font-medium text-muted-foreground">
                Scope (what the customer reads above the map)
              </label>
              {scopeCustom ? (
                <button type="button" onClick={onScopeReset} className="text-xs text-primary hover:underline min-h-[44px] sm:min-h-0">
                  Go back to the standard wording
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">Follows the drawn footage until you edit it</span>
              )}
            </div>
            <textarea
              id={`scope-${quote.id}`}
              rows={3}
              value={scope}
              onChange={(e) => onScopeChange(e.target.value)}
              className={`${inputCls} resize-y`}
            />
            <p className="text-xs text-muted-foreground">Save quote saves this too.</p>
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
            {!sentVersion ? (
              <button
                onClick={() => send(true)}
                disabled={busy || resending || !to.includes("@")}
                className={primaryBtn}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Email the quote
              </button>
            ) : editedSinceSend ? (
              <>
                <button onClick={() => send(true)} disabled={busy || resending || !to.includes("@")} className={primaryBtn}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send revised quote (v{sentVersion + 1})
                </button>
                {!expired && (
                  <button onClick={emailAgain} disabled={resending || !to.includes("@")} className={secondaryBtn}>
                    {resending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Send v{sentVersion} again
                  </button>
                )}
              </>
            ) : expired ? (
              <button onClick={() => send(true)} disabled={busy || resending || !to.includes("@")} className={primaryBtn}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send a fresh copy (v{sentVersion + 1}, new date)
              </button>
            ) : (
              <>
                <button onClick={sendAgainSmart} disabled={busy || resending || !to.includes("@")} className={primaryBtn}>
                  {resending || busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send again
                </button>
                <button onClick={() => send(true)} disabled={busy || resending || !to.includes("@")} className={secondaryBtn}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Send as a new revision
                </button>
              </>
            )}
            <button
              onClick={() => send(false)}
              disabled={busy || resending}
              className="px-4 py-2.5 border border-border rounded-md text-sm font-medium disabled:opacity-50"
            >
              Make link only
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Sending saves the quote first, so the customer gets what you see above.</p>
        </>
      )}

      {msg && <p className="text-sm text-accent">{msg}</p>}
      {err && <p className="text-sm text-destructive">{err}</p>}

      {quote.lastEmail && (
        <p className={`text-xs ${quote.lastEmail.error ? "text-destructive" : "text-muted-foreground"}`}>
          {quote.lastEmail.error
            ? `Last email to ${quote.lastEmail.to} on ${when(quote.lastEmail.at)} failed: ${quote.lastEmail.error}`
            : `Emailed v${quote.lastEmail.version} to ${quote.lastEmail.to} on ${when(quote.lastEmail.at)}${
                quote.lastEmail.bcc?.length ? `, copy to ${quote.lastEmail.bcc.join(", ")}` : ""
              }${quote.lastEmail.id ? ` (Resend id ${quote.lastEmail.id})` : ""}`}
        </p>
      )}
      {quote.lastEmail && (
        <DeliveryCheck quoteId={quote.id} />
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
          {!accepted && !expired && (
            <button
              onClick={emailAgain}
              disabled={resending || !to.includes("@")}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Send this same version again, no new version"
            >
              {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Email it again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DeliveryCheck({ quoteId }: { quoteId: string }) {
  const { getIdToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ status: string; detail: string } | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("no token");
      setResult(await checkEmailDelivery(quoteId, token));
    } catch {
      setResult({ status: "unknown", detail: "Couldn't check right now. Try again in a minute." });
    } finally {
      setBusy(false);
    }
  };
  const bad = result && ["bounced", "complained", "failed", "delivery_delayed"].includes(result.status);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button onClick={run} disabled={busy} className="underline text-primary disabled:opacity-50 inline-flex items-center gap-1">
        {busy && <Loader2 className="h-3 w-3 animate-spin" />} Did they get it?
      </button>
      {result && <span className={bad ? "text-destructive" : "text-muted-foreground"}>{result.detail}</span>}
    </div>
  );
}
