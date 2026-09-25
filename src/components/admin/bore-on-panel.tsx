"use client";

import type { QuoteRequest } from "@/lib/types";

// What came back from Bore-ON Design Center for this quote: status, the
// numbers the design settled, the plan sheet, and anything Bore-ON warned
// about when it took the push. Internal: rod counts and uncovered work are
// for the estimator, never the customer.

const STATUS_LABEL: Record<string, string> = {
  draft: "Pushed, not designed yet",
  "in-review": "Designed, in review",
  approved: "Design approved",
  transferred: "Turned into a job in Bore-ON",
  archived: "Archived in Bore-ON",
};

const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function BoreOnPanel({ quote }: { quote: QuoteRequest }) {
  if (!quote.boreOnDesignId && !quote.boreOnWarnings?.length) return null;
  const r = quote.boreOnResult;
  const warnings = quote.boreOnWarnings ?? [];
  const est = r?.estimate;

  return (
    <div className="bg-muted rounded-md p-3 space-y-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Bore-ON design</p>
        <p className="text-xs text-muted-foreground">
          {quote.boreOnStatus ? STATUS_LABEL[quote.boreOnStatus] ?? quote.boreOnStatus : "Pushed"}
          {quote.boreOnUpdatedAt ? ` · ${when(quote.boreOnUpdatedAt)}` : quote.boreOnPushedAt ? ` · sent ${when(quote.boreOnPushedAt)}` : ""}
        </p>
      </div>

      {r && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Bore" value={r.boreLengthFt > 0 ? `${Math.round(r.boreLengthFt)} ft` : "—"} />
          <Stat label="All planned" value={r.totalPlannedFt > 0 ? `${Math.round(r.totalPlannedFt)} ft` : "—"} />
          <Stat label="Rods" value={r.rodCount != null ? String(r.rodCount) : "—"} />
          <Stat label="Design total" value={est ? money(est.grandTotal) : "no rate card"} />
        </div>
      )}
      {r && r.depthProfile?.shallowestCoverFt != null && (
        <p className="text-xs text-muted-foreground">
          Thinnest cover {r.depthProfile.shallowestCoverFt} ft
          {r.depthProfile.minCoverFt != null ? ` (needs ${r.depthProfile.minCoverFt} ft)` : ""}
          {r.pits.depthFt != null ? ` · pits ${r.pits.depthFt} ft` : ""}
          {r.pits.entry ? " · pits placed" : " · no pits on the design"}
        </p>
      )}
      {quote.boreOnRepricedAt && (
        <p className="text-xs text-muted-foreground">
          Quote lines re-priced from the design {when(quote.boreOnRepricedAt)}. Lines with an orange edge came from
          Bore-ON; edit one and the next sync leaves it alone.
        </p>
      )}
      {est && est.uncovered.length > 0 && (
        <p className="text-xs text-secondary">
          Not priced by Bore-ON (add by hand): {est.uncovered.map((u) => `${u.label} × ${u.quantity}`).join(", ")}
        </p>
      )}
      {quote.boreOnPlanImageUrl && (
        <a
          href={quote.boreOnPlanImageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline font-medium"
        >
          Plan sheet from Bore-ON → (goes on the proposal)
        </a>
      )}
      {warnings.length > 0 && (
        <ul className="text-xs text-secondary space-y-0.5">
          {warnings.map((w, i) => (
            <li key={`${w.code}-${i}`}>⚠ Bore-ON: {w.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}
