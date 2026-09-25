"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, Plus, X } from "lucide-react";
import { useAuth } from "@/context/auth-provider";
import { updateDocument } from "@/actions/crud";
import { syncQuoteAddress } from "@/actions/quotes";
import { ratePrice } from "@/lib/pricing";
import { MATERIALS_TAX_RATE } from "@/lib/proposal";
import { BoreOnPanel } from "@/components/admin/bore-on-panel";
import type { MapAnnotation, QuoteLine, QuoteRequest } from "@/lib/types";

const MapQuoteTool = dynamic(
  () => import("@/components/quote/map-quote-tool").then((m) => m.MapQuoteTool),
  {
    ssr: false,
    loading: () => (
      <div className="h-[380px] flex items-center justify-center bg-muted rounded-lg">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

// Soil values that break the standard-conditions assumption.
const NONSTANDARD_SOIL: Record<string, string> = {
  "sand-gravel": "gravel in the ground",
  cobble: "rocks or boulders",
  hardpan: "hardpan",
};

// Line items are edited as strings so partially-typed numbers don't fight
// the inputs; parsed on compute and save.
interface DraftLine {
  id: number;
  description: string;
  kind: "work" | "material";
  qty: string;
  unitPrice: string;
  /** Generated from the Bore-ON design; editing it makes it the estimator's. */
  source?: "auto" | "manual";
  key?: string;
}

const toDraft = (saved: QuoteLine[] | null | undefined): DraftLine[] =>
  (saved ?? []).map((l, i) => ({
    id: i + 1,
    description: l.description,
    kind: l.kind === "material" ? "material" : "work",
    qty: String(l.qty),
    unitPrice: String(l.unitPrice),
    ...(l.source ? { source: l.source } : {}),
    ...(l.key ? { key: l.key } : {}),
  }));

const toNum = (s: string): number => {
  const n = Number(s.trim().replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const money = (n: number): string =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function computeTotals(lines: DraftLine[]) {
  let work = 0;
  let materials = 0;
  for (const l of lines) {
    const total = toNum(l.qty) * toNum(l.unitPrice);
    if (l.kind === "material") materials += total;
    else work += total;
  }
  const tax = Math.round(materials * MATERIALS_TAX_RATE * 100) / 100;
  const grand = Math.round((work + materials + tax) * 100) / 100;
  return { work, materials, tax, grand };
}

export function QuoteWorkbench({
  quote,
  onClose,
}: {
  quote: QuoteRequest;
  onClose: () => void;
}) {
  const { getIdToken } = useAuth();
  const [annotation, setAnnotation] = useState<MapAnnotation | null>(
    quote.mapAnnotation ?? null
  );
  const [lines, setLines] = useState<DraftLine[]>(() => toDraft(quote.quoteLines));
  // When Bore-ON re-prices the quote (callback or Pull), show the new lines.
  const [seenReprice, setSeenReprice] = useState(quote.boreOnRepricedAt ?? "");
  useEffect(() => {
    const at = quote.boreOnRepricedAt ?? "";
    if (at && at !== seenReprice) {
      setSeenReprice(at);
      setLines(toDraft(quote.quoteLines));
    }
  }, [quote.boreOnRepricedAt, quote.quoteLines, seenReprice]);
  const [manualPrice, setManualPrice] = useState(
    typeof quote.quotedPrice === "number" ? String(quote.quotedPrice) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [boreOnUrl, setBoreOnUrl] = useState<string>(quote.boreOnUrl ?? "");
  const [boreOnNote, setBoreOnNote] = useState("");
  const idRef = useState(() => ({ next: 1000 }))[0];

  const feet = annotation?.runFeet ?? 0;
  const suggested = useMemo(() => ratePrice(feet), [feet]);
  const totals = useMemo(() => computeTotals(lines), [lines]);
  const hasLines = lines.length > 0;

  const flags: string[] = [];
  const soilFlag = quote.soilType ? NONSTANDARD_SOIL[quote.soilType] : undefined;
  if (soilFlag) flags.push(`Customer reported ${soilFlag} — standard rates don't apply.`);
  if (annotation?.pipeSize === '4"+') {
    flags.push('Pipe over 3" — standard rates don\'t apply.');
  }

  const addLine = (kind: "work" | "material") => {
    const prefill =
      kind === "work" && lines.every((l) => l.kind !== "work")
        ? {
            description: feet > 0 ? `Directional bore, ~${Math.round(feet)} ft` : "Directional bore",
            unitPrice: suggested > 0 ? String(suggested) : "",
          }
        : { description: "", unitPrice: "" };
    setLines((prev) => [
      ...prev,
      { id: idRef.next++, kind, qty: "1", ...prefill },
    ]);
  };

  // An edited auto line becomes the estimator's: the next sync leaves it alone.
  const patchLine = (id: number, patch: Partial<DraftLine>) =>
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch, ...(l.source === "auto" ? { source: "manual" as const } : {}) } : l))
    );

  const removeLine = (id: number) => setLines((prev) => prev.filter((l) => l.id !== id));

  const callBoreOn = async (path: "push" | "pull") => {
    setError("");
    setBoreOnNote("");
    const setBusy = path === "push" ? setPushing : setPulling;
    setBusy(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("no token");
      const res = await fetch(`/api/bore-on/${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quote.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || (path === "push" ? "Bore-ON push failed." : "Couldn't pull from Bore-ON."));
        return;
      }
      if (body.url) setBoreOnUrl(body.url);
      if (path === "push") {
        setBoreOnNote(body.updated ? "Design re-sent to Bore-ON." : "Design sent to Bore-ON.");
      } else {
        setBoreOnNote(
          body.repriced
            ? `Pulled from Bore-ON and re-priced: ${money(body.total)}.`
            : "Pulled from Bore-ON. Nothing to price yet."
        );
      }
    } catch {
      setError(path === "push" ? "Bore-ON push failed — try again." : "Couldn't pull from Bore-ON — try again.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("no token");

      let price: number | null;
      if (hasLines) {
        price = totals.grand > 0 ? totals.grand : null;
      } else {
        const trimmed = manualPrice.trim();
        price = trimmed === "" ? null : Number(trimmed.replace(/[$,\s]/g, ""));
        if (price !== null && (!Number.isFinite(price) || price < 0)) {
          setError("That price doesn't look like a number.");
          return;
        }
      }

      const savedLines: QuoteLine[] = lines
        .filter((l) => l.description.trim() || toNum(l.unitPrice) > 0)
        .map((l) => ({
          description: l.description.trim().slice(0, 300),
          kind: l.kind,
          qty: toNum(l.qty),
          unitPrice: toNum(l.unitPrice),
          ...(l.source ? { source: l.source } : {}),
          ...(l.key ? { key: l.key } : {}),
        }));

      // The Leaflet tool doesn't edit legacy polygon shapes — carry them
      // through so saving never silently drops a customer's drawing.
      const merged = annotation
        ? { ...annotation, polygons: quote.mapAnnotation?.polygons ?? [] }
        : null;
      const data: Record<string, unknown> = {
        mapAnnotation: merged,
        quotedPrice: price,
        quoteLines: savedLines.length > 0 ? savedLines : null,
      };
      // Entering a price on a fresh quote moves it along the pipeline.
      if (price !== null && quote.status === "new") data.status = "quoted";
      await updateDocument("quoteRequests", quote.id, data, token);
      // The address found on the map is the job's address; the lead wants it too.
      if (merged?.address) await syncQuoteAddress(quote.id, merged.address, token).catch(() => {});
      setSavedAt(Date.now());
    } catch {
      setError("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "px-2 py-1.5 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="border border-primary/40 rounded-lg p-4 space-y-4 bg-background/40">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-semibold text-sm">
          Work up this quote{quote.address ? ` — ${quote.address}` : ""}
        </h4>
        <button
          type="button"
          onClick={onClose}
          className="text-xs px-3 py-1.5 border border-border rounded-md hover:bg-muted transition-colors"
        >
          Close
        </button>
      </div>

      <MapQuoteTool
        initial={quote.mapAnnotation ?? null}
        onAnnotationChange={setAnnotation}
        geocodeAddress={quote.address}
        showBoreProfile
      />

      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="bg-muted rounded-md p-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Drawn run</p>
          <p className="font-bold text-lg">{feet > 0 ? `~${Math.round(feet)} ft` : "—"}</p>
        </div>
        <div className="bg-muted rounded-md p-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Rate sheet says
          </p>
          <p className="font-bold text-lg">
            {suggested > 0 ? money(suggested) : "—"}
          </p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-1">
            Standard conditions: pipe 3&quot; or under, no gravel or rock.
          </p>
        </div>
      </div>

      {flags.map((f) => (
        <p key={f} className="text-sm text-secondary">
          ⚠ {f}
        </p>
      ))}

      {/* Line items */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Quote lines</p>
        {lines.map((l) => {
          const lineTotal = toNum(l.qty) * toNum(l.unitPrice);
          return (
            <div
              key={l.id}
              className="grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1fr)_110px_64px_100px_90px_32px] gap-2 items-center"
            >
              <input
                type="text"
                value={l.description}
                onChange={(e) => patchLine(l.id, { description: e.target.value })}
                placeholder={l.kind === "material" ? "Material (pipe, conduit, fittings...)" : "Work (bore, hydrovac, extra pit...)"}
                className={`${inputCls} col-span-2 sm:col-span-1 w-full ${l.source === "auto" ? "border-primary/40" : ""}`}
                aria-label="Line description"
                title={l.source === "auto" ? "From the Bore-ON design. Edit it and the next sync leaves it alone." : undefined}
              />
              <select
                value={l.kind}
                onChange={(e) => patchLine(l.id, { kind: e.target.value as DraftLine["kind"] })}
                className={inputCls}
                aria-label="Line type"
              >
                <option value="work">Work</option>
                <option value="material">Material</option>
              </select>
              <input
                type="text"
                inputMode="decimal"
                value={l.qty}
                onChange={(e) => patchLine(l.id, { qty: e.target.value })}
                className={`${inputCls} text-right`}
                aria-label="Quantity"
              />
              <input
                type="text"
                inputMode="decimal"
                value={l.unitPrice}
                onChange={(e) => patchLine(l.id, { unitPrice: e.target.value })}
                placeholder="0.00"
                className={`${inputCls} text-right`}
                aria-label="Unit price"
              />
              <span className="text-sm text-right font-medium tabular-nums">
                {lineTotal > 0 ? money(lineTotal) : "—"}
              </span>
              <button
                type="button"
                onClick={() => removeLine(l.id)}
                aria-label="Remove line"
                className="justify-self-end text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => addLine("work")}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-border rounded-md hover:border-primary hover:text-primary transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add work
          </button>
          <button
            type="button"
            onClick={() => addLine("material")}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-border rounded-md hover:border-primary hover:text-primary transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add material
          </button>
        </div>
      </div>

      {/* Totals */}
      {hasLines ? (
        <div className="max-w-xs ml-auto space-y-1 text-sm tabular-nums">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Work</span>
            <span>{money(totals.work)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Materials</span>
            <span>{money(totals.materials)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sales tax (6% on materials)</span>
            <span>{money(totals.tax)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1 font-bold text-base">
            <span>Quote total</span>
            <span className="text-primary">{money(totals.grand)}</span>
          </div>
        </div>
      ) : (
        <div className="max-w-xs ml-auto">
          <label
            htmlFor={`price-${quote.id}`}
            className="text-xs text-muted-foreground uppercase tracking-wider"
          >
            Quoted price (or add lines above)
          </label>
          <input
            id={`price-${quote.id}`}
            type="text"
            inputMode="decimal"
            value={manualPrice}
            onChange={(e) => setManualPrice(e.target.value)}
            placeholder={suggested > 0 ? String(suggested) : "0"}
            className={`${inputCls} w-full mt-1 font-semibold`}
          />
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save quote"}
        </button>
        <button
          type="button"
          onClick={() => callBoreOn("push")}
          disabled={pushing || pulling}
          className="px-4 py-2 border border-border rounded-md text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50"
        >
          {pushing ? "Sending..." : boreOnUrl ? "Re-send to Bore-ON" : "Send to Bore-ON"}
        </button>
        {quote.boreOnDesignId && (
          <button
            type="button"
            onClick={() => callBoreOn("pull")}
            disabled={pushing || pulling}
            className="px-4 py-2 border border-border rounded-md text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50"
          >
            {pulling ? "Pulling..." : "Pull from Bore-ON"}
          </button>
        )}
        {boreOnUrl && (
          <a
            href={boreOnUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline font-medium"
          >
            Open in Bore-ON →
          </a>
        )}
        {savedAt && !saving && !error && (
          <span className="text-xs text-muted-foreground">Saved.</span>
        )}
        {boreOnNote && !error && <span className="text-xs text-muted-foreground">{boreOnNote}</span>}
        {error && (
          <span role="alert" className="text-xs text-destructive">
            {error}
          </span>
        )}
      </div>

      <BoreOnPanel quote={quote} />
    </div>
  );
}
