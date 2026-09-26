"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Loader2, Plus, X } from "lucide-react";
import { useAuth } from "@/context/auth-provider";
import { saveQuoteWork, syncQuoteAddress } from "@/actions/quotes";
import { boreFeetInText, boreLineFor, DRAWING_BORE_KEY, runFeetOf } from "@/lib/pricing";
import { customerContentKey, MATERIALS_TAX_RATE, workContentKey } from "@/lib/proposal";
import { cn } from "@/lib/utils";
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

/** The lines as they get saved: blank rows dropped, numbers parsed. */
const fromDraft = (lines: DraftLine[]): QuoteLine[] =>
  lines
    .filter((l) => l.description.trim() || toNum(l.unitPrice) > 0)
    .map((l) => ({
      description: l.description.trim().slice(0, 300),
      kind: l.kind,
      qty: toNum(l.qty),
      unitPrice: toNum(l.unitPrice),
      ...(l.source ? { source: l.source } : {}),
      ...(l.key ? { key: l.key } : {}),
    }));

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

/** The quote's price from what's on screen. NaN when the typed price isn't a number. */
function priceOf(lines: DraftLine[], manualPrice: string): number | null {
  if (lines.length > 0) {
    const grand = computeTotals(lines).grand;
    return grand > 0 ? grand : null;
  }
  const trimmed = manualPrice.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

const CHANGED_ELSEWHERE = "Changed by someone else. Reload before saving or sending.";

const runCountInText = (description: string): number => {
  const m = /\((\d+)\s+runs?\)/i.exec(description || "");
  return m ? Number(m[1]) : 1;
};

export interface WorkbenchSaveResult {
  ok: boolean;
  /** True when something the customer sees changed since the last save. */
  changed: boolean;
  price: number | null;
  error?: string;
}

/** What the page around the workbench needs to know. */
export interface WorkbenchState {
  /** Something on screen hasn't been saved. */
  dirty: boolean;
  /** The total on screen right now (null when there's no price). */
  total: number | null;
  /** Footage drawn on the map right now. */
  feet: number;
}

/** What was last saved (or loaded), to tell when the screen differs. */
interface Baseline {
  price: number | null;
  lines: QuoteLine[] | null;
  ann: MapAnnotation | null;
  scope: string;
}

export function QuoteWorkbench({
  quote,
  onClose,
  saveRef,
  scopeText = "",
  scopeCustom = false,
  onStateChange,
}: {
  quote: QuoteRequest;
  onClose: () => void;
  /** Lets the send panel save the workbench before it sends. */
  saveRef?: { current: (() => Promise<WorkbenchSaveResult>) | null };
  /** The scope shown in the send panel; saved with "Save quote". */
  scopeText?: string;
  /** The estimator typed the scope (otherwise it follows the footage). */
  scopeCustom?: boolean;
  onStateChange?: (s: WorkbenchState) => void;
}) {
  const { getIdToken } = useAuth();
  const [annotation, setAnnotation] = useState<MapAnnotation | null>(quote.mapAnnotation ?? null);
  const [lines, setLines] = useState<DraftLine[]>(() => toDraft(quote.quoteLines));
  const [manualPrice, setManualPrice] = useState(
    typeof quote.quotedPrice === "number" && !(quote.quoteLines && quote.quoteLines.length) ? String(quote.quotedPrice) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [boreOnUrl, setBoreOnUrl] = useState<string>(quote.boreOnUrl ?? "");
  const [boreOnNote, setBoreOnNote] = useState("");
  const idRef = useState(() => ({ next: 1000 }))[0];

  // The saved quote this screen started from (or last saved). If the live
  // quote moves away from it, someone else saved: say so, and don't let
  // Save (or Send, which saves first) write over their work unseen.
  const serverKey = workContentKey(quote);
  const [loadedKey, setLoadedKey] = useState(serverKey);
  // The key we just replaced by saving, until the live copy catches up.
  const [priorKey, setPriorKey] = useState<string | null>(null);

  // Scope counts toward "unsaved" only once the estimator typed it; the
  // default follows the drawing, which is tracked on its own.
  const scopeMarker = scopeCustom ? scopeText.trim() : "";

  const [base, setBase] = useState<Baseline>(() => {
    const d = toDraft(quote.quoteLines);
    const ls = fromDraft(d);
    return {
      price: priceOf(d, typeof quote.quotedPrice === "number" && !ls.length ? String(quote.quotedPrice) : ""),
      lines: ls.length ? ls : null,
      ann: quote.mapAnnotation ?? null,
      scope: scopeCustom ? scopeText.trim() : "",
    };
  });

  const savedLines = useMemo(() => fromDraft(lines), [lines]);
  const priceNow = useMemo(() => priceOf(lines, manualPrice), [lines, manualPrice]);
  const keyNow = customerContentKey({
    quotedPrice: Number.isNaN(priceNow) ? -1 : priceNow,
    quoteLines: savedLines.length ? savedLines : null,
    mapAnnotation: annotation,
    scopeText: scopeMarker,
  });
  const baseKey = customerContentKey({ quotedPrice: base.price, quoteLines: base.lines, mapAnnotation: base.ann, scopeText: base.scope });
  const dirty = keyNow !== baseKey;
  const linesDirty =
    customerContentKey({ quotedPrice: Number.isNaN(priceNow) ? -1 : priceNow, quoteLines: savedLines.length ? savedLines : null }) !==
    customerContentKey({ quotedPrice: base.price, quoteLines: base.lines });

  // The map tool tidies a saved drawing when it loads (and fills in fields an
  // older drawing lacks). Take its first report as the saved state, so
  // opening a quote doesn't count as an edit.
  const settledRef = useRef(false);
  const onAnnotation = (a: MapAnnotation | null) => {
    setAnnotation(a);
    if (!settledRef.current) {
      settledRef.current = true;
      setBase((b) => ({ ...b, ann: a }));
    }
  };

  // Clear "Saved." the moment anything changes.
  useEffect(() => {
    if (dirty) setSavedNote("");
  }, [dirty]);

  // When Bore-ON re-prices the quote (callback or Pull), show the new lines,
  // unless the estimator has unsaved line changes: then ask first.
  const [seenReprice, setSeenReprice] = useState(quote.boreOnRepricedAt ?? "");
  const [repriceWaiting, setRepriceWaiting] = useState(false);
  const loadReprice = () => {
    const d = toDraft(quote.quoteLines);
    const ls = fromDraft(d);
    const manual = !ls.length && typeof quote.quotedPrice === "number" ? String(quote.quotedPrice) : "";
    setLines(d);
    setManualPrice(manual);
    setBase((b) => ({ ...b, price: priceOf(d, manual), lines: ls.length ? ls : null }));
    setRepriceWaiting(false);
    setLoadedKey(workContentKey(quote));
  };
  const loadRepriceRef = useRef(loadReprice);
  loadRepriceRef.current = loadReprice;
  const linesDirtyRef = useRef(linesDirty);
  linesDirtyRef.current = linesDirty;
  useEffect(() => {
    const at = quote.boreOnRepricedAt ?? "";
    if (!at || at === seenReprice) return;
    setSeenReprice(at);
    if (linesDirtyRef.current) setRepriceWaiting(true);
    else loadRepriceRef.current();
  }, [quote.boreOnRepricedAt, quote.quoteLines, seenReprice]);

  // Bore-ON's re-price has its own banner ("Keep mine" means write over it).
  const stale = !saving && !repriceWaiting && serverKey !== loadedKey && serverKey !== priorKey;

  const feet = annotation?.runFeet ?? 0;
  const runs = useMemo(() => runFeetOf(annotation), [annotation]);
  // Each drawn run is priced on its own and the prices added up.
  const suggestion = useMemo(() => boreLineFor(runs, feet), [runs, feet]);
  const suggested = suggestion.price;
  const totals = useMemo(() => computeTotals(lines), [lines]);
  const hasLines = lines.length > 0;

  // Tell the page: unsaved?, on-screen total, footage.
  const onStateRef = useRef(onStateChange);
  onStateRef.current = onStateChange;
  const shownTotal = priceNow !== null && !Number.isNaN(priceNow) ? priceNow : null;
  useEffect(() => {
    onStateRef.current?.({ dirty, total: shownTotal, feet });
  }, [dirty, shownTotal, feet]);

  // The bore line filled in from the drawing, and whether the drawing moved on.
  const drawLine = lines.find((l) => l.key === DRAWING_BORE_KEY);
  const drawLineFeet = drawLine ? boreFeetInText(drawLine.description) : null;
  const drawingStale =
    !!drawLine &&
    feet > 0 &&
    drawLineFeet !== null &&
    (Math.round(drawLineFeet) !== suggestion.feet || runCountInText(drawLine.description) !== Math.max(runs.length, 1));
  const updateDrawLine = () =>
    setLines((prev) =>
      prev.map((l) =>
        l.key === DRAWING_BORE_KEY ? { ...l, description: suggestion.description, qty: "1", unitPrice: String(suggestion.price) } : l
      )
    );

  const flags: string[] = [];
  const soilFlag = quote.soilType ? NONSTANDARD_SOIL[quote.soilType] : undefined;
  if (soilFlag) flags.push(`Customer reported ${soilFlag}. Standard rates don't apply.`);
  if (annotation?.pipeSize === '4"+') {
    flags.push('Pipe over 3". Standard rates don\'t apply.');
  }

  const addLine = (kind: "work" | "material") => {
    const first = kind === "work" && lines.every((l) => l.kind !== "work");
    const prefill = first
      ? {
          description: suggestion.description,
          unitPrice: suggested > 0 ? String(suggested) : "",
          // Marks it as the drawing's bore line, so a redraw can offer to update it.
          ...(feet > 0 ? { key: DRAWING_BORE_KEY } : {}),
        }
      : { description: "", unitPrice: "" };
    setLines((prev) => [...prev, { id: idRef.next++, kind, qty: "1", ...prefill }]);
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
      setError(path === "push" ? "Bore-ON push failed. Try again." : "Couldn't pull from Bore-ON. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    await saveCore();
  };

  const saveCore = async (): Promise<WorkbenchSaveResult> => {
    setError("");
    if (stale) {
      setError(CHANGED_ELSEWHERE);
      return { ok: false, changed: false, price: null, error: CHANGED_ELSEWHERE };
    }
    const price = priceNow;
    if (price !== null && Number.isNaN(price)) {
      setError("That price doesn't look like a number.");
      return { ok: false, changed: false, price: null, error: "That price doesn't look like a number." };
    }
    setSaving(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("no token");
      const snap: Baseline = {
        price,
        lines: savedLines.length ? savedLines : null,
        ann: annotation,
        scope: scopeMarker,
      };
      // The Leaflet tool doesn't edit legacy polygon shapes. Carry them
      // through so saving never silently drops a customer's drawing.
      const merged = annotation ? { ...annotation, polygons: quote.mapAnnotation?.polygons ?? [] } : null;
      // "Keep mine" on a Bore-ON re-price means: write over the new prices.
      const expectKey = repriceWaiting ? serverKey : loadedKey;
      const r = await saveQuoteWork(
        quote.id,
        { mapAnnotation: merged, quotedPrice: price, quoteLines: snap.lines, scopeText, expectKey },
        token
      );
      if (r.conflict) {
        setError(CHANGED_ELSEWHERE);
        return { ok: false, changed: false, price: null, error: CHANGED_ELSEWHERE };
      }
      setPriorKey(loadedKey);
      setLoadedKey(r.key);
      // The address found on the map is the job's address; the lead wants it too.
      if (merged?.address) await syncQuoteAddress(quote.id, merged.address, token).catch(() => {});
      setBase(snap);
      setSavedNote(r.wrote ? "Saved." : "No changes to save.");
      return { ok: true, changed: r.changed, price };
    } catch {
      setError("Couldn't save. Try again.");
      return { ok: false, changed: false, price: null, error: "Couldn't save the quote. Try again." };
    } finally {
      setSaving(false);
    }
  };
  if (saveRef) saveRef.current = saveCore;

  const inputCls =
    "px-2 py-1.5 bg-background border border-border rounded-md text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="border border-primary/40 rounded-lg p-4 space-y-4 bg-background/40">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-semibold text-sm">
          Work up this quote{quote.address ? `: ${quote.address}` : ""}
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
        onAnnotationChange={onAnnotation}
        geocodeAddress={quote.address}
        showBoreProfile
        variant="admin"
        onSaveShortcut={() => {
          if (!saving) void saveCore();
        }}
      />

      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="bg-muted rounded-md p-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Drawn run</p>
          <p className="font-bold text-lg">{feet > 0 ? `~${Math.round(feet)} ft` : "None yet"}</p>
          {runs.length > 1 && (
            <p className="text-[11px] text-muted-foreground leading-tight mt-1">
              {runs.length} runs: {runs.map((f) => `${Math.round(f)} ft`).join(", ")}
            </p>
          )}
        </div>
        <div className="bg-muted rounded-md p-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Rate sheet says</p>
          <p className="font-bold text-lg">{suggested > 0 ? money(suggested) : "None yet"}</p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-1">
            {runs.length > 1 ? "Each run priced on its own, then added up. " : ""}
            Standard conditions: pipe 3&quot; or under, no gravel or rock.
          </p>
        </div>
      </div>

      {flags.map((f) => (
        <p key={f} className="text-sm text-secondary flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {f}
        </p>
      ))}

      {stale && (
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm flex flex-wrap items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <span className="flex-1 min-w-[12rem]">
            Changed by someone else. Reload to see their changes. Saving or sending from this screen is blocked so it
            doesn&apos;t write over them.
          </span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-3 py-2 min-h-[44px] rounded-md bg-primary text-primary-foreground text-sm font-semibold"
          >
            Reload
          </button>
        </div>
      )}

      {repriceWaiting && (
        <div role="status" className="rounded-md border border-secondary/50 bg-secondary/10 p-3 text-sm space-y-2">
          <p>Bore-ON sent new prices. You have line changes that aren&apos;t saved, so they weren&apos;t loaded.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadReprice}
              className="px-3 py-2 min-h-[44px] rounded-md bg-primary text-primary-foreground text-sm font-semibold"
            >
              Load the new Bore-ON prices
            </button>
            <button
              type="button"
              onClick={() => {
                // Save now writes over the new prices, on purpose.
                setLoadedKey(serverKey);
                setRepriceWaiting(false);
              }}
              className="px-3 py-2 min-h-[44px] rounded-md border border-border text-sm hover:bg-muted"
            >
              Keep mine
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Loading them replaces the lines on screen. Keep mine and Save writes over them.</p>
        </div>
      )}

      {/* Line items */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Quote lines</p>
        {drawingStale && drawLine && (
          <div role="status" className="rounded-md border border-secondary/50 bg-secondary/10 p-3 text-sm flex flex-wrap items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-secondary shrink-0" />
            <span className="flex-1 min-w-[12rem]">
              The drawing is now ~{suggestion.feet} ft{runs.length > 1 ? ` in ${runs.length} runs` : ""}. The bore line still
              says ~{Math.round(drawLineFeet ?? 0)} ft at {money(toNum(drawLine.qty) * toNum(drawLine.unitPrice))}.
            </span>
            <button
              type="button"
              onClick={updateDrawLine}
              className="px-3 py-2 min-h-[44px] rounded-md bg-primary text-primary-foreground text-sm font-semibold"
            >
              Update to {suggestion.feet} ft / {money(suggestion.price)}
            </button>
          </div>
        )}
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
                className={cn(inputCls, "col-span-2 sm:col-span-1 w-full", l.source === "auto" && "border-primary/40")}
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
                className={cn(inputCls, "text-right")}
                aria-label="Quantity"
              />
              <input
                type="text"
                inputMode="decimal"
                value={l.unitPrice}
                onChange={(e) => patchLine(l.id, { unitPrice: e.target.value })}
                placeholder="0.00"
                className={cn(inputCls, "text-right")}
                aria-label="Unit price"
              />
              <span className="text-sm text-right font-medium tabular-nums">
                {lineTotal > 0 ? money(lineTotal) : l.description.trim() ? "Included" : ""}
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
        {lines.some((l) => l.description.trim() && toNum(l.qty) * toNum(l.unitPrice) === 0) && (
          <p className="text-xs text-muted-foreground">$0 lines show on the customer&apos;s quote as Included.</p>
        )}
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
          <label htmlFor={`price-${quote.id}`} className="text-xs text-muted-foreground uppercase tracking-wider">
            Quoted price (or add lines above)
          </label>
          <input
            id={`price-${quote.id}`}
            type="text"
            inputMode="decimal"
            value={manualPrice}
            onChange={(e) => setManualPrice(e.target.value)}
            placeholder="Type a price"
            className={cn(inputCls, "w-full mt-1 font-semibold")}
          />
          {suggested > 0 && toNum(manualPrice) !== suggested && (
            <button
              type="button"
              onClick={() => setManualPrice(String(suggested))}
              className="mt-2 w-full px-3 py-2 min-h-[44px] rounded-md border border-primary text-primary text-sm font-semibold hover:bg-primary/10"
            >
              Use {money(suggested)} from the rate sheet
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          title="Ctrl+S"
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
        {savedNote && !dirty && !saving && !error && <span className="text-xs text-muted-foreground">{savedNote}</span>}
        {dirty && !saving && !error && <span className="text-xs text-secondary">Unsaved changes</span>}
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
