"use client";

import { useFirestoreCollection } from "@/hooks/use-firestore-collection";
import { useAuth } from "@/context/auth-provider";
import { updateDocument } from "@/actions/crud";
import { MessageSquareQuote, Loader2 } from "lucide-react";
import { orderBy } from "firebase/firestore";
import type { QuoteRequest } from "@/lib/types";
import { QuoteMapViewer } from "@/components/admin/quote-map-viewer";

const statusColors: Record<string, string> = {
  new: "bg-primary/10 text-primary",
  contacted: "bg-secondary/10 text-secondary",
  quoted: "bg-accent/10 text-accent",
  closed: "bg-muted text-muted-foreground",
};

export default function AdminQuotesPage() {
  const { data, loading } = useFirestoreCollection<QuoteRequest>("quoteRequests", {
    constraints: [orderBy("createdAt", "desc")],
  });
  const { getIdToken } = useAuth();

  const updateStatus = async (id: string, status: string) => {
    const token = await getIdToken();
    if (!token) return;
    await updateDocument("quoteRequests", id, { status }, token);
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
              </div>
              <div className="grid sm:grid-cols-3 gap-2 text-sm mb-3">
                <div>
                  <span className="text-muted-foreground">Service: </span>
                  <span>{quote.serviceType || "Not specified"}</span>
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
              {quote.mapAnnotation && (
                <div className="mt-3">
                  <QuoteMapViewer annotation={quote.mapAnnotation} />
                </div>
              )}
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
