"use client";

import { useState } from "react";
import Link from "next/link";

import { useFirestoreCollection } from "@/hooks/use-firestore-collection";
import { useAuth } from "@/context/auth-provider";
import { deleteQuote, updateQuoteListFields } from "@/actions/quotes";
import { isQuoteExpiredOn, money, sentTotalOf, statusOn, unsentChanges } from "@/lib/proposal";
import { useToday } from "@/hooks/use-today";
import { MessageSquareQuote, Loader2 } from "lucide-react";
import { orderBy } from "firebase/firestore";
import { SERVICES } from "@/lib/constants";
import type { QuoteRequest } from "@/lib/types";
import { QuoteMapViewer } from "@/components/admin/quote-map-viewer";
import { QuoteWorkbench } from "@/components/admin/quote-workbench";
import { DeleteDialog } from "@/components/admin/delete-dialog";

const statusColors: Record<string, string> = {
  new: "bg-primary/10 text-primary",
  contacted: "bg-secondary/10 text-secondary",
  quoted: "bg-accent/10 text-accent",
  closed: "bg-muted text-muted-foreground",
};

function serviceName(slugOrName: string): string {
  const match = SERVICES.find((s) => s.slug === slugOrName);
  return match ? match.name : slugOrName;
}

export default function AdminQuotesPage() {
  const { data, loading } = useFirestoreCollection<QuoteRequest>("quoteRequests", {
    constraints: [orderBy("createdAt", "desc")],
  });
  const { getIdToken } = useAuth();
  const today = useToday();
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [notesSaving, setNotesSaving] = useState<Record<string, boolean>>({});
  const [workbenchId, setWorkbenchId] = useState<string | null>(null);

  const setErr = (id: string, msg: string) =>
    setRowError((prev) => ({ ...prev, [id]: msg }));

  const updateStatus = async (id: string, status: string) => {
    setErr(id, "");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("no token");
      await updateQuoteListFields(id, { status }, token);
    } catch {
      setErr(id, "Couldn't save the status change — try again.");
    }
  };

  const saveNotes = async (id: string) => {
    setErr(id, "");
    setNotesSaving((prev) => ({ ...prev, [id]: true }));
    try {
      const token = await getIdToken();
      if (!token) throw new Error("no token");
      await updateQuoteListFields(id, { notes: notesDraft[id] ?? "" }, token);
    } catch {
      setErr(id, "Couldn't save the notes — try again.");
    } finally {
      setNotesSaving((prev) => ({ ...prev, [id]: false }));
    }
  };

  // Every design ever sent to Bore-ON, read back and applied in one go.
  const [pullingAll, setPullingAll] = useState(false);
  const [pullAllNote, setPullAllNote] = useState("");
  const anySent = data.some((q) => Boolean(q.boreOnDesignId));
  const pullAll = async () => {
    setPullAllNote("");
    setPullingAll(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("no token");
      const res = await fetch("/api/bore-on/pull-all", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPullAllNote(body.error || "Couldn't pull from Bore-ON.");
        return;
      }
      const parts = [
        `Pulled ${body.pulled} design${body.pulled === 1 ? "" : "s"}`,
        `re-priced ${body.repriced}`,
        `${body.unchanged} unchanged`,
      ];
      const skipped = (body.skipped ?? []) as Array<{ name: string }>;
      let note = `${parts.join(", ")}.`;
      if (skipped.length) note += ` Couldn't read: ${skipped.map((s) => s.name).join(", ")}.`;
      setPullAllNote(note);
    } catch {
      setPullAllNote("Couldn't pull from Bore-ON — try again.");
    } finally {
      setPullingAll(false);
    }
  };

  // Voids the quote's customer links and fixes the lead's quote fields too.
  const removeQuote = async (id: string) => {
    const token = await getIdToken();
    if (!token) throw new Error("Session expired — log in again");
    await deleteQuote(id, token);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MessageSquareQuote className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Quote Requests</h1>
        {data.length > 0 && (
          <span className="text-sm bg-primary/10 text-primary px-2.5 py-0.5 rounded-full">
            {data.filter((q) => q.status === "new").length} new
          </span>
        )}
        {anySent && (
          <button
            type="button"
            onClick={pullAll}
            disabled={pullingAll}
            className="ml-auto px-3 py-1.5 border border-border rounded-md text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-50"
          >
            {pullingAll ? "Pulling..." : "Pull all from Bore-ON"}
          </button>
        )}
      </div>
      {pullAllNote && <p className="text-xs text-muted-foreground -mt-3">{pullAllNote}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <p className="text-muted-foreground">No quote requests yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.map((quote) => (
            <div key={quote.id} className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h3 className="font-semibold">{quote.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {quote.phone} &middot; {quote.email}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/quotes/${quote.id}`}
                    className={`text-xs px-2.5 py-1 rounded-md border capitalize ${
                      isQuoteExpiredOn(quote, today)
                        ? "border-destructive text-destructive hover:bg-destructive/10"
                        : "border-primary text-primary hover:bg-primary/10"
                    }`}
                  >
                    {quote.estimateStatus && quote.estimateStatus !== "draft"
                      ? `${statusOn(quote, today)}${quote.version ? ` v${quote.version}` : ""}`
                      : "Open"}
                  </Link>
                  <select
                    value={quote.status}
                    onChange={(e) => updateStatus(quote.id, e.target.value)}
                    className={`text-xs px-2.5 py-1 rounded-full border-0 cursor-pointer ${statusColors[quote.status] || ""}`}
                  >
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="quoted">Quoted</option>
                    <option value="closed">Closed</option>
                  </select>
                  <DeleteDialog
                    itemName={`quote from ${quote.name}`}
                    onDelete={() => removeQuote(quote.id)}
                  />
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-2 text-sm mb-3">
                <div>
                  <span className="text-muted-foreground">Service: </span>
                  <span>{quote.serviceType ? serviceName(quote.serviceType) : "Not specified"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Address: </span>
                  <span>{quote.address || "Not provided"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Urgency: </span>
                  <span className="capitalize">{quote.urgency || "flexible"}</span>
                </div>
              </div>
              {quote.mapAnnotation &&
                (quote.mapAnnotation.runFeet ||
                  quote.mapAnnotation.service ||
                  quote.mapAnnotation.pipeSize) && (
                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    {typeof quote.mapAnnotation.runFeet === "number" &&
                      Number.isFinite(quote.mapAnnotation.runFeet) &&
                      quote.mapAnnotation.runFeet > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          ~{Math.round(quote.mapAnnotation.runFeet)} ft
                        </span>
                      )}
                    {quote.mapAnnotation.service && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {String(quote.mapAnnotation.service).replace(/-/g, " ").slice(0, 60)}
                      </span>
                    )}
                    {quote.mapAnnotation.pipeSize && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        pipe: {String(quote.mapAnnotation.pipeSize).replace(/-/g, " ").slice(0, 60)}
                      </span>
                    )}
                    {quote.soilType && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        ground: {String(quote.soilType).replace(/-/g, " ").slice(0, 60)}
                      </span>
                    )}
                  </div>
                )}
              {quote.description && (
                <p className="text-sm text-muted-foreground bg-muted rounded p-3">
                  {quote.description}
                </p>
              )}
              {quote.howHeard && (
                <p className="text-sm mt-3">
                  <span className="text-muted-foreground">How they heard about us: </span>
                  <span>{quote.howHeard}</span>
                </p>
              )}
              {typeof quote.quotedPrice === "number" && (
                <div className="text-sm mt-3">
                  {(() => {
                    // What the customer was sent, then any saved changes they haven't seen.
                    const sent = sentTotalOf(quote);
                    const unsent = unsentChanges(quote);
                    return sent !== null ? (
                      <>
                        <span className="text-muted-foreground">Sent: </span>
                        <span className="font-semibold text-primary">{money(sent)}</span>
                        {unsent.changed && (
                          <span className="ml-2 text-xs text-secondary">
                            Unsent changes{unsent.total !== null ? `: ${money(unsent.total)}` : ""}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-muted-foreground">Quoted price: </span>
                        <span className="font-semibold text-primary">{money(quote.quotedPrice!)}</span>
                      </>
                    );
                  })()}
                  {Array.isArray(quote.quoteLines) && quote.quoteLines.length > 0 && (
                    <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      {quote.quoteLines.map((l, i) => (
                        <li key={i}>
                          {l.kind === "material" ? "Material" : "Work"}
                          {l.description ? `: ${l.description}` : ""} — {l.qty} ×{" "}
                          {money(Number(l.unitPrice) || 0)}
                          {l.kind === "material" ? " (+6% tax)" : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {workbenchId === quote.id ? (
                <div className="mt-3">
                  <QuoteWorkbench quote={quote} onClose={() => setWorkbenchId(null)} />
                </div>
              ) : (
                <>
                  {quote.mapAnnotation && (
                    <div className="mt-3">
                      <QuoteMapViewer annotation={quote.mapAnnotation} />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setWorkbenchId(quote.id)}
                    className="mt-3 px-3 py-2 text-xs font-medium border border-border rounded-md hover:border-primary hover:text-primary transition-colors"
                  >
                    {quote.mapAnnotation ? "Edit map & work up price" : "Draw map & work up price"}
                  </button>
                </>
              )}
              {rowError[quote.id] && (
                <p role="alert" className="text-sm text-destructive mt-3">
                  {rowError[quote.id]}
                </p>
              )}
              <div className="mt-3">
                <label htmlFor={`notes-${quote.id}`} className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Notes
                </label>
                <div className="flex gap-2 mt-1">
                  <textarea
                    id={`notes-${quote.id}`}
                    rows={2}
                    value={notesDraft[quote.id] ?? quote.notes ?? ""}
                    onChange={(e) => setNotesDraft((prev) => ({ ...prev, [quote.id]: e.target.value }))}
                    placeholder="Internal notes — quoted price, follow-up date, etc."
                    className="flex-1 px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                  <button
                    onClick={() => saveNotes(quote.id)}
                    disabled={notesSaving[quote.id]}
                    className="self-end px-3 py-2 text-xs border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {notesSaving[quote.id] ? "Saving..." : "Save Notes"}
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {quote.createdAt ? new Date(quote.createdAt).toLocaleString() : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
