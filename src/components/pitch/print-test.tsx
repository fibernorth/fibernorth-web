"use client";

import { useState } from "react";
import { clampScale, inchesLabel, scaleFromMeasure } from "@/lib/pitch/print-scale";

// Printing at the wrong size: a test box at exactly the card's size, and the
// correction that follows from measuring it. The test box prints through the
// same path and at the same scale as the cards, so what it measures is what the
// cards will measure.

/** One box at the card's size, with an inch scale bar and ticks. Printed only. */
export function PrintTestSheet({ width, height, scale }: { width: number; height: number; scale: number }) {
  const w = (width * scale) / 100;
  const h = (height * scale) / 100;
  const ticksAcross = Array.from({ length: Math.floor(w) + 1 }, (_, i) => i);
  const ticksDown = Array.from({ length: Math.floor(h) + 1 }, (_, i) => i);
  return (
    <div className="pc-coach" style={{ breakBefore: "auto" }}>
      <h1>Size test</h1>
      <p>
        The box below should measure <b>{inchesLabel(width)} × {inchesLabel(height)} in</b>. The bar under it is exactly 1 inch at true
        size. Measure the box with a ruler, then type the width into the Printer scale box on the Card tab.
      </p>
      <p>Printed at {scale}%.</p>
      <div style={{ marginTop: "0.25in", position: "relative", width: `${w}in`, height: `${h}in`, border: "1pt solid #000", boxSizing: "border-box" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: "50%", textAlign: "center", fontSize: "10pt", transform: "translateY(-50%)" }}>
          {inchesLabel(width)} × {inchesLabel(height)} in
        </div>
        {ticksAcross.map((i) => (
          <div key={`a${i}`} style={{ position: "absolute", left: `${(i * scale) / 100}in`, top: 0, width: 0, height: "0.12in", borderLeft: "1pt solid #000" }} />
        ))}
        {ticksDown.map((i) => (
          <div key={`d${i}`} style={{ position: "absolute", top: `${(i * scale) / 100}in`, left: 0, height: 0, width: "0.12in", borderTop: "1pt solid #000" }} />
        ))}
      </div>
      <div style={{ marginTop: "0.2in", width: `${scale / 100}in`, borderTop: "3pt solid #000", fontSize: "9pt" }}>1 in</div>
    </div>
  );
}

/** The Card tab control: test sheet, measure, and the scale it works out. */
export function PrinterScale({
  width,
  height,
  scale,
  setScale,
  onTest,
}: {
  width: number;
  height: number;
  scale: number;
  setScale: (n: number) => void;
  onTest: () => void;
}) {
  const [measured, setMeasured] = useState("");
  const m = Number(measured.replace(/[^\d.]/g, ""));
  const suggested = scaleFromMeasure(width, m, scale);
  const usable = m > 0 && Number.isFinite(m);

  return (
    <div className="rounded-lg border border-white/10 p-3 space-y-2 text-sm">
      <div className="font-semibold">Card prints the wrong size?</div>
      <p className="text-xs text-white/60">
        Print the size test, measure the box with a ruler, and type its width below. The scale is kept on this device only: it never
        changes the card or its number.
      </p>
      <button onClick={onTest} className="w-full rounded-lg bg-white/10 py-2 font-semibold">
        Print size test ({inchesLabel(width)} × {inchesLabel(height)} in)
      </button>
      <div className="flex gap-2 items-end">
        <label className="text-xs text-white/60 flex-1">
          The box measured (inches wide)
          <input
            className="w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-base text-white"
            inputMode="decimal"
            placeholder={String(width)}
            value={measured}
            onChange={(e) => setMeasured(e.target.value)}
          />
        </label>
        <button
          disabled={!usable}
          onClick={() => { setScale(suggested); setMeasured(""); }}
          className="rounded-lg bg-amber-400 text-black font-bold px-4 py-2 disabled:opacity-40"
        >
          Set {usable ? `${suggested}%` : "scale"}
        </button>
      </div>
      <label className="text-xs text-white/60 block">
        Printer scale (%)
        <input
          className="w-full rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-base text-white"
          inputMode="decimal"
          value={scale}
          onChange={(e) => setScale(clampScale(e.target.value.replace(/[^\d.]/g, "")))}
        />
      </label>
      <p className="text-xs text-white/50">100% is true size. Reprint the test after changing it; the box should now measure {inchesLabel(width)} in.</p>
    </div>
  );
}
