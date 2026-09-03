"use client";

import { useEffect, useRef, useState } from "react";
import { haversineFeet, serviceColor, type LatLngLit } from "./map-v2/helpers";

// Elevation profile along the drawn bore line, from USGS 3DEP (1m DEM) via
// our /api/elevation proxy. Renders as a simple filled SVG chart with the
// relief numbers a driller actually cares about.

interface Sample {
  dist: number; // feet from start
  elev: number; // feet above sea level
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
}: {
  points: LatLngLit[];
  service?: string;
}) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const lastKeyRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (points.length < 2) {
      setSamples([]);
      setState("idle");
      lastKeyRef.current = "";
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
      } catch (err) {
        if ((err as Error).name !== "AbortError") setState("error");
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

  const W = 600;
  const H = 150;
  const PAD_L = 44;
  const PAD_R = 10;
  const PAD_T = 14;
  const PAD_B = 22;

  const total = samples[samples.length - 1].dist;
  const minE = Math.min(...samples.map((s) => s.elev));
  const maxE = Math.max(...samples.map((s) => s.elev));
  const relief = maxE - minE;
  // Give a flat yard a sane vertical scale instead of amplifying inches.
  const span = Math.max(relief, 6);
  const yLo = minE - (span - relief) / 2 - span * 0.08;
  const yHi = maxE + (span - relief) / 2 + span * 0.08;

  const x = (d: number) => PAD_L + ((W - PAD_L - PAD_R) * d) / total;
  const y = (e: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - (e - yLo) / (yHi - yLo));

  const lineD = samples.map((s, i) => `${i === 0 ? "M" : "L"}${x(s.dist).toFixed(1)},${y(s.elev).toFixed(1)}`).join(" ");
  const areaD = `${lineD} L${x(total).toFixed(1)},${(H - PAD_B).toFixed(1)} L${PAD_L},${(H - PAD_B).toFixed(1)} Z`;
  const color = serviceColor(service);
  const startEndDelta = samples[samples.length - 1].elev - samples[0].elev;

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
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto rounded-md border border-border bg-muted"
        role="img"
        aria-label="Elevation profile along the drawn line"
      >
        <path d={areaD} fill={color} opacity="0.18" />
        <path d={lineD} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        {/* min/max elevation labels */}
        <text x={PAD_L - 6} y={y(maxE) + 4} textAnchor="end" fontSize="10" fill="currentColor" opacity="0.65">
          {Math.round(maxE)} ft
        </text>
        <text x={PAD_L - 6} y={y(minE) + 4} textAnchor="end" fontSize="10" fill="currentColor" opacity="0.65">
          {Math.round(minE)} ft
        </text>
        {/* start / end distance labels */}
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
      <p className="text-[11px] text-muted-foreground">
        Ground surface from USGS elevation data. The bore itself runs below all of this.
      </p>
    </div>
  );
}
