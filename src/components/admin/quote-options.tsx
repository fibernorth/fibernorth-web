"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { where } from "firebase/firestore";
import { Ban, Check, CopyPlus, Loader2, Pencil, RotateCcw, X } from "lucide-react";
import { useFirestoreCollection } from "@/hooks/use-firestore-collection";
import { useAuth } from "@/context/auth-provider";
import { addQuoteOption, closeQuoteOption, renameQuoteOption, reopenQuoteOption } from "@/actions/quotes";
import { money, sentTotalOf } from "@/lib/proposal";
import { canCloseOption, optionGroupQuotes } from "@/lib/quote-options";
import { cn } from "@/lib/utils";
import type { QuoteRequest } from "@/lib/types";

// Options on a quote: the same site priced different ways. "Price another
// option" copies this quote (drawing, lines, price) into a new draft; each
// option is sent with its own link. They all stay open until the office
// closes one (some are "or", some are "and": the customer may approve
// several). Shown on the quote page above the workbench.

const STATUS_TEXT: Record<string, string> = {
  draft: "draft",
  sent: "sent",
  viewed: "opened",
  accepted: "accepted",
  declined: "declined",
  expired: "expired",
};

export function QuoteOptions({ quote }: { quote: QuoteRequest }) {
  const { getIdToken } = useAuth();
  const router = useRouter();
  const constraints = useMemo(() => (quote.leadId ? [where("leadId", "==", quote.leadId)] : []), [quote.leadId]);
  const { data } = useFirestoreCollection<QuoteRequest>(quote.leadId ? "quoteRequests" : null, { constraints });
  const options = useMemo(() => {
    const live = data.find((q) => q.id === quote.id) ?? quote;
    return optionGroupQuotes(live, data.length ? data : [quote]);
  }, [data, quote]);
  const grouped = !!quote.optionGroup;

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(quote.optionLabel || "");

  const token = async () => {
    const t = await getIdToken();
    if (!t) throw new Error("Session expired, sign in again");
    return t;
  };

  const add = async () => {
    setErr("");
    setBusy(true);
    try {
      const { quoteId } = await addQuoteOption(quote.id, await token());
      router.push(`/admin/quotes/${quoteId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't add the option");
      setBusy(false);
    }
  };

  const [confirmClose, setConfirmClose] = useState(false);
  const setClosed = async (close: boolean) => {
    setErr("");
    setBusy(true);
    try {
      await (close ? closeQuoteOption : reopenQuoteOption)(quote.id, await token());
      setConfirmClose(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't change it");
    } finally {
      setBusy(false);
    }
  };

  const rename = async () => {
    setErr("");
    setBusy(true);
    try {
      await renameQuoteOption(quote.id, label, await token());
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't rename it");
    } finally {
      setBusy(false);
    }
  };

  const addBtn = (
    <button
      type="button"
      onClick={add}
      disabled={busy}
      title="Copy this quote into a new draft to price a different way of doing the job"
      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-border rounded-md hover:border-primary hover:text-primary disabled:opacity-50"
    >
      {busy && !editing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CopyPlus className="h-3.5 w-3.5" />}
      Price another option
    </button>
  );

  if (!grouped) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {addBtn}
        <span>Same site, a different way (another pipe size, route or depth). The customer picks one.</span>
        {err && <span className="w-full text-destructive">{err}</span>}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Options</span>
        {options.map((q) => {
          const here = q.id === quote.id;
          const total = q.version ? sentTotalOf(q) : typeof q.quotedPrice === "number" ? q.quotedPrice : null;
          const status = q.optionClosedAt ? "closed" : STATUS_TEXT[String(q.estimateStatus || "draft")] ?? q.estimateStatus;
          return (
            <Link
              key={q.id}
              href={`/admin/quotes/${q.id}`}
              aria-current={here ? "page" : undefined}
              className={cn(
                "text-sm px-3 py-1.5 rounded-md border inline-flex items-baseline gap-2",
                here ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:bg-muted",
                q.estimateStatus === "accepted" && "border-accent text-accent",
                q.optionClosedAt && "opacity-60 line-through decoration-1"
              )}
            >
              {q.optionLabel || "Option"}
              <span className="text-xs text-muted-foreground">
                {status}
                {total !== null && total > 0 ? ` · ${money(total)}` : ""}
              </span>
            </Link>
          );
        })}
        {options.length < 6 && addBtn}
      </div>

      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={60}
            autoFocus
            aria-label="Option name"
            placeholder="Option B: 2 in conduit"
            className="flex-1 min-w-[200px] px-3 py-1.5 bg-muted border border-border rounded-md text-base sm:text-sm"
          />
          <button
            type="button"
            onClick={rename}
            disabled={busy || !label.trim()}
            className="h-8 px-2.5 rounded-md bg-primary text-primary-foreground text-xs inline-flex items-center gap-1 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setLabel(quote.optionLabel || "");
            }}
            className="h-8 px-2.5 rounded-md border border-border text-xs inline-flex items-center gap-1"
          >
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
          <span>
            You&apos;re on <strong className="text-foreground">{quote.optionLabel || "this option"}</strong>. The customer
            sees this name. Send each option&apos;s link; they can approve one or several. Options stay open until
            you close them.
          </span>
          <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 underline">
            <Pencil className="h-3 w-3" /> Rename
          </button>
          {quote.optionClosedAt ? (
            <>
              <span className="w-full text-secondary">
                Closed{quote.optionClosedBy ? ` by ${quote.optionClosedBy}` : ""}. The customer&apos;s link says it&apos;s closed.
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void setClosed(false)}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border hover:bg-muted disabled:opacity-50"
              >
                <RotateCcw className="h-3 w-3" /> Reopen this option
              </button>
            </>
          ) : canCloseOption(quote) && confirmClose ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="text-foreground">Close {quote.optionLabel || "this option"}? The customer won&apos;t be able to approve it.</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void setClosed(true)}
                className="h-8 px-2.5 rounded-md bg-destructive text-destructive-foreground inline-flex items-center gap-1 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-3 w-3 animate-spin" />} Yes, close it
              </button>
              <button type="button" onClick={() => setConfirmClose(false)} className="h-8 px-2.5 rounded-md border border-border">
                No
              </button>
            </span>
          ) : canCloseOption(quote) ? (
            <button type="button" onClick={() => setConfirmClose(true)} className="inline-flex items-center gap-1 underline">
              <Ban className="h-3 w-3" /> Close this option
            </button>
          ) : null}
        </p>
      )}
      {err && <p className="text-sm text-destructive">{err}</p>}
    </div>
  );
}
