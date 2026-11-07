"use client";

import Link from "next/link";
import { useMemo } from "react";
import { FileWarning } from "lucide-react";
import { money } from "@/lib/proposal";
import { DRAFT_STALE_DAYS, unsentDrafts, unsentDraftsTotal } from "@/lib/quote-track";
import type { QuoteRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

const SHOW = 8;

/**
 * Dashboard card: drafts on a lead that were never sent and are more than
 * two days old, oldest first, each linking to its quote. Hidden when there
 * are none.
 */
export function QuotesNotSent({ quotes, today, className }: { quotes: QuoteRequest[]; today: string; className?: string }) {
  const drafts = useMemo(() => unsentDrafts(quotes, today), [quotes, today]);
  if (drafts.length === 0) return null;
  const total = unsentDraftsTotal(drafts);
  return (
    <div className={cn("bg-card border border-secondary/50 rounded-lg p-4 sm:p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Quotes not sent</p>
        <FileWarning className="h-5 w-5 text-secondary opacity-70" />
      </div>
      <p className="text-3xl font-bold mt-1">
        {drafts.length}
        {total > 0 && <span className="text-lg font-semibold text-muted-foreground"> · {money(total)}</span>}
      </p>
      <p className="text-xs text-muted-foreground mt-1">Drafts on a lead, started more than {DRAFT_STALE_DAYS} days ago and never sent.</p>
      <ul className="mt-2 text-sm space-y-1">
        {drafts.slice(0, SHOW).map((d) => (
          <li key={d.id} className="flex items-baseline justify-between gap-2">
            <Link href={`/admin/quotes/${d.id}`} className="text-primary hover:underline truncate">
              {d.name || "(no name)"}
            </Link>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {d.ageDays} days · {d.price !== null ? money(d.price) : "no price"}
            </span>
          </li>
        ))}
      </ul>
      <Link href="/admin/quotes?filter=draft" className="inline-block mt-2 text-sm text-primary hover:underline">
        {drafts.length > SHOW ? `See all ${drafts.length} drafts` : "Open the drafts"}
      </Link>
    </div>
  );
}
