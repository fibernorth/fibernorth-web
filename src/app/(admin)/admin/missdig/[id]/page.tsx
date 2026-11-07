"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, ExternalLink, Loader2, Printer, RotateCcw } from "lucide-react";
import { useFirestoreDocument } from "@/hooks/use-firestore-document";
import { useAuth } from "@/context/auth-provider";
import { useToday } from "@/hooks/use-today";
import { QuoteMapViewer } from "@/components/admin/quote-map-viewer";
import { markMissDigEntered, needMissDig } from "@/actions/missdig";
import { mapsLink, missDigSheet } from "@/lib/missdig";
import { COMPANY } from "@/lib/constants";
import type { Lead } from "@/lib/leads";
import type { QuoteRequest } from "@/lib/types";

// One accepted job's MISS DIG ticket sheet: everything the missdig811.org
// ticket asks for, each with a Copy button, plus the drawn map. Save the
// ticket number when it's in.

function CopyRow({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <div className="py-2 border-b border-border last:border-0 grid sm:grid-cols-[11rem_1fr_auto] gap-x-3 gap-y-1 items-start">
      <div className="text-xs uppercase tracking-wider text-muted-foreground pt-0.5">{label}</div>
      <div className={multiline ? "text-sm whitespace-pre-wrap" : "text-sm"}>{value}</div>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
          } catch {
            /* old browser: select by hand */
          }
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
        className="print:hidden justify-self-start text-xs px-2 py-1 border border-border rounded-md inline-flex items-center gap-1 hover:bg-muted"
      >
        {done ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export default function MissDigSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const today = useToday();
  const { getIdToken } = useAuth();
  const { data: quote, loading } = useFirestoreDocument<QuoteRequest>(`quoteRequests/${id}`);
  const { data: lead } = useFirestoreDocument<Lead>(quote?.leadId ? `leads/${quote.leadId}` : null);
  const sheet = useMemo(
    () =>
      quote
        ? missDigSheet(quote, today, {
            scheduled: (lead as (Lead & { jobScheduledAt?: string }) | null)?.jobScheduledAt || "",
            leadPhone: lead?.phone,
          })
        : null,
    [quote, lead, today]
  );

  const [ticket, setTicket] = useState("");
  const [digDate, setDigDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (!quote || !sheet) return <p className="text-sm text-muted-foreground">Quote not found.</p>;

  const token = async () => {
    const t = await getIdToken();
    if (!t) throw new Error("Session expired, sign in again");
    return t;
  };
  const save = async () => {
    setErr("");
    setBusy(true);
    try {
      await markMissDigEntered(id, { ticket, digDate: digDate || undefined }, await token());
      setTicket("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };
  const redo = async () => {
    setErr("");
    setBusy(true);
    try {
      await needMissDig(id, await token());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't change it");
    } finally {
      setBusy(false);
    }
  };

  const point = (p: { lat: number; lng: number } | null) => (p ? `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}` : "");
  const pathText = sheet.path.map((p, i) => `${i + 1}. ${point(p)}`).join("\n");
  const caller = `${COMPANY.legalName} (${COMPANY.name}), ${COMPANY.address}, ${COMPANY.city}, ${COMPANY.state} ${COMPANY.zip}. ${COMPANY.phone}`;
  const entered = quote.missDigStatus === "entered";

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/admin/missdig" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> MISS DIG list
        </Link>
        <Link href={`/admin/quotes/${id}`} className="text-sm text-primary hover:underline">
          Open the quote
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto inline-flex items-center gap-1.5 text-sm px-3 py-2 border border-border rounded-md hover:bg-muted"
        >
          <Printer className="h-4 w-4" /> Print
        </button>
        <a
          href="https://www.missdig811.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground font-medium"
        >
          Enter the ticket <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div>
        <h1 className="text-2xl font-bold">MISS DIG ticket: {sheet.customer.name || "Customer"}</h1>
        <p className="text-sm text-muted-foreground">
          {entered
            ? `Ticket ${quote.missDigTicket} entered ${String(quote.missDigEnteredAt || "").slice(0, 10)}. Earliest dig ${quote.missDigDigDate}.`
            : `Accepted ${String(quote.acceptedAt || quote.missDigNeededAt || "").slice(0, 10)}. Entered today, the earliest legal dig day is ${sheet.earliestDig}.`}
        </p>
      </div>

      <section className="bg-card border border-border rounded-lg p-4">
        <h2 className="font-semibold mb-1">Where</h2>
        <CopyRow label="Address" value={sheet.address} />
        <CopyRow label="Start of bore (GPS)" value={point(sheet.start)} />
        <CopyRow label="End of bore (GPS)" value={point(sheet.end)} />
        <CopyRow label="Bore path points" value={pathText} multiline />
        {sheet.mapsUrl && (
          <p className="text-sm pt-2 print:hidden">
            <a href={sheet.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              Open in Google Maps
            </a>
            {sheet.end && (
              <>
                {" · "}
                <a href={mapsLink(sheet.end, "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  End point
                </a>
              </>
            )}
          </p>
        )}
      </section>

      <section className="bg-card border border-border rounded-lg p-4">
        <h2 className="font-semibold mb-1">The work</h2>
        <CopyRow label="Type of work" value={sheet.workType} />
        <CopyRow label="Method" value={sheet.method} />
        <CopyRow label="Length" value={sheet.feet ? `About ${sheet.feet} ft` : ""} />
        <CopyRow label="Pipe / conduit size" value={sheet.pipeSize} />
        <CopyRow label="Marking instructions" value={sheet.markingInstructions} multiline />
        <CopyRow label="On the map already" value={sheet.existing.join(", ")} />
        <CopyRow label="Scheduled start" value={sheet.scheduled} />
        <CopyRow label="Earliest legal dig" value={entered ? String(quote.missDigDigDate || "") : sheet.earliestDig} />
        {!sheet.start && (
          <p className="text-sm text-secondary pt-2">
            No bore path is drawn on this quote. Draw it on the quote&apos;s map, or mark the area on the MISS DIG map by hand.
          </p>
        )}
      </section>

      <section className="bg-card border border-border rounded-lg p-4">
        <h2 className="font-semibold mb-1">Who</h2>
        <CopyRow label="Work done for" value={[sheet.customer.name, sheet.customer.phone, sheet.customer.email].filter(Boolean).join(", ")} />
        <CopyRow label="Excavator (caller)" value={caller} />
      </section>

      <QuoteMapViewer annotation={quote.mapAnnotation} defaultOpen title="Bore map" />

      <section className="bg-card border border-border rounded-lg p-4 space-y-3 print:hidden">
        {entered ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Check className="h-4 w-4 text-accent" />
            <span>
              Ticket <strong>{quote.missDigTicket}</strong> by {quote.missDigEnteredBy}. Dig from {quote.missDigDigDate}.
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void redo()}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 border border-border rounded-md hover:bg-muted"
            >
              <RotateCcw className="h-3 w-3" /> Needs a new ticket
            </button>
          </div>
        ) : (
          <>
            <h2 className="font-semibold">Ticket entered? Save it</h2>
            <div className="flex flex-wrap gap-2 items-end">
              <label className="space-y-1">
                <span className="block text-xs text-muted-foreground">Ticket number</span>
                <input
                  value={ticket}
                  onChange={(e) => setTicket(e.target.value)}
                  inputMode="numeric"
                  className="px-3 py-2 bg-muted border border-border rounded-md text-base sm:text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-xs text-muted-foreground">Dig start (optional)</span>
                <input
                  type="date"
                  value={digDate}
                  min={sheet.earliestDig}
                  onChange={(e) => setDigDate(e.target.value)}
                  className="px-3 py-2 bg-muted border border-border rounded-md text-base sm:text-sm"
                />
              </label>
              <button
                type="button"
                disabled={busy || !ticket.trim()}
                onClick={() => void save()}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save ticket
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Blank dig start uses the earliest legal day, {sheet.earliestDig}. Saving logs the ticket on the lead.
            </p>
          </>
        )}
        {err && <p className="text-sm text-destructive">{err}</p>}
      </section>
    </div>
  );
}
