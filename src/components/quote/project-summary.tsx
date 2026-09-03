"use client";

import type { MapAnnotation } from "@/lib/types";
import {
  MARKER_TYPES,
  SERVICE_COLORS,
  SERVICE_NAMES,
  existingServiceFromPathType,
  serviceColor,
} from "./map-v2/helpers";

// Customer-facing readback of everything they marked on the map — the same
// picture the shop sees, minus any pricing. Confirms the drawing "took" and
// nudges toward marking what's missing.
const SOIL_LABELS: Record<string, string> = {
  sand: "Sand",
  "sand-gravel": "Sand with gravel and stones",
  loam: "Topsoil / regular dirt",
  clay: "Clay",
  cobble: "Lots of rocks or boulders",
  hardpan: "Really hard digging (hardpan)",
  muck: "Wet, swampy, or muck",
  mixed: "Changes across the property",
};

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full border border-white/50 shrink-0"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}

export function ProjectSummary({
  annotation,
  soilType,
}: {
  annotation: MapAnnotation | null;
  soilType: string;
}) {
  if (!annotation) return null;

  const feet =
    typeof annotation.runFeet === "number" &&
    Number.isFinite(annotation.runFeet) &&
    annotation.runFeet > 0
      ? Math.round(annotation.runFeet)
      : 0;
  const existing = (annotation.paths ?? []).filter((p) => p.type.startsWith("existing"));
  const noteCount = annotation.labels?.length ?? 0;
  const markerNames = (annotation.markers ?? [])
    .map((m) => MARKER_TYPES.find((t) => t.type === m.type)?.label ?? "")
    .filter(Boolean);
  const pipe =
    annotation.pipeSize && annotation.pipeSize !== "not-sure" ? annotation.pipeSize : "";
  const serviceName = annotation.service ? SERVICE_NAMES[annotation.service] : "";
  const ground = SOIL_LABELS[soilType] ?? "";

  if (feet === 0 && existing.length === 0 && markerNames.length === 0 && noteCount === 0) {
    return null;
  }

  return (
    <div className="bg-muted border border-border rounded-lg p-4 text-sm space-y-1.5">
      <p className="font-semibold">What you&apos;ve marked</p>
      {feet > 0 && (
        <p className="flex items-center gap-2">
          <Dot color={serviceColor(annotation.service)} />
          <span>
            New {serviceName ? `${serviceName.toLowerCase()} ` : ""}line — about{" "}
            <span className="font-semibold text-foreground">{feet} ft</span>
            {pipe ? `, ${pipe} pipe` : ""}
          </span>
        </p>
      )}
      {existing.map((p, i) => {
        const svc = existingServiceFromPathType(p.type);
        return (
          <p key={i} className="flex items-center gap-2">
            <Dot color={SERVICE_COLORS[svc] ?? "#EAB308"} />
            <span>{svc ? SERVICE_NAMES[svc] : "Utility"} line already in the ground</span>
          </p>
        );
      })}
      {markerNames.length > 0 && (
        <p className="text-muted-foreground">Marked: {markerNames.join(", ")}</p>
      )}
      {noteCount > 0 && (
        <p className="text-muted-foreground">
          {noteCount} note{noteCount === 1 ? "" : "s"} on the map
        </p>
      )}
      {ground && <p className="text-muted-foreground">Ground: {ground}</p>}
      <p className="text-xs text-muted-foreground pt-1">
        This all comes through with your request, so we can quote it right the first time.
      </p>
    </div>
  );
}
