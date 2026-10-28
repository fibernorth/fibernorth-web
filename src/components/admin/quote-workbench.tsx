"use client";

import { isLargePipe } from "@/components/quote/map-v2/helpers";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AlertTriangle, Loader2, Plus, X } from "lucide-react";
import { useAuth } from "@/context/auth-provider";
import { useIsOwner } from "@/hooks/use-is-owner";
import { saveQuoteWork, syncQuoteAddress } from "@/actions/quotes";
import { getPricing } from "@/actions/pricing";
import { runFeetOf } from "@/lib/pricing";
import {
  belowRules,
  DEFAULT_PRICING,
  isRuleKey,
  mergeRuleLines,
  quoteRules,
  type PriceItem,
  type PricingSettings,
  type RuleInput,
} from "@/lib/quote-rules";
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
  /** Generated (Bore-ON design or price rules); editing it makes it the estimator's. */
  source?: "auto" | "manual";
  key?: string;
  /** Added from the price list with no set price: must be filled before saving. Not saved. */
  needsPrice?: boolean;
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

/** Each drawn line's footage, whole feet, as the footage inputs hold them. */
const drawnRows = (a: Pick<MapAnnotation, "paths" | "runFeet"> | null | undefined): string[] =>
  runFeetOf(a).map((f) => String(Math.round(f)));

const sameRows = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => toNum(x) === toNum(b[i]));

const ruleInputOf = (people: string, days: string, rows: string[]): RuleInput => ({
  people: toNum(people),
  days: toNum(days),
  lines: rows.map(toNum).filter((f) => f > 0).map((feet) => ({ feet })),
});

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
  /** People, days and footage (crewSig). */
  crew: string;
}

