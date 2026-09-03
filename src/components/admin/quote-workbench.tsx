"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/auth-provider";
import { updateDocument } from "@/actions/crud";
import type { MapAnnotation, QuoteRequest } from "@/lib/types";

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

// Internal rate sheet (owner, Sept 2026). Standard conditions: pipe 3" or
// smaller, ground not gravel or rock. Never shown to customers.
function ratePrice(feet: number): number {
  if (feet <= 0) return 0;
  if (feet <= 100) return 3000;
  if (feet <= 200) return 4000;
  return 4000 + Math.round(feet - 200) * 8;
}

// Soil values that break the standard-conditions assumption.
const NONSTANDARD_SOIL: Record<string, string> = {
  "sand-gravel": "gravel in the ground",
  cobble: "rocks or boulders",
  hardpan: "hardpan",
};

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
  const [priceInput, setPriceInput] = useState(
    typeof quote.quotedPrice === "number" ? String(quote.quotedPrice) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const feet = annotation?.runFeet ?? 0;
  const suggested = useMemo(() => ratePrice(feet), [feet]);

  const flags: string[] = [];
  const soilFlag = quote.soilType ? NONSTANDARD_SOIL[quote.soilType] : undefined;
  if (soilFlag) flags.push(`Customer reported ${soilFlag} — standard rates don't apply.`);
  if (annotation?.pipeSize === '4"+') {
    flags.push('Pipe over 3" — standard rates don\'t apply.');
  }

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("no token");
      const trimmed = priceInput.trim();
      const parsed = trimmed === "" ? null : Number(trimmed.replace(/[$,\s]/g, ""));
      if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
        setError("That price doesn't look like a number.");
        return;
      }
      // The Leaflet tool doesn't edit legacy polygon shapes — carry them
      // through so saving never silently drops a customer's drawing.
      const merged = annotation
        ? { ...annotation, polygons: quote.mapAnnotation?.polygons ?? [] }
        : null;
      const data: Record<string, unknown> = {
        mapAnnotation: merged,
        quotedPrice: parsed,
      };
      // Entering a price on a fresh quote moves it along the pipeline.
      if (parsed !== null && quote.status === "new") data.status = "quoted";
      await updateDocument("quoteRequests", quote.id, data, token);
      setSavedAt(Date.now());
    } catch {
      setError("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  };

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

      <MapQuoteTool initial={quote.mapAnnotation ?? null} onAnnotationChange={setAnnotation} />

      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <div className="bg-muted rounded-md p-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Drawn run</p>
          <p className="font-bold text-lg">{feet > 0 ? `~${Math.round(feet)} ft` : "—"}</p>
        </div>
        <div className="bg-muted rounded-md p-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Rate sheet says
          </p>
          <p className="font-bold text-lg">
            {suggested > 0 ? `$${suggested.toLocaleString()}` : "—"}
          </p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-1">
            Standard conditions: pipe 3&quot; or under, no gravel or rock.
          </p>
        </div>
        <div className="bg-muted rounded-md p-3">
          <label
            htmlFor={`price-${quote.id}`}
            className="text-xs text-muted-foreground uppercase tracking-wider"
          >
            Quoted price
          </label>
          <input
            id={`price-${quote.id}`}
            type="text"
            inputMode="decimal"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            placeholder={suggested > 0 ? String(suggested) : "0"}
            className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded-md text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {flags.map((f) => (
        <p key={f} className="text-sm text-secondary">
          ⚠ {f}
        </p>
      ))}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save map & price"}
        </button>
        {savedAt && !saving && !error && (
          <span className="text-xs text-muted-foreground">Saved.</span>
        )}
        {error && (
          <span role="alert" className="text-xs text-destructive">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
