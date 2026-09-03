"use client";

import { useEffect, useRef, useState } from "react";
import { haversineFeet, serviceColor, type LatLngLit } from "./map-v2/helpers";

// Elevation profile along the drawn bore line, from USGS 3DEP (1m DEM) via
// our /api/elevation proxy, with an optional drill-constrained bore path
// overlay (admin workbench).

interface Sample {
  dist: number; // feet from start
  elev: number; // feet above sea level
}

export interface TerrainData {
  dists: number[];
  elevs: number[];
}

// Owner's rig specs (Sept 2026): entry pitch in percent grade, steering rate
// in percent pitch change per foot pushed, rod length (entry pitch is held
// for exactly one rod before steering starts). Entry/exit pits 2.5 ft.
const PIT_DEPTH = 2.5;
const DRILLS: Array<{
  id: string;
  label: string;
  entryPct: number;
  ratePctPerFt: number;
  rodFt: number;
}> = [
  { id: "10x15", label: "D10x15", entryPct: 30, ratePctPerFt: 10 / 6, rodFt: 6 },
  { id: "20x22", label: "D20x22", entryPct: 25, ratePctPerFt: 10 / 10, rodFt: 10 },
  { id: "23x30", label: "D23x30", entryPct: 25, ratePctPerFt: 10 / 10, rodFt: 10 },
];

// Required cover below the ground surface (owner): water and sewer run 5 ft
// or deeper, everything else 2 ft. Unknown service gets the safe 5 ft.
function coverFor(service?: string): number {
  if (service === "water" || service === "septic") return 5;
  if (service && service in { power: 1, gas: 1, internet: 1, drainage: 1 }) return 2;
  return 5;
}

/**
 * Shallowest bore that (a) holds the entry pitch for one rod, (b) steers no
 * faster than the rig allows, (c) stays at least `coverFt` under the ground
 * wherever the entry/exit geometry makes that possible, and (d) lands in the
 * 2.5 ft pits at both ends. Built as an envelope: the path is the highest
 * elevation under all three ceilings — steer-up-from-entry, steer-up-from-
 * exit (mirrored), and terrain minus cover — but never above what diving at
 * the entry pitch from either pit allows (which is what forces the shallow
 * stretch right at the pits). Null when the run is too short to climb back
 * out to a 2.5 ft pit.
 */
function borePath(
  samples: Sample[],
  entryPct: number,
  ratePctPerFt: number,
  rodFt: number,
  coverFt: number
): { elevs: number[]; deepest: number } | null {
  const L = samples[samples.length - 1].dist;
  const a = entryPct / 100;
  const r = ratePctPerFt / 100;
  const swing = (2 * a) / r; // footage to steer from -a all the way to +a
  const e0 = samples[0].elev - PIT_DEPTH;
  const e1 = samples[samples.length - 1].elev - PIT_DEPTH;

  // Max elevation reachable at distance x from a pit at elevation e: hold -a
  // for one rod, then steer up at r, capped at +a.
  const up = (x: number, e: number): number => {
    if (x <= rodFt) return e - a * x;
    const u = x - rodFt;
    if (u < swing) return e - a * rodFt - a * u + (r * u * u) / 2;
    return e - a * rodFt + a * (u - swing);
  };

  // Must be able to climb from each pit back up to the other end's pit.
  if (up(L, e0) < e1 - 0.01 || up(L, e1) < e0 - 0.01) return null;

  const elevs = samples.map((s) => {
    const x = s.dist;
    const sx = L - x;
    const fwd = up(x, e0);
    const back = up(sx, e1);
    const ceil = s.elev - coverFt;
    const diveF = e0 - a * x; // steepest dive from entry
    const diveB = e1 - a * sx; // steepest dive from exit (mirrored)
    return Math.max(Math.min(fwd, back, ceil), diveF, diveB);
  });

  return { elevs, deepest: Math.min(...elevs) };
}

