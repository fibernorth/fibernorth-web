"use client";

import Link from "next/link";
import { useMemo } from "react";
import { where } from "firebase/firestore";
import { ExternalLink, Loader2, Shovel } from "lucide-react";
import { useFirestoreCollection } from "@/hooks/use-firestore-collection";
import { missDigQueue } from "@/lib/missdig";
import type { QuoteRequest } from "@/lib/types";

// The MISS DIG list: accepted quotes waiting on a ticket, then the tickets
// already entered (newest first) with their earliest dig day.

export default function MissDigPage() {
  const constraints = useMemo(() => [where("missDigStatus", "in", ["needed", "entered"])], []);
  const { data, loading } = useFirestoreCollection<QuoteRequest>("quoteRequests", { constraints });
  const needed = useMemo(() => missDigQueue(data), [data]);
  const entered = useMemo(
    () =>
      data
        .filter((q) => q.missDigStatus === "entered")
        .sort((a, b) => (b.missDigEnteredAt || "").localeCompare(a.missDigEnteredAt || ""))
        .slice(0, 30),
    [data]
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shovel className="h-6 w-6 text-secondary" /> MISS DIG
        </h1>
        <a
          href="https://www.missdig811.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm px-3 py-2 border border-border rounded-md hover:bg-muted"
        >
          Open missdig811.org <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      <p className="text-sm text-muted-foreground">
        Every accepted quote lands here. Open its sheet, enter the ticket at MISS DIG, then save the ticket number. The
        earliest dig day is 3 business days after the ticket goes in.
      </p>

      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="font-semibold">To enter ({needed.length})</h2>
            {needed.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing waiting. Nice.</p>
            ) : (
              <ul className="divide-y divide-border border border-border rounded-lg bg-card">
                {needed.map((q) => (
                  <li key={q.id} className="p-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link href={`/admin/missdig/${q.id}`} className="text-primary font-medium hover:underline">
                      {q.name || "Customer"}
                    </Link>
                    <span className="text-sm text-muted-foreground flex-1 min-w-[12rem]">{q.address || "no address"}</span>
                    <span className="text-xs text-muted-foreground">
                      accepted {(q.acceptedAt || q.missDigNeededAt || "").slice(0, 10)}
                    </span>
                    <Link
                      href={`/admin/missdig/${q.id}`}
                      className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium"
                    >
                      Open sheet
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold">Entered</h2>
            {entered.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tickets recorded yet.</p>
            ) : (
              <ul className="divide-y divide-border border border-border rounded-lg bg-card text-sm">
                {entered.map((q) => (
                  <li key={q.id} className="p-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link href={`/admin/missdig/${q.id}`} className="text-primary hover:underline">
                      {q.name || "Customer"}
                    </Link>
                    <span className="text-muted-foreground flex-1 min-w-[12rem]">{q.address}</span>
                    <span>Ticket {q.missDigTicket}</span>
                    <span className="text-muted-foreground">dig from {q.missDigDigDate}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