/** Unsaved workbench changes kept on this device after a failed save. */
interface QuoteDraft {
  /** The saved quote the changes were made on; restored only if it still matches. */
  serverKey: string;
  annotation: MapAnnotation | null;
  lines: DraftLine[];
  manualPrice: string;
  at: string;
  people?: string;
  days?: string;
  feetRows?: string[];
  feetFromDrawing?: boolean;
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
  // Work kept on this device when a save fails (site updated mid-edit, lost
  // signal), put back when the quote opens again unchanged since.
  const draftKey = `fn.quoteDraft.${quote.id}`;
  const [restored] = useState<QuoteDraft | null>(() => {
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) || "null") as QuoteDraft | null;
      return d && d.serverKey === workContentKey(quote) ? d : null;
    } catch {
      return null;
    }
  });
  const [restoredNote, setRestoredNote] = useState(Boolean(restored));
  const [annotation, setAnnotation] = useState<MapAnnotation | null>(restored ? restored.annotation : quote.mapAnnotation ?? null);
  const [lines, setLines] = useState<DraftLine[]>(() => (restored ? restored.lines : toDraft(quote.quoteLines)));
  const [manualPrice, setManualPrice] = useState(
    restored
      ? restored.manualPrice
      : typeof quote.quotedPrice === "number" && !(quote.quoteLines && quote.quoteLines.length)
        ? String(quote.quotedPrice)
        : ""
  );
  const [staleBuild, setStaleBuild] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [boreOnUrl, setBoreOnUrl] = useState<string>(quote.boreOnUrl ?? "");
  // "Start over" forgets the link on the server; this hides the buttons that need it until the next send.
  const [unlinked, setUnlinked] = useState(false);
  const linked = Boolean(quote.boreOnDesignId) && !unlinked;
  const [boreOnNote, setBoreOnNote] = useState("");
  const idRef = useState(() => ({ next: 1000 }))[0];
  const isOwner = useIsOwner();

  // The owner's price rules and price list (/admin/pricing). Defaults until loaded.
  const [pricing, setPricing] = useState<PricingSettings>(DEFAULT_PRICING);
  const rules = pricing.rules;
  // Crew and footage the labor is priced from. Footage follows the drawing
  // until the estimator types his own.
  const [people, setPeopleRaw] = useState(() => restored?.people ?? String(quote.people ?? DEFAULT_PRICING.rules.defaultPeople));
  const [days, setDaysRaw] = useState(() => restored?.days ?? String(quote.days ?? DEFAULT_PRICING.rules.defaultDays));
  const [feetRows, setFeetRows] = useState<string[]>(
    () => restored?.feetRows ?? (quote.lineFeet ? quote.lineFeet.map(String) : drawnRows(quote.mapAnnotation))
  );
  const [feetFromDrawing, setFeetFromDrawing] = useState<boolean>(
    () =>
      restored?.feetFromDrawing ??
      (!quote.lineFeet || sameRows(quote.lineFeet.map(String), drawnRows(quote.mapAnnotation)))
  );
  const [crewTouched, setCrewTouched] = useState(Boolean(restored));
  const crewSig = JSON.stringify([toNum(people), toNum(days), feetRows.map(toNum)]);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const p = await getPricing(token);
        if (!live) return;
        setPricing(p);
        // A quote never priced by crew starts from the owner's defaults.
        if (quote.people == null && !restored) setPeopleRaw(String(p.rules.defaultPeople));
        if (quote.days == null && !restored) setDaysRaw(String(p.rules.defaultDays));
      } catch {
        // Keep the defaults; the server checks the saved quote against the real rules.
      }
    })();
    return () => {
      live = false;
    };
    // Once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      crew: crewSig,
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
  const dirty = keyNow !== baseKey || (crewTouched && crewSig !== base.crew);
  const linesDirty =
    customerContentKey({ quotedPrice: Number.isNaN(priceNow) ? -1 : priceNow, quoteLines: savedLines.length ? savedLines : null }) !==
    customerContentKey({ quotedPrice: base.price, quoteLines: base.lines });

  // The map tool tidies a saved drawing when it loads (and fills in fields an
  // older drawing lacks). Take its first report as the saved state, so
  // opening a quote doesn't count as an edit.
  const settledRef = useRef(false);
  const onAnnotation = (a: MapAnnotation | null) => {
    setAnnotation(a);
    const first = !settledRef.current;
    if (first) {
      settledRef.current = true;
      setBase((b) => ({ ...b, ann: a }));
    }
    // The footage follows the drawing unless the estimator typed his own.
    const c = crewRef.current;
    if (!c.feetFromDrawing) return;
    const rows = drawnRows(a);
    if (sameRows(rows, c.feetRows)) return;
    setFeetRows(rows);
    if (!first) {
      setCrewTouched(true);
      syncRules({ rows });
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
  const runs = useMemo(() => drawnRows(annotation), [annotation]);
  const totals = useMemo(() => computeTotals(lines), [lines]);
  const hasLines = lines.length > 0;

  // Tell the page: unsaved?, on-screen total, footage.
  const onStateRef = useRef(onStateChange);
  onStateRef.current = onStateChange;
  const shownTotal = priceNow !== null && !Number.isNaN(priceNow) ? priceNow : null;
  useEffect(() => {
    onStateRef.current?.({ dirty, total: shownTotal, feet });
  }, [dirty, shownTotal, feet]);

  const flags: string[] = [];
  const soilFlag = quote.soilType ? NONSTANDARD_SOIL[quote.soilType] : undefined;
  if (soilFlag) flags.push(`Customer reported ${soilFlag}. Standard rates don't apply.`);
  if (isLargePipe(annotation?.pipeSize)) {
    flags.push('Pipe over 3". Standard rates don\'t apply.');
  }

  const addLine = (kind: "work" | "material") =>
    setLines((prev) => [...prev, { id: idRef.next++, kind, qty: "1", description: "", unitPrice: "" }]);

  // ---- Price rules -------------------------------------------------------
  const ruleResult = useMemo(() => quoteRules(ruleInputOf(people, days, feetRows), rules), [people, days, feetRows, rules]);
  const crewRef = useRef({ people, days, feetRows, feetFromDrawing, manualPrice, rules });
  crewRef.current = { people, days, feetRows, feetFromDrawing, manualPrice, rules };

  /**
   * Re-work the labor lines from the rules. Runs when the crew or footage
   * changes, on a quote that already has rule lines (or no lines and no typed
   * price yet). `reset` (the button) fills them in regardless, replacing any
   * edited rule line and the old rate-sheet bore line.
   */
  const syncRules = (next: { people?: string; days?: string; rows?: string[] } = {}, reset = false) => {
    const c = crewRef.current;
    const r = quoteRules(ruleInputOf(next.people ?? c.people, next.days ?? c.days, next.rows ?? c.feetRows), c.rules);
    setLines((prev) => {
      const on = reset || prev.some((l) => isRuleKey(l.key)) || (prev.length === 0 && !c.manualPrice.trim());
      if (!on) return prev;
      const fresh: DraftLine[] = r.items.map((it) => ({
        id: prev.find((l) => l.key === it.key)?.id ?? idRef.next++,
        description: it.description,
        kind: "work",
        qty: "1",
        unitPrice: String(it.amount),
        source: "auto",
        key: it.key,
      }));
      return mergeRuleLines(prev, fresh, { reset });
    });
  };

  const setPeople = (v: string) => {
    setPeopleRaw(v);
    setCrewTouched(true);
    syncRules({ people: v });
  };
  const setDays = (v: string) => {
    setDaysRaw(v);
    setCrewTouched(true);
    syncRules({ days: v });
  };
  const setRows = (rows: string[]) => {
    setFeetRows(rows);
    setFeetFromDrawing(false);
    setCrewTouched(true);
    syncRules({ rows });
  };
  const applyDrawingFeet = () => {
    setFeetRows(runs);
    setFeetFromDrawing(true);
    setCrewTouched(true);
    syncRules({ rows: runs });
  };

  const rulesOn = lines.some((l) => isRuleKey(l.key));
  const ruleLinesTotal = lines.filter((l) => isRuleKey(l.key)).reduce((s, l) => s + toNum(l.qty) * toNum(l.unitPrice), 0);
  const rulesMatch = rulesOn && Math.abs(ruleLinesTotal - ruleResult.labor) < 0.005;
  // Labor actually on the quote: its work lines, or the typed price with no lines.
  const actualLabor = hasLines ? totals.work : shownTotal;
  const approvalReason = actualLabor === null ? "" : belowRules(actualLabor, ruleResult, rules);
  const perManDay = actualLabor !== null && ruleResult.manDays > 0 ? actualLabor / ruleResult.manDays : null;

  const priceItems = pricing.items.filter((i) => i.active);
  const addPriceItem = (item: PriceItem) => {
    const totalFeet = feetRows.reduce((s, f) => s + toNum(f), 0);
    setLines((prev) => [
      ...prev,
      {
        id: idRef.next++,
        kind: item.kind,
        description: item.name,
        qty: item.unit === "ft" && totalFeet > 0 ? String(totalFeet) : "1",
        unitPrice: item.price === null ? "" : String(item.price),
        key: `price:${item.id}`,
        ...(item.price === null ? { needsPrice: true } : {}),
      },
    ]);
  };
  const unpriced = lines.filter((l) => l.needsPrice && l.unitPrice.trim() === "");

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
      if (path === "push") setUnlinked(false);
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

  const startOver = async () => {
    if (!window.confirm("Forget this quote's Bore-ON link? The design stays in Bore-ON and the quote's prices are untouched. The next send makes a new link.")) return;
    setError("");
    setBoreOnNote("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("no token");
      const res = await fetch("/api/bore-on/unlink", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quote.id }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error || "Couldn't clear the link.");
        return;
      }
      setBoreOnUrl("");
      setUnlinked(true);
      setBoreOnNote("Link cleared. Send to Bore-ON to start over.");
    } catch {
      setError("Couldn't clear the link. Try again.");
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
    if (unpriced.length) {
      const text = `Fill in the price for: ${unpriced.map((l) => l.description || "a line").join(", ")}.`;
      setError(text);
      return { ok: false, changed: false, price: null, error: text };
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
        crew: crewSig,
      };
      // The Leaflet tool doesn't edit legacy polygon shapes. Carry them
      // through so saving never silently drops a customer's drawing.
      const merged = annotation ? { ...annotation, polygons: quote.mapAnnotation?.polygons ?? [] } : null;
      // "Keep mine" on a Bore-ON re-price means: write over the new prices.
      const expectKey = repriceWaiting ? serverKey : loadedKey;
      const r = await saveQuoteWork(
        quote.id,
        {
          mapAnnotation: merged,
          quotedPrice: price,
          quoteLines: snap.lines,
          scopeText,
          expectKey,
          people: toNum(people),
          days: toNum(days),
          lineFeet: feetRows.map(toNum).filter((f) => f > 0),
        },
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
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // storage blocked
      }
      setRestoredNote(false);
      setStaleBuild(false);
      return { ok: true, changed: r.changed, price };
    } catch (e) {
      // Keep the work on this device so a reload doesn't lose it.
      try {
        const d: QuoteDraft = {
          serverKey: loadedKey,
          annotation,
          lines,
          manualPrice,
          at: new Date().toISOString(),
          people,
          days,
          feetRows,
          feetFromDrawing,
        };
        localStorage.setItem(draftKey, JSON.stringify(d));
      } catch {
        // storage blocked
      }
      const raw = e instanceof Error ? e.message : String(e);
      const updated = /server action|unexpected response|failed to fetch|load failed|networkerror|chunk/i.test(raw);
      setStaleBuild(updated);
      const text = updated
        ? "Couldn't reach the server: the site was updated while this page was open, or the signal dropped. Your map and prices are kept on this device. Reload, then tap Save quote."
        : `Couldn't save: ${raw || "unknown error"}. Your work is kept on this device.`;
      setError(text);
      return { ok: false, changed: false, price: null, error: text };
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

      {/* Price from rules: crew, footage, and the labor they come to. */}
      <div className="rounded-md border border-border p-3 space-y-3 text-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground uppercase tracking-wider">People</span>
            <input
              type="text"
              inputMode="numeric"
              value={people}
              onChange={(e) => setPeople(e.target.value)}
              className={cn(inputCls, "w-20 text-right font-semibold")}
              aria-label="Crew size (people)"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground uppercase tracking-wider">Days</span>
            <input
              type="text"
              inputMode="decimal"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className={cn(inputCls, "w-20 text-right font-semibold")}
              aria-label="Days"
            />
          </label>
          <div className="flex-1 min-w-[12rem] space-y-1">
            <span className="block text-xs text-muted-foreground uppercase tracking-wider">
              Bore lines {feetFromDrawing ? "(from the drawing)" : "(typed)"}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {feetRows.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={f}
                    onChange={(e) => setRows(feetRows.map((x, j) => (j === i ? e.target.value : x)))}
                    className={cn(inputCls, "w-20 text-right")}
                    aria-label={`Line ${i + 1} feet`}
                  />
                  <span className="text-xs text-muted-foreground">ft</span>
                  <button
                    type="button"
                    onClick={() => setRows(feetRows.filter((_, j) => j !== i))}
                    aria-label={`Remove line ${i + 1}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => setRows([...feetRows, ""])}
                className="flex items-center gap-1 px-2 py-1 text-xs border border-border rounded-md hover:border-primary hover:text-primary"
              >
                <Plus className="h-3 w-3" /> Line
              </button>
            </div>
            {!feetFromDrawing && runs.length > 0 && !sameRows(runs, feetRows) && (
              <button type="button" onClick={applyDrawingFeet} className="text-xs text-primary hover:underline">
                Use the drawing: {runs.map((f) => `${f} ft`).join(", ")}
              </button>
            )}
          </div>
          {isOwner && (
            <Link href="/admin/pricing" className="text-xs text-primary hover:underline self-start">
              Edit price list
            </Link>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-muted rounded-md p-3 space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Price from rules</p>
            <p className="font-bold text-lg">{money(ruleResult.labor)}</p>
            <p className="text-[11px] text-muted-foreground leading-tight">
              The higher of by crew {money(ruleResult.byCrew.total)} and by footage {money(ruleResult.byFootage.total)}.
              Materials are extra.
            </p>
            <ul className="text-xs space-y-0.5 pt-1">
              {ruleResult.items.map((it) => (
                <li key={it.key} className="flex justify-between gap-2">
                  <span>{it.description}</span>
                  <span className="tabular-nums">{money(it.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-muted rounded-md p-3 space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Labor per man-day</p>
            <p className={cn("font-bold text-lg", perManDay !== null && perManDay < rules.minPerManDay && "text-destructive")}>
              {perManDay !== null ? money(Math.round(perManDay * 100) / 100) : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight">
              {actualLabor !== null ? `${money(actualLabor)} labor` : "No labor yet"} ÷ {ruleResult.manDays} man-day
              {ruleResult.manDays === 1 ? "" : "s"}. Lowest without approval: {money(rules.minPerManDay)}.
            </p>
            {rulesOn ? (
              rulesMatch ? (
                <p className="text-xs text-muted-foreground pt-1">Labor lines match the rules.</p>
              ) : (
                <div className="pt-1 space-y-1">
                  <p className="text-xs text-secondary">
                    Rule labor lines say {money(ruleLinesTotal)}; the rules say {money(ruleResult.labor)}.
                  </p>
                  <button
                    type="button"
                    onClick={() => syncRules({}, true)}
                    className="px-3 py-1.5 rounded-md border border-primary text-primary text-xs font-semibold hover:bg-primary/10"
                  >
                    Reset labor lines to the rules
                  </button>
                </div>
              )
            ) : (
              <button
                type="button"
                onClick={() => syncRules({}, true)}
                className="mt-1 px-3 py-2 min-h-[44px] rounded-md border border-primary text-primary text-sm font-semibold hover:bg-primary/10"
                title="Adds the labor lines from the rules (replaces an old rate-sheet bore line)"
              >
                Fill labor lines from rules ({money(ruleResult.labor)})
              </button>
            )}
          </div>
        </div>
        {approvalReason && (
          <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Needs approval: {approvalReason}
          </p>
        )}
      </div>

      <MapQuoteTool
        initial={restored ? restored.annotation : quote.mapAnnotation ?? null}
        onAnnotationChange={onAnnotation}
        geocodeAddress={quote.address}
        showBoreProfile
        variant="admin"
        onSaveShortcut={() => {
          if (!saving) void saveCore();
        }}
      />

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
                title={
                  l.source === "auto"
                    ? isRuleKey(l.key)
                      ? "From the price rules. Edit it and it stays as you typed it."
                      : "From the Bore-ON design. Edit it and the next sync leaves it alone."
                    : undefined
                }
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
                placeholder={l.needsPrice ? "Price?" : "0.00"}
                className={cn(inputCls, "text-right", l.needsPrice && !l.unitPrice.trim() && "border-destructive ring-1 ring-destructive")}
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
        <div className="flex flex-wrap gap-2">
          {priceItems.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const item = priceItems.find((i) => i.id === e.target.value);
                if (item) addPriceItem(item);
              }}
              className={cn(inputCls, "text-xs py-1.5")}
              aria-label="Add item from the price list"
            >
              <option value="">Add item from price list...</option>
              {(["work", "material"] as const).map((kind) => (
                <optgroup key={kind} label={kind === "work" ? "Work" : "Materials"}>
                  {priceItems
                    .filter((i) => i.kind === kind)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                        {i.price !== null ? ` (${money(i.price)}${i.unit === "lump" ? "" : `/${i.unit}`})` : " (price each job)"}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          )}
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
        {linked && (
          <button
            type="button"
            onClick={() => callBoreOn("pull")}
            disabled={pushing || pulling}
            className="px-4 py-2 border border-border rounded-md text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50"
          >
            {pulling ? "Pulling..." : "Pull from Bore-ON"}
          </button>
        )}
        {linked && (
          <button
            type="button"
            onClick={startOver}
            disabled={pushing || pulling}
            title="Forget this quote's link to its Bore-ON design"
            className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
          >
            Start over
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
        {staleBuild && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-3 py-1.5 text-xs font-semibold border border-destructive text-destructive rounded-md"
          >
            Reload page
          </button>
        )}
        {restoredNote && !error && (
          <span className="text-xs text-secondary">
            Put back your unsaved changes from {restored ? new Date(restored.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}. Tap Save quote.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                try {
                  localStorage.removeItem(draftKey);
                } catch {
                  // storage blocked
                }
                window.location.reload();
              }}
            >
              Discard them
            </button>
          </span>
        )}
      </div>

      <BoreOnPanel quote={quote} />
    </div>
  );
}