/** Walk the polyline and emit evenly spaced sample coordinates. */
function samplePath(points: LatLngLit[], maxSamples: number): Array<{ p: LatLngLit; dist: number }> {
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversineFeet(points[i - 1], points[i]);
    segs.push(d);
    total += d;
  }
  if (total <= 0) return [];
  const step = Math.max(total / (maxSamples - 1), 5);
  const out: Array<{ p: LatLngLit; dist: number }> = [{ p: points[0], dist: 0 }];
  let target = step;
  let walked = 0;
  for (let i = 0; i < segs.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    while (target <= walked + segs[i] && out.length < maxSamples - 1) {
      const t = (target - walked) / segs[i];
      out.push({
        p: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
        dist: target,
      });
      target += step;
    }
    walked += segs[i];
  }
  out.push({ p: points[points.length - 1], dist: total });
  return out;
}

export function TerrainProfile({
  points,
  service,
  boreControls = false,
  onData,
}: {
  points: LatLngLit[];
  service?: string;
  /** Show the drill picker + bore path overlay (admin workbench). */
  boreControls?: boolean;
  /** Called with the sampled ground profile (or null) so it can be saved. */
  onData?: (t: TerrainData | null) => void;
}) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [drillId, setDrillId] = useState(DRILLS[0].id);
  const lastKeyRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    if (points.length < 2) {
      setSamples([]);
      setState("idle");
      lastKeyRef.current = "";
      onDataRef.current?.(null);
      return;
    }
    const key = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(";");
    if (key === lastKeyRef.current) return;

    const timer = setTimeout(async () => {
      lastKeyRef.current = key;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setState("loading");
      try {
        const spots = samplePath(points, 40);
        const res = await fetch("/api/elevation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ points: spots.map((s) => s.p) }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`elevation ${res.status}`);
        const data = (await res.json()) as { elevations: Array<number | null> };
        const good: Sample[] = [];
        data.elevations.forEach((e, i) => {
          if (typeof e === "number" && Number.isFinite(e)) {
            good.push({ dist: spots[i].dist, elev: e });
          }
        });
        if (good.length < Math.max(4, spots.length * 0.5)) throw new Error("too few samples");
        setSamples(good);
        setState("ready");
        onDataRef.current?.({
          dists: good.map((s) => Math.round(s.dist * 10) / 10),
          elevs: good.map((s) => Math.round(s.elev * 10) / 10),
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setState("error");
          onDataRef.current?.(null);
        }
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [points]);

  if (state === "idle") return null;
  if (state === "loading" && samples.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Reading the lay of the land along your line...</p>
    );
  }
  if (state === "error") {
    return (
      <p className="text-xs text-muted-foreground">
        Couldn&apos;t load the ground elevation right now — your line and quote aren&apos;t affected.
      </p>
    );
  }
  if (samples.length < 2) return null;

  const total = samples[samples.length - 1].dist;
  const minE = Math.min(...samples.map((s) => s.elev));
  const maxE = Math.max(...samples.map((s) => s.elev));
  const relief = maxE - minE;
  const startEndDelta = samples[samples.length - 1].elev - samples[0].elev;

  // Bore path (admin): shallowest legal profile for the selected rig.
  const drill = DRILLS.find((d) => d.id === drillId) ?? DRILLS[0];
  const coverFt = coverFor(service);
  const bore = boreControls
    ? borePath(samples, drill.entryPct, drill.ratePctPerFt, drill.rodFt, coverFt)
    : null;
  let minCover = Infinity;
  let maxCover = 0;
  if (bore) {
    samples.forEach((s, i) => {
      const cover = s.elev - bore.elevs[i];
      if (cover < minCover) minCover = cover;
      if (cover > maxCover) maxCover = cover;
    });
  }

  const W = 600;
  const H = boreControls ? 190 : 150;
  const PAD_L = 44;
  const PAD_R = 10;
  const PAD_T = 14;
  const PAD_B = 22;

  // Vertical scale covers ground and bore; flat yards get a sane minimum.
  const loAll = bore ? Math.min(minE, bore.deepest) : minE;
  const span = Math.max(maxE - loAll, 6);
  const yLo = loAll - span * 0.08;
  const yHi = maxE + span * 0.12;

  const x = (d: number) => PAD_L + ((W - PAD_L - PAD_R) * d) / total;
  const y = (e: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - (e - yLo) / (yHi - yLo));

  const groundD = samples
    .map((s, i) => `${i === 0 ? "M" : "L"}${x(s.dist).toFixed(1)},${y(s.elev).toFixed(1)}`)
    .join(" ");
  const areaD = `${groundD} L${x(total).toFixed(1)},${(H - PAD_B).toFixed(1)} L${PAD_L},${(H - PAD_B).toFixed(1)} Z`;
  const boreD = bore
    ? samples
        .map((s, i) => `${i === 0 ? "M" : "L"}${x(s.dist).toFixed(1)},${y(bore.elevs[i]).toFixed(1)}`)
        .join(" ")
    : "";
  const color = serviceColor(service);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className="text-sm font-medium">Ground profile along your line</p>
        <p className="text-xs text-muted-foreground">
          {relief < 3
            ? "Nearly flat ground"
            : `${Math.round(relief)} ft of rise and fall · ${
                startEndDelta >= 0 ? "uphill" : "downhill"
              } ${Math.abs(Math.round(startEndDelta))} ft start to end`}
        </p>
      </div>

      {boreControls && (
        <div className="flex flex-wrap items-center gap-2">
          {DRILLS.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDrillId(d.id)}
              aria-pressed={drillId === d.id}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                drillId === d.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted border-border hover:border-primary hover:text-primary"
              }`}
            >
              {d.label}
            </button>
          ))}
          <span className="text-[11px] text-muted-foreground">
            {drill.entryPct}% entry, one rod · 10% per {drill.rodFt} ft · {PIT_DEPTH} ft pits ·{" "}
            {coverFt} ft cover
          </span>
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto rounded-md border border-border bg-muted"
        role="img"
        aria-label="Elevation profile along the drawn line"
      >
        <path d={areaD} fill={color} opacity="0.18" />
        <path d={groundD} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        {bore && (
          <path
            d={boreD}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="7 5"
            strokeLinejoin="round"
            opacity="0.85"
          />
        )}
        <text x={PAD_L - 6} y={y(maxE) + 4} textAnchor="end" fontSize="10" fill="currentColor" opacity="0.65">
          {Math.round(maxE)} ft
        </text>
        <text x={PAD_L - 6} y={y(minE) + 4} textAnchor="end" fontSize="10" fill="currentColor" opacity="0.65">
          {Math.round(minE)} ft
        </text>
        <text x={PAD_L} y={H - 6} fontSize="10" fill="currentColor" opacity="0.65">
          Start
        </text>
        <text x={W - PAD_R} y={H - 6} textAnchor="end" fontSize="10" fill="currentColor" opacity="0.65">
          {Math.round(total)} ft
        </text>
        <circle cx={x(0)} cy={y(samples[0].elev)} r="3.5" fill={color} stroke="#fff" strokeWidth="1.5" />
        <circle
          cx={x(total)}
          cy={y(samples[samples.length - 1].elev)}
          r="3.5"
          fill={color}
          stroke="#fff"
          strokeWidth="1.5"
        />
      </svg>

      {boreControls &&
        (bore ? (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{drill.label} shallowest bore</span>{" "}
            (dashed), holding {coverFt} ft of cover: deepest point{" "}
            {maxCover.toFixed(1)} ft below grade. Shallower only in the pit approaches at the
            ends. Steer deeper anytime — this is the minimum.
          </p>
        ) : (
          <p className="text-xs text-secondary">
            ⚠ Run is too short for the {drill.label} to get back up to a {PIT_DEPTH} ft pit at a{" "}
            {drill.entryPct}% entry — plan deeper pits, a shallower entry, or a longer run.
          </p>
        ))}
      <p className="text-[11px] text-muted-foreground">
        Ground surface from USGS elevation data.
        {!boreControls && " The bore itself runs below all of this."}
      </p>
    </div>
  );
}
