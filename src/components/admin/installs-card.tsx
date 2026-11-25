"use client";

import Link from "next/link";
import { useMemo } from "react";
import { where } from "firebase/firestore";
import { AlertTriangle, HardHat } from "lucide-react";
import { useFirestoreCollection } from "@/hooks/use-firestore-collection";
import { useIsOwner } from "@/hooks/use-is-owner";
import { money } from "@/lib/proposal";
import { todayISO, type Lead } from "@/lib/leads";
import { visibleLeads } from "@/lib/roles";
import { INSTALL_STEPS, INSTALL_STEP_LABELS, installBoard } from "@/lib/installs";
import type { QuoteRequest } from "@/lib/types";

// Dashboard card: how many sold jobs sit on each step after the sale, with
// the dollars, and how many need a look (past their day, or look paid).

export function InstallsCard() {
  const owner = useIsOwner();
  const leadC = useMemo(() => [where("stage", "==", "won")], []);
  const quoteC = useMemo(() => [where("estimateStatus", "==", "accepted")], []);
  const { data: leads, loading } = useFirestoreCollection<Lead>("leads", { constraints: leadC });
  const { data: quotes } = useFirestoreCollection<QuoteRequest>("quoteRequests", { constraints: quoteC });
  const today = todayISO();
  const board = useMemo(() => installBoard(visibleLeads(leads, owner), quotes, today), [leads, owner, quotes, today]);
  if (loading) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold flex items-center gap-2">
          <HardHat className="h-4 w-4 text-secondary" /> After the sale
        </h2>
        <Link href="/admin/installs" className="text-xs text-primary hover:underline">
          Open Installs
        </Link>
      </div>
      <div className="grid grid-cols-5 gap-1 text-center">
        {INSTALL_STEPS.map((s) => (
          <Link key={s} href="/admin/installs" className="rounded-md bg-muted/50 p-2 hover:bg-muted">
            <p className="text-lg font-bold tabular-nums">{board.totals[s].count}</p>
            <p className="text-[11px] text-muted-foreground leading-tight">{INSTALL_STEP_LABELS[s]}</p>
            <p className="text-[11px] tabular-nums leading-tight">
              {board.totals[s].dollars > 0 ? money(board.totals[s].dollars).replace(/\.00$/, "") : ""}
            </p>
          </Link>
        ))}
      </div>
      {board.attention > 0 && (
        <p className="text-xs text-secondary inline-flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5" /> {board.attention} need a look: past their scheduled day, or the cash
          covers the sale but it isn&apos;t marked paid.
        </p>
      )}
    </div>
  );
}
