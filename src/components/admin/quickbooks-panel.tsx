"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-provider";
import { getQuickBooksConnected } from "@/actions/integrations";
import type { QuoteRequest } from "@/lib/types";

// Send to QuickBooks on the quote screen. The estimate's number, link and the
// last error come from the live quote doc (the server writes them), so an
// estimate sent by a customer's acceptance shows up here too.

export function QuickBooksPanel({ quote, dirty }: { quote: QuoteRequest; dirty: boolean }) {
  const { getIdToken } = useAuth();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  // What the last send here returned, until the live doc catches up.
  const [sent, setSent] = useState<{ docNumber: string; url: string } | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const r = await getQuickBooksConnected(token);
        if (live) setConnected(r.connected);
      } catch {
        if (live) setConnected(null);
      }
    })();
    return () => {
      live = false;
    };
  }, [getIdToken]);

  const docNumber = quote.qboDocNumber || sent?.docNumber || "";
  const url = quote.qboUrl || sent?.url || "";
  const hasEstimate = Boolean(quote.qboEstimateId || sent);
  const lastError = error || (quote.qboError && !sent ? quote.qboError : "");

  const send = async () => {
    setSending(true);
    setError("");
    setNote("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again.");
      const res = await fetch("/api/quickbooks/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quote.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.notConnected) setConnected(false);
        setError(body.error || `QuickBooks send failed (${res.status}).`);
        return;
      }
      setSent({ docNumber: body.docNumber || "", url: body.url || "" });
      const label = body.docNumber ? `Estimate #${body.docNumber}` : "Estimate";
      setNote(`${label} ${body.created ? "created" : "updated"} in QuickBooks.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "QuickBooks send failed. Try again.");
    } finally {
      setSending(false);
    }
  };

  if (connected === false && !hasEstimate) {
    return (
      <p className="text-xs text-muted-foreground">
        QuickBooks isn&apos;t connected. Bill can connect it in Settings to send quotes over as estimates.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={send}
        disabled={sending || dirty || connected !== true}
        title={dirty ? "Save the quote first" : undefined}
        className="px-4 py-2 border border-border rounded-md text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50"
      >
        {sending ? "Sending..." : hasEstimate ? "Update in QuickBooks" : "Send to QuickBooks"}
      </button>
      {hasEstimate && url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline font-medium">
          {docNumber ? `Estimate #${docNumber} · ` : ""}Open in QuickBooks →
        </a>
      )}
      {dirty && !sending && <span className="text-xs text-muted-foreground">Save the quote first.</span>}
      {connected === false && hasEstimate && (
        <span className="text-xs text-muted-foreground">QuickBooks isn&apos;t connected (Settings).</span>
      )}
      {quote.estimateStatus === "accepted" && !dirty && connected && (
        <span className="text-xs text-muted-foreground">Sends the version the customer accepted.</span>
      )}
      {note && !lastError && <span className="text-xs text-muted-foreground">{note}</span>}
      {lastError && (
        <span role="alert" className="text-xs text-destructive">
          {lastError}
        </span>
      )}
    </div>
  );
}
