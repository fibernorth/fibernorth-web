"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Map as MapIcon } from "lucide-react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

// Read-only Leaflet viewer for a customer's stored map annotation. Renders
// both v2 (Leaflet quote tool: labels/runFeet/etc.) and legacy (Google tool:
// just markers/paths/polygons) annotations. Leaflet touches `window`, so the
// library is imported only inside useEffect and the map mounts only when the
// section is expanded — which also avoids loading satellite tiles for every
// quote in the list at once.

const ESRI_IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const MARKER_STYLES: Record<string, { color: string; label: string }> = {
  well: { color: "#60A5FA", label: "Well" },
  "septic-tank": { color: "#9CA3AF", label: "Septic Tank" },
  "septic-field": { color: "#6B7280", label: "Drain Field" },
  "utility-line": { color: "#FBBF24", label: "Existing Line" },
  "tree-obstacle": { color: "#4ADE80", label: "Tree/Obstacle" },
};

const PATH_STYLES: Record<string, { color: string; dashArray?: string }> = {
  "bore-path": { color: "#E8672A" },
  "existing-line": { color: "#FBBF24", dashArray: "6 6" },
};

interface LatLng {
  lat: number;
  lng: number;
}

interface ParsedAnnotation {
  center: LatLng | null;
  zoom: number;
  markers: Array<{ type: string; position: LatLng; label: string }>;
  paths: Array<{ type: string; points: LatLng[] }>;
  polygons: Array<{ points: LatLng[] }>;
  labels: Array<{ position: LatLng; text: string }>;
  runFeet: number | null;
}

function isLatLng(value: unknown): value is LatLng {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.lat === "number" &&
    Number.isFinite(v.lat) &&
    Math.abs(v.lat) <= 90 &&
    typeof v.lng === "number" &&
    Number.isFinite(v.lng) &&
    Math.abs(v.lng) <= 180
  );
}

/**
 * Defensively parse an untrusted mapAnnotation value from Firestore into a
 * shape safe to render. Returns null when there is nothing to show.
 */
function parseAnnotation(value: unknown): ParsedAnnotation | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;

  const markers = (Array.isArray(v.markers) ? v.markers.slice(0, 50) : []).flatMap(
    (m: unknown) => {
      if (typeof m !== "object" || m === null) return [];
      const mk = m as Record<string, unknown>;
      if (typeof mk.type !== "string" || !isLatLng(mk.position)) return [];
      return [
        {
          type: mk.type,
          position: mk.position,
          label: typeof mk.label === "string" ? mk.label.slice(0, 200) : "",
        },
      ];
    }
  );

  const paths = (Array.isArray(v.paths) ? v.paths.slice(0, 20) : []).flatMap((p: unknown) => {
    if (typeof p !== "object" || p === null) return [];
    const pa = p as Record<string, unknown>;
    if (typeof pa.type !== "string" || !Array.isArray(pa.points)) return [];
    const points = pa.points.slice(0, 200).filter(isLatLng);
    if (points.length < 2) return [];
    return [{ type: pa.type, points }];
  });

  const polygons = (Array.isArray(v.polygons) ? v.polygons.slice(0, 20) : []).flatMap(
    (p: unknown) => {
      if (typeof p !== "object" || p === null) return [];
      const pa = p as Record<string, unknown>;
      if (!Array.isArray(pa.points)) return [];
      const points = pa.points.slice(0, 200).filter(isLatLng);
      if (points.length < 3) return [];
      return [{ points }];
    }
  );

  const labels = (Array.isArray(v.labels) ? v.labels.slice(0, 30) : []).flatMap((l: unknown) => {
    if (typeof l !== "object" || l === null) return [];
    const lb = l as Record<string, unknown>;
    if (!isLatLng(lb.position) || typeof lb.text !== "string" || !lb.text.trim()) return [];
    return [{ position: lb.position, text: lb.text.slice(0, 200) }];
  });

  if (markers.length === 0 && paths.length === 0 && polygons.length === 0 && labels.length === 0) {
    return null;
  }

  return {
    center: isLatLng(v.center) ? v.center : null,
    zoom:
      typeof v.zoom === "number" && Number.isFinite(v.zoom)
        ? Math.min(Math.max(v.zoom, 2), 21)
        : 18,
    markers,
    paths,
    polygons,
    labels,
    runFeet:
      typeof v.runFeet === "number" && Number.isFinite(v.runFeet) && v.runFeet > 0
        ? Math.round(v.runFeet)
        : null,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function markerTypeLabel(type: string): string {
  return MARKER_STYLES[type]?.label ?? type.replace(/-/g, " ");
}

interface QuoteMapViewerProps {
  annotation: unknown;
}

export function QuoteMapViewer({ annotation }: QuoteMapViewerProps) {
  const parsed = useMemo(() => parseAnnotation(annotation), [annotation]);
  const [open, setOpen] = useState(false);
  if (!parsed) return null;

  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
      >
        <MapIcon className="h-4 w-4 text-primary" />
        <span className="font-medium">Property map</span>
        {parsed.runFeet !== null && (
          <span className="text-xs text-muted-foreground">~{parsed.runFeet} ft drawn</span>
        )}
        <Chevron className="ml-auto h-4 w-4 text-muted-foreground shrink-0" />
      </button>
      {open && <QuoteMapCanvas parsed={parsed} />}
    </div>
  );
}

