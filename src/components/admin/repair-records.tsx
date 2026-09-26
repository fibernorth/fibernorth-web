"use client";

import { useState } from "react";
import { useAuth } from "@/context/auth-provider";
import { applyRepair, previewRepair, type RepairApplyResult, type RepairPreview } from "@/actions/repair";
import { Loader2 } from "lucide-react";

/**
 * Settings card: check (a stored plan, nothing changed), then apply exactly
 * that plan. Records changed since the check are skipped and listed.
 */
export function RepairRecords() {
  const { getIdToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<RepairPreview | null>(null);
  const [result, setResult] = useState<RepairApplyResult | null>(null);
  const [error, setError] = useState("");

  const run = async (apply: boolean) => {
    setBusy(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      if (apply && plan) {
        setResult(await applyRepair(plan.planId, token));
      } else {
        setResult(null);
        setPlan(await previewRepair(token));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Repair failed");
    } finally {
      setBusy(false);
    }
  };

  const total = plan ? plan.changes.length : 0;

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-4">
      <h2 className="text-lg font-semibold">Repair quote records</h2>
      <p className="text-sm text-muted-foreground">
        One-time cleanup for quotes and leads saved before the September fixes: links quotes back to their lead,
        fills in the price each customer was actually sent, and corrects lead quote badges. Check first shows every
        change and saves nothing; Fix applies exactly that list.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => run(false)}
          className="min-h-11 px-4 rounded-md border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin inline" /> : "Check first"}
        </button>
        {plan && !result && total > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(true)}
            className="min-h-11 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            Fix these {total}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {plan && (
        <div className="text-sm space-y-2">
          <p>
            {result ? "Checked" : "Would fix"}: {plan.quotesLinked} quote links, {plan.sentTotalsFilled} sent prices,{" "}
            {plan.badgesFixed} lead badges.
            {total === 0 && " Everything already matches."}
            {plan.truncated && " (Only the first 2000 are listed; run Check again after fixing these.)"}
          </p>
          {plan.changes.length > 0 && (
            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5 max-h-80 overflow-y-auto border border-border rounded-md py-2 pr-2">
              {plan.changes.map((c, i) => (
                <li key={`${i}-${c.label}`}>{c.label}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {result && (
        <div className="text-sm space-y-2">
          <p>
            Fixed {result.applied}.
            {result.skipped.length > 0 && ` Skipped ${result.skipped.length} that changed since the check:`}
          </p>
          {result.skipped.length > 0 && (
            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5 max-h-60 overflow-y-auto">
              {result.skipped.map((s, i) => (
                <li key={`${i}-${s.label}`}>
                  {s.label} ({s.reason})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
