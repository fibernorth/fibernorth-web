"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { where } from "firebase/firestore";
import { AlertTriangle, CalendarDays, Check, DollarSign, HardHat, Loader2, Shovel } from "lucide-react";
import { useFirestoreCollection } from "@/hooks/use-firestore-collection";
import { useIsOwner } from "@/hooks/use-is-owner";
import { useAuth } from "@/context/auth-provider";
import { saveLead } from "@/actions/leads";
import { money } from "@/lib/proposal";
import { todayISO, type Lead } from "@/lib/leads";
import { visibleLeads } from "@/lib/roles";
import {
  INSTALL_STEPS,
  INSTALL_STEP_LABELS,
  INSTALL_STEP_NEXT,
  PAID_DAYS,
  installBoard,
  type InstallRow,
  type InstallStep,
} from "@/lib/installs";
import type { QuoteRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

// Installs: every sold job from the sale to the money, one column per step
// (src/lib/installs.ts). Each card has the one tap that moves it along.

const shortDay = (ymd?: string) => {
  const m = (ymd || "").match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : "";
};

export default function InstallsPage() {
  const owner = useIsOwner();
  const leadC = useMemo(() => [where("stage", "==", "won")], []);
  const quoteC = useMemo(() => [where("estimateStatus", "==", "accepted")], []);
  const { data: leadsRaw, loading } = useFirestoreCollection<Lead>("leads", { constraints: leadC });
  const { data: quotes } = useFirestoreCollection<QuoteRequest>("quoteRequests", { constraints: quoteC });
  const today = todayISO();
  const board = useMemo(
    () => installBoard(visibleLeads(leadsRaw, owner), quotes, today),
    [leadsRaw, owner, quotes, today]
  );
  const [step, setStep] = useState<InstallStep | "all">("all");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HardHat className="h-6 w-6 text-secondary" /> Installs
        </h1>
        {board.attention > 0 && (
          <span className="inline-flex items-center gap-1.5 text-sm text-secondary">
            <AlertTriangle className="h-4 w-4" /> {board.attention} need a look
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Every sold job, from the sale to paid in full. Tap a step to see just those jobs. Paid jobs stay here {PAID_DAYS}{" "}
        days.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2" role="tablist" aria-label="Steps">
        {INSTALL_STEPS.map((s, i) => {
          const t = board.totals[s];
          const on = step === s;
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setStep(on ? "all" : s)}
              className={cn(
                "text-left rounded-lg border p-3 bg-card",
                on ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50",
                i === INSTALL_STEPS.length - 1 && "col-span-2 sm:col-span-1"
              )}
            >
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {i + 1}. {INSTALL_STEP_LABELS[s]}
              </p>
              <p className="text-2xl font-bold tabular-nums">{t.count}</p>
              <p className="text-sm tabular-nums">{t.dollars > 0 ? money(t.dollars) : " "}</p>
              <p className="text-xs text-muted-foreground mt-1">{INSTALL_STEP_NEXT[s]}</p>
            </button>
          );
        })}
      </div>

      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        INSTALL_STEPS.filter((s) => step === "all" || step === s).map((s) => (
          <section key={s} className="space-y-2">
            <h2 className="font-semibold">
              {INSTALL_STEP_LABELS[s]} ({board.totals[s].count})
            </h2>
            {board.rows[s].length === 0 ? (
              <p className="text-sm text-muted-foreground">None.</p>
            ) : (
              <ul className="divide-y divide-border border border-border rounded-lg bg-card">
                {board.rows[s].map((r) => (
                  <JobRow key={r.lead.id} row={r} today={today} />
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}

function JobRow({ row, today }: { row: InstallRow; today: string }) {
  const { getIdToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const l = row.lead;

  const save = async (patch: Record<string, unknown>, text: string) => {
    setErr("");
    setBusy(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const r = await saveLead(l.id, { ...patch, expectStage: "won" }, { ts: new Date().toISOString(), type: "system", text }, token);
      if (!r.ok) setErr(r.error);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  const btn =
    "inline-flex items-center gap-1.5 text-sm px-3 py-1.5 min-h-11 sm:min-h-0 rounded-md border font-medium disabled:opacity-50";
  const sched = l.jobScheduledAt
    ? `${shortDay(l.jobScheduledAt)}${l.jobEndAt && l.jobEndAt !== l.jobScheduledAt ? `–${shortDay(l.jobEndAt)}` : ""}`
    : "";

  let action: React.ReactNode = null;
  if (row.step === "sold") {
    action = row.ticketQuoteId ? (
      <Link href={`/admin/missdig/${row.ticketQuoteId}`} className={cn(btn, "bg-primary text-primary-foreground border-primary")}>
        <Shovel className="h-4 w-4" /> MISS DIG sheet
      </Link>
    ) : (
      <Link href={`/admin/leads?lead=${l.id}`} className={cn(btn, "border-border")}>
        <CalendarDays className="h-4 w-4" /> Schedule
      </Link>
    );
  } else if (row.step === "ticket") {
    action = (
      <Link href={`/admin/leads?lead=${l.id}`} className={cn(btn, "bg-primary text-primary-foreground border-primary")}>
        <CalendarDays className="h-4 w-4" /> Schedule
      </Link>
    );
  } else if (row.step === "scheduled") {
    action = (
      <button
        type="button"
        disabled={busy}
        onClick={() => void save({ jobDoneAt: l.jobEndAt && l.jobEndAt < today ? l.jobEndAt : today }, "Job done (Installs)")}
        className={cn(btn, row.overdue ? "bg-primary text-primary-foreground border-primary" : "border-border")}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Mark done
      </button>
    );
  } else if (row.step === "done") {
    const amt = row.sale !== null ? row.sale.toFixed(2) : "";
    action = (
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void save(
            { paidAt: today, ...(row.cash === null && amt ? { cashCollected: amt } : {}) },
            `Paid in full${row.cash === null && amt ? `: ${money(Number(amt))}` : ""}. Lead finished. (Installs)`
          )
        }
        className={cn(btn, row.looksPaid ? "bg-accent text-accent-foreground border-accent" : "border-accent text-accent")}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />} Mark paid
      </button>
    );
  }

  return (
    <li className="p-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <div className="flex-1 min-w-[14rem]">
        <Link href={`/admin/leads?lead=${l.id}`} className="text-primary font-medium hover:underline">
          {l.name || "(no name)"}
        </Link>
        <p className="text-xs text-muted-foreground">
          {[
            l.address || "",
            row.sale !== null ? `sale ${money(row.sale)}` : "no sale amount",
            row.cash !== null ? `paid so far ${money(row.cash)}` : "",
            sched ? `on the calendar ${sched}` : "",
            l.jobDoneAt ? `done ${shortDay(l.jobDoneAt)}` : "",
            l.paidAt ? `paid ${shortDay(l.paidAt)}` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="text-xs flex flex-wrap gap-2 mt-0.5">
          {row.step !== "done" && row.step !== "paid" && (
            <span className={row.ticket === "in" ? "text-accent" : "text-secondary"}>
              {row.ticket === "in" ? "MISS DIG ticket in" : row.ticket === "needed" ? "MISS DIG ticket needed" : "no MISS DIG ticket on file"}
            </span>
          )}
          {row.overdue && <span className="text-secondary font-medium">Past its day: did this get done?</span>}
          {row.looksPaid && <span className="text-accent font-medium">Cash covers the sale: looks paid</span>}
        </p>
        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>
      {action}
      {(row.step === "sold" || row.step === "ticket") && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void save({ jobDoneAt: today }, "Job done (Installs: was already finished)")}
          className="text-xs underline text-muted-foreground disabled:opacity-50"
        >
          Already done
        </button>
      )}
    </li>
  );
}