function QuoteMapCanvas({ parsed }: { parsed: ParsedAnnotation }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;

    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !containerRef.current) return;

        map = L.map(containerRef.current, {
          scrollWheelZoom: false,
          zoomControl: true,
        });

        L.tileLayer(ESRI_IMAGERY_URL, {
          attribution: "Imagery &copy; Esri",
          maxZoom: 21,
          maxNativeZoom: 19,
        }).addTo(map);

        const boundsPoints: LatLng[] = [];

        for (const polygon of parsed.polygons) {
          L.polygon(polygon.points, {
            color: "#6B7280",
            weight: 2,
            fillColor: "#6B7280",
            fillOpacity: 0.25,
            interactive: false,
          }).addTo(map);
          boundsPoints.push(...polygon.points);
        }

        for (const path of parsed.paths) {
          const style = PATH_STYLES[path.type] ?? PATH_STYLES["bore-path"];
          L.polyline(path.points, {
            color: style.color,
            weight: 4,
            opacity: 0.9,
            dashArray: style.dashArray,
            interactive: false,
          }).addTo(map);
          boundsPoints.push(...path.points);
        }

        for (const marker of parsed.markers) {
          const style = MARKER_STYLES[marker.type] ?? { color: "#E8672A" };
          const typeLabel = markerTypeLabel(marker.type);
          const html =
            `<div style="display:flex;flex-direction:column;align-items:center;width:max-content;transform:translateX(-50%)">` +
            `<span style="width:14px;height:14px;border-radius:9999px;background:${style.color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.6)"></span>` +
            `<span style="margin-top:2px;padding:1px 5px;border-radius:4px;background:rgba(12,16,23,.8);color:#fff;font-size:10px;line-height:1.4;white-space:nowrap">${escapeHtml(typeLabel)}</span>` +
            `</div>`;
          L.marker(marker.position, {
            icon: L.divIcon({ className: "", html, iconSize: [0, 0], iconAnchor: [0, 7] }),
            interactive: false,
            keyboard: false,
          }).addTo(map);
          boundsPoints.push(marker.position);
        }

        for (const label of parsed.labels) {
          const html =
            `<div style="transform:translate(-50%,-50%);width:max-content;max-width:180px;padding:2px 6px;border-radius:4px;` +
            `background:rgba(12,16,23,.85);color:#fff;font-size:11px;line-height:1.4;white-space:normal">${escapeHtml(label.text)}</div>`;
          L.marker(label.position, {
            icon: L.divIcon({ className: "", html, iconSize: [0, 0] }),
            interactive: false,
            keyboard: false,
          }).addTo(map);
          boundsPoints.push(label.position);
        }

        if (boundsPoints.length > 1) {
          map.fitBounds(L.latLngBounds(boundsPoints).pad(0.25), { maxZoom: 19 });
        } else if (boundsPoints.length === 1) {
          map.setView(boundsPoints[0], Math.min(parsed.zoom, 19));
        } else if (parsed.center) {
          map.setView(parsed.center, Math.min(parsed.zoom, 19));
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
      map = null;
    };
  }, [parsed]);

  if (failed) {
    return (
      <p className="text-xs text-muted-foreground italic px-3 py-2 border-t border-border">
        Customer map annotation could not be displayed.
      </p>
    );
  }

  return (
    <div className="relative border-t border-border">
      <div ref={containerRef} className="w-full h-[350px] bg-muted" />
      {parsed.runFeet !== null && (
        <div className="absolute bottom-3 left-3 z-[1000] px-2.5 py-1 rounded-md bg-background/85 backdrop-blur border border-border text-xs font-medium pointer-events-none">
          <span className="text-primary">~{parsed.runFeet} ft</span>
          <span className="text-muted-foreground"> total bore path</span>
        </div>
      )}
    </div>
  );
}
