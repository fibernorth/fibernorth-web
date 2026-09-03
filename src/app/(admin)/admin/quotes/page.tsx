"use client";

import { useState } from "react";

import { useFirestoreCollection } from "@/hooks/use-firestore-collection";
import { useAuth } from "@/context/auth-provider";
import { updateDocument, deleteDocument } from "@/actions/crud";
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
      await updateDocument("quoteRequests", id, { status }, token);
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
      await updateDocument("quoteRequests", id, { notes: notesDraft[id] ?? "" }, token);
    } catch {
      setErr(id, "Couldn't save the notes — try again.");
    } finally {
      setNotesSaving((prev) => ({ ...prev, [id]: false }));
    }
  };

  const deleteQuote = async (id: string) => {
    const token = await getIdToken();
    if (!token) throw new Error("Session expired — log in again");
    await deleteDocument("quoteRequests", id, token);
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
      </div>

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
                    onDelete={() => deleteQuote(quote.id)}
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
                <p className="text-sm mt-3">
                  <span className="text-muted-foreground">Quoted price: </span>
                  <span className="font-semibold text-primary">
                    ${quote.quotedPrice.toLocaleString()}
                  </span>
                </p>
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
