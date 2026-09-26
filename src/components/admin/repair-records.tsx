"use client";

import { useState } from "react";
import { useAuth } from "@/context/auth-provider";
import { repairQuoteRecords, type RepairReport } from "@/actions/repair";
import { Loader2 } from "lucide-react";

/** Settings card: preview, then apply, the one-time quote record cleanup. */
export function RepairRecords() {
  const { getIdToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<RepairReport | null>(null);
  const [error, setError] = useState("");

  const run = async (apply: boolean) => {
    setBusy(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      setReport(await repairQuoteRecords(apply, token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Repair failed");
    } finally {
      setBusy(false);
    }
  };

  const total = report ? report.quotesLinked + report.sentTotalsFilled + report.badgesFixed : 0;

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-4">
      <h2 className="text-lg font-semibold">Repair quote records</h2>
      <p className="text-sm text-muted-foreground">
        One-time cleanup for quotes and leads saved before the September fixes: links quotes back to their lead,
        fills in the price each customer was actually sent, and corrects lead quote badges. Check first shows what
        would change and saves nothing.
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
        {report && !report.applied && total > 0 && (
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
      {report && (
        <div className="text-sm space-y-2">
          <p>
            {report.applied ? "Fixed" : "Would fix"}: {report.quotesLinked} quote links, {report.sentTotalsFilled} sent
            prices, {report.badgesFixed} lead badges.
            {total === 0 && " Everything already matches."}
          </p>
          {report.examples.length > 0 && (
            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
              {report.examples.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
