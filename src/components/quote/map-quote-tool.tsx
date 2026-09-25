"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  Map as LeafletMap,
  LayerGroup,
  Marker as LeafletMarker,
  Polyline as LeafletPolyline,
  LatLng,
} from "leaflet";
import type { MapAnnotation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TerrainProfile, type TerrainData } from "./terrain-profile";
import {
  BRAND_ORANGE,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  EXISTING_OPTIONS,
  IMAGERY_FALLBACK_URL,
  IMAGERY_URL,
  MARKER_TYPES,
  PIPE_OPTIONS,
  SERVICE_COLORS,
  SERVICE_NAMES,
  SERVICE_OPTIONS,
  escapeHtml,
  existingServiceFromPathType,
  formatFeet,
  haversineFeet,
  midpoint,
  newLineLabel,
  pathFeet,
  serviceColor,
  type LatLngLit,
  type ObstacleType,
} from "./map-v2/helpers";

type LeafletModule = typeof import("leaflet");

type Mode = "pan" | "draw" | "existing" | "marker" | "note";

interface ObstacleMarker {
  id: number;
  type: ObstacleType;
  position: LatLngLit;
}

interface ExistingLine {
  id: number;
  service: string;
  points: LatLngLit[];
}

interface NoteLabel {
  id: number;
  position: LatLngLit;
  text: string;
}

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

// Small inline SVG icons (no emoji, no icon-font surprises inside Leaflet).
function IconHand() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  );
}
function IconLine() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="5" cy="19" r="2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="5" r="2" fill="currentColor" stroke="none" />
      <path d="M6.5 17.5 17.5 6.5" />
    </svg>
  );
}
function IconPin() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function IconNote() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function IconCrosshair() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  );
}
function IconUndo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

// HTML builders for Leaflet divIcons.
function segmentLabelHtml(feet: number): string {
  return `<span style="color:#fff;font-size:11px;font-weight:700;white-space:nowrap;text-shadow:0 0 3px #000,0 0 3px #000,0 1px 2px #000;">${formatFeet(feet)}</span>`;
}

function pathPointHtml(): string {
  return `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${BRAND_ORANGE};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.6);"></span>`;
}

function obstacleHtml(color: string, label: string): string {
  return (
    `<span style="display:flex;flex-direction:column;align-items:center;gap:2px;">` +
    `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.6);"></span>` +
    `<span style="color:#fff;font-size:10px;font-weight:700;white-space:nowrap;text-shadow:0 0 3px #000,0 0 3px #000,0 1px 2px #000;">${escapeHtml(label)}</span>` +
    `</span>`
  );
}

function noteHtml(text: string): string {
  return `<span style="display:inline-block;max-width:180px;background:rgba(12,16,23,.85);color:#fff;font-size:11px;font-weight:600;line-height:1.3;padding:3px 7px;border-radius:6px;border:1px solid rgba(232,103,42,.7);box-shadow:0 1px 3px rgba(0,0,0,.5);">${escapeHtml(text)}</span>`;
}

const HELPER_TEXT: Record<Mode, string> = {
  pan: "Drag to move the map. Pinch or scroll to zoom.",
  draw: "Tap along the route you want the new line to take. Drag a point to move it, tap a point to delete it.",
  existing:
    "Pick what's already buried, then tap along where it runs. Tap a line to remove it.",
  marker: "Tap the map to drop a pin. Drag it to adjust, tap it to remove.",
  note: "Tap the map where you want to leave a note.",
};

/** Rotated text that runs along a line segment, centered on its anchor. */
function alongLineLabelHtml(text: string, color: string, angleDeg: number): string {
  return (
    `<div style="width:300px;text-align:center;">` +
    `<span style="display:inline-block;transform:rotate(${angleDeg.toFixed(1)}deg) translateY(-14px);` +
    `color:${color};font-size:12px;font-weight:800;white-space:nowrap;letter-spacing:.02em;` +
    `text-shadow:0 0 3px #000,0 0 3px #000,0 0 4px #000,0 1px 2px #000;">${escapeHtml(text)}</span></div>`
  );
}

const KNOWN_OBSTACLES = new Set(MARKER_TYPES.map((m) => m.type));

// Nominatim viewbox bias toward the service area (Northern Lower Michigan)
// so a bare street address resolves locally instead of to a same-named road
// somewhere else. bounded is left off — it's a preference, not a fence.
const GEOCODE_VIEWBOX = "-86.6,45.8,-84.0,43.9";

// The estimator's wording on the admin workbench. The public quote form
// keeps HELPER_TEXT above.
const ADMIN_HELPER_TEXT: Record<Mode, string> = {
  pan: "Drag to move the map. Scroll or pinch to zoom.",
  draw: "Click along the bore route. Drag a point to move it, click or right-click a point to delete it. Ctrl+Z undoes, Esc finishes the line.",
  existing: "Pick the utility, then click along where it runs. Click a line to remove it. Esc finishes it.",
  marker: "Click the map to drop a pin. Drag it to adjust, click it to remove.",
  note: "Click the map where the note goes.",
};

/** Everything drawn on the map, for the undo stack. */
interface DrawingSnapshot {
  pathPoints: LatLngLit[];
  otherRuns: Array<{ id: number; service: string; points: LatLngLit[] }>;
  existingLines: ExistingLine[];
  existingDraft: LatLngLit[];
  obstacles: ObstacleMarker[];
  notes: NoteLabel[];
  service: string;
  pipeSize: string;
}

const UNDO_LIMIT = 60;

/** True when a key press is going into a text box, not a shortcut. */
function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function MapQuoteTool({
  onAnnotationChange,
  initial,
  geocodeAddress,
  showBoreProfile = false,
  variant = "public",
  onSaveShortcut,
}: {
  onAnnotationChange: (a: MapAnnotation | null) => void;
  /** Seed an existing annotation for editing (admin workbench). Read once on mount. */
  initial?: MapAnnotation | null;
  /**
   * Address already known from the surrounding form/quote. Geocoded once
   * (debounced) to auto-center the map — skipped when a saved annotation
   * provides a position or the user has started drawing.
   */
  geocodeAddress?: string;
  /** Show the drill picker + bore path overlay on the terrain profile (admin). */
  showBoreProfile?: boolean;
  /**
   * "admin" is the estimator's workbench: starts in drawing mode on an empty
   * quote, puts the utility and pipe-size choices above the map, uses
   * estimator wording, and adds undo, confirm-before-delete and shortcuts.
   * "public" is the customer quote form and stays as it was.
   */
  variant?: "public" | "admin";
  /** Admin: Ctrl+S (when not typing in a box) saves the quote. */
  onSaveShortcut?: () => void;
}) {
  // Captured once — the prop is a mount-time seed, not a controlled value.
  const initialRef = useRef(initial);
  const admin = variant === "admin";
  const helperText = admin ? ADMIN_HELPER_TEXT : HELPER_TEXT;

  // ---- state ----
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [tileError, setTileError] = useState(false);
  // The estimator opens an empty quote to draw on it: skip the extra click.
  const [mode, setMode] = useState<Mode>(() =>
    admin && !(initialRef.current?.paths ?? []).some((p) => !p.type.startsWith("existing") && p.points.length > 0)
      ? "draw"
      : "pan"
  );
  // Two-step delete buttons: which one is waiting for "yes".
  const [confirming, setConfirming] = useState<"" | "line" | "existing">("");
  const [markerType, setMarkerType] = useState<ObstacleType>("well");
  const [pathPoints, setPathPoints] = useState<LatLngLit[]>(() => {
    const paths = initialRef.current?.paths ?? [];
    const bore = paths.find((p) => !p.type.startsWith("existing")) ?? null;
    return bore?.points ?? [];
  });
  // Finished new lines (the one being drawn lives in pathPoints/service).
  // Each run has its own utility type so one quote can carry water, power
  // and fiber runs together.
  const [otherRuns, setOtherRuns] = useState<Array<{ id: number; service: string; points: LatLngLit[] }>>(() => {
    const bores = (initialRef.current?.paths ?? []).filter((p) => !p.type.startsWith("existing"));
    const colorToService = (c: string) =>
      Object.keys(SERVICE_COLORS).find((k) => SERVICE_COLORS[k].toLowerCase() === (c || "").toLowerCase()) ?? "";
    return bores.slice(1).filter((p) => p.points.length >= 2).map((p, i) => ({
      id: 800 + i,
      service: (p as { service?: string }).service || colorToService(p.color),
      points: p.points,
    }));
  });
  const [existingLines, setExistingLines] = useState<ExistingLine[]>(() =>
    (initialRef.current?.paths ?? [])
      .filter((p) => p.type.startsWith("existing") && p.points.length >= 2)
      .map((p, i) => ({
        id: 500 + i,
        service: existingServiceFromPathType(p.type) || "power",
        points: p.points,
      }))
  );
  const [existingService, setExistingService] = useState("power");
  const [existingDraft, setExistingDraft] = useState<LatLngLit[]>([]);
  const [obstacles, setObstacles] = useState<ObstacleMarker[]>(() =>
    (initialRef.current?.markers ?? []).map((m, i) => ({
      id: i + 1,
      type: KNOWN_OBSTACLES.has(m.type as ObstacleType)
        ? (m.type as ObstacleType)
        : "utility-line",
      position: m.position,
    }))
  );
  const [notes, setNotes] = useState<NoteLabel[]>(() =>
    (initialRef.current?.labels ?? []).map((l, i) => ({
      id: 1000 + i,
      position: l.position,
      text: l.text,
    }))
  );
  const [service, setService] = useState(initialRef.current?.service ?? "");
  const [pipeSize, setPipeSize] = useState(initialRef.current?.pipeSize ?? "not-sure");
  const [address, setAddress] = useState(initialRef.current?.address ?? "");
  const [liveFeet, setLiveFeet] = useState<number | null>(null);
  const [terrain, setTerrain] = useState<TerrainData | null>(
    initialRef.current?.terrain ?? null
  );

  // Address search
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [showResults, setShowResults] = useState(false);
  const skipSearchRef = useRef(false);

  // Geolocation
  const [geoError, setGeoError] = useState("");
  const [locating, setLocating] = useState(false);

  // Inline note input
  const [pendingNote, setPendingNote] = useState<{
    x: number;
    y: number;
    lat: number;
    lng: number;
  } | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  // ---- refs ----
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const overlayRef = useRef<LayerGroup | null>(null);
  const polylineRef = useRef<LeafletPolyline | null>(null);
  const segLabelsRef = useRef<LeafletMarker[]>([]);
  const idRef = useRef(2000); // seeded ids stay below this
  const clickRef = useRef<(latlng: LatLng) => void>(() => {});
  const pendingNoteRef = useRef(pendingNote);
  pendingNoteRef.current = pendingNote;
  const onChangeRef = useRef(onAnnotationChange);
  onChangeRef.current = onAnnotationChange;

  const nextId = () => idRef.current++;
  const pathPointsRef = useRef(pathPoints);
  pathPointsRef.current = pathPoints;
  const serviceRef = useRef(service);
  serviceRef.current = service;

  // ---- undo stack ----
  // Every change to the drawing pushes the state before it, so Undo (and
  // Ctrl+Z) can bring back anything: a point, a pin, or a whole deleted line.
  const lastSnapRef = useRef<DrawingSnapshot | null>(null);
  const historyRef = useRef<DrawingSnapshot[]>([]);
  const restoringRef = useRef(false);
  const [undoCount, setUndoCount] = useState(0);
  useEffect(() => {
    const prev = lastSnapRef.current;
    lastSnapRef.current = { pathPoints, otherRuns, existingLines, existingDraft, obstacles, notes, service, pipeSize };
    if (!prev) return; // first render: nothing to undo yet
    const next = lastSnapRef.current;
    const same = (Object.keys(next) as Array<keyof DrawingSnapshot>).every((k) => next[k] === prev[k]);
    if (same) return;
    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }
    historyRef.current = [...historyRef.current, prev].slice(-UNDO_LIMIT);
    setUndoCount(historyRef.current.length);
  }, [pathPoints, otherRuns, existingLines, existingDraft, obstacles, notes, service, pipeSize]);

  const undo = useCallback(() => {
    const prev = historyRef.current[historyRef.current.length - 1];
    if (!prev) return;
    historyRef.current = historyRef.current.slice(0, -1);
    setUndoCount(historyRef.current.length);
    restoringRef.current = true;
    mapRef.current?.closePopup();
    setPathPoints(prev.pathPoints);
    setOtherRuns(prev.otherRuns);
    setExistingLines(prev.existingLines);
    setExistingDraft(prev.existingDraft);
    setObstacles(prev.obstacles);
    setNotes(prev.notes);
    setService(prev.service);
    setPipeSize(prev.pipeSize);
  }, []);

  // ---- map click dispatch (kept fresh every render) ----
  clickRef.current = (latlng: LatLng) => {
    if (pendingNoteRef.current) {
      // A tap while the note input is open just closes it.
      setPendingNote(null);
      setNoteDraft("");
      return;
    }
    const pos = { lat: latlng.lat, lng: latlng.lng };
    if (mode === "draw") {
      setPathPoints((prev) => [...prev, pos]);
    } else if (mode === "existing") {
      setExistingDraft((prev) => (prev.length >= 200 ? prev : [...prev, pos]));
    } else if (mode === "marker") {
      setObstacles((prev) => [...prev, { id: nextId(), type: markerType, position: pos }]);
    } else if (mode === "note") {
      const map = mapRef.current;
      if (!map) return;
      const pt = map.latLngToContainerPoint(latlng);
      setNoteDraft("");
      setPendingNote({ x: pt.x, y: pt.y, lat: pos.lat, lng: pos.lng });
    }
  };

  // ---- map init (client only, dynamic import) ----
  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    let sizeWatch: ResizeObserver | null = null;
    (async () => {
      try {
        const mod = (await import("leaflet")) as unknown as
          | LeafletModule
          | { default: LeafletModule };
        const L: LeafletModule =
          (mod as { default?: LeafletModule }).default ?? (mod as LeafletModule);
        if (cancelled || !containerRef.current || mapRef.current) return;
        leafletRef.current = L;

        const seed = initialRef.current;
        map = L.map(containerRef.current, {
          center: seed?.center
            ? [seed.center.lat, seed.center.lng]
            : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
          zoom: seed?.zoom ?? DEFAULT_ZOOM,
        });
        mapRef.current = map;

        // Leaflet measures the box once, when the map is made. The chunk can
        // land before the box has its height, and a 0 px tall map draws one
        // tile at the top and grey everywhere else until something nudges it.
        // Measure again once layout settles, and whenever the box changes.
        const remeasure = () => {
          if (map && mapRef.current === map) map.invalidateSize();
        };
        sizeWatch = new ResizeObserver(remeasure);
        sizeWatch.observe(containerRef.current);

        // When editing an existing drawing, frame the drawn line rather than
        // trusting the saved viewport — after the box is measured, or the
        // zoom is worked out for a map with no size.
        const seedPts = seed?.paths?.[0]?.points ?? [];
        requestAnimationFrame(() => {
          if (!map || mapRef.current !== map) return;
          map.invalidateSize();
          if (seedPts.length >= 2) {
            map.fitBounds(
              L.latLngBounds(seedPts.map((p) => [p.lat, p.lng] as [number, number])),
              { padding: [60, 60], maxZoom: 19 }
            );
          }
        });

        const tiles = L.tileLayer(IMAGERY_URL, {
          attribution: "Imagery &copy; Esri",
          maxZoom: 20,
          maxNativeZoom: 19,
        });
        let usingFallback = false;
        tiles.on("tileerror", () => {
          if (!usingFallback) {
            usingFallback = true;
            tiles.setUrl(IMAGERY_FALLBACK_URL);
          } else {
            setTileError(true);
          }
        });
        tiles.on("tileload", () => setTileError(false));
        tiles.addTo(map);

        overlayRef.current = L.layerGroup().addTo(map);

        map.on("click", (e) => clickRef.current(e.latlng));
        // Panning under an open note input would leave it floating in the
        // wrong spot — just close it.
        map.on("movestart", () => {
          if (pendingNoteRef.current) {
            setPendingNote(null);
            setNoteDraft("");
          }
        });

        setReady(true);
      } catch (err) {
        console.error("Map failed to load:", err);
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
      sizeWatch?.disconnect();
      if (map) {
        map.remove();
      }
      mapRef.current = null;
      overlayRef.current = null;
      polylineRef.current = null;
      segLabelsRef.current = [];
    };
  }, []);

  // ---- redraw overlays whenever drawn data changes ----
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!ready || !L || !map || !overlay) return;

    overlay.clearLayers();
    polylineRef.current = null;
    segLabelsRef.current = [];

    const divIcon = (html: string, size: [number, number], anchor: [number, number]) =>
      L.divIcon({ className: "", html, iconSize: size, iconAnchor: anchor });

    // --- existing utility lines (solid, APWA colors) ---
    const drawExisting = (points: LatLngLit[], service: string, removeId: number | null) => {
      if (points.length < 2) return;
      const latlngs = points.map((p) => [p.lat, p.lng] as [number, number]);
      const color = SERVICE_COLORS[service] ?? "#EAB308";
      L.polyline(latlngs, {
        color: "#0C1017",
        weight: 7,
        opacity: 0.7,
        interactive: false,
      }).addTo(overlay);
      const line = L.polyline(latlngs, { color, weight: 4, opacity: 0.95 }).addTo(overlay);

      // Small name tag at the line's midpoint.
      const midIdx = Math.floor((points.length - 1) / 2);
      const mid = midpoint(points[midIdx], points[Math.min(midIdx + 1, points.length - 1)]);
      L.marker([mid.lat, mid.lng], {
        icon: divIcon(
          `<span style="color:${color};font-size:10px;font-weight:700;white-space:nowrap;text-shadow:0 0 3px #000,0 0 3px #000,0 1px 2px #000;">${escapeHtml(SERVICE_NAMES[service] ?? service)} (existing)</span>`,
          [90, 14],
          [45, 18]
        ),
        interactive: false,
        keyboard: false,
      }).addTo(overlay);

      if (removeId !== null) {
        const popup = document.createElement("div");
        popup.style.cssText = "font-size:13px;color:#111;";
        const title = document.createElement("div");
        title.textContent = `Existing ${SERVICE_NAMES[service] ?? service} line`;
        title.style.cssText = "font-weight:700;margin-bottom:4px;";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "× Remove line";
        remove.style.cssText =
          "border:1px solid #d1d5db;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;background:#fff;color:#b91c1c;";
        remove.addEventListener("click", () => {
          setExistingLines((prev) => prev.filter((x) => x.id !== removeId));
        });
        popup.append(title, remove);
        line.bindPopup(popup, { closeButton: true });
      }
    };
    existingLines.forEach((l) => drawExisting(l.points, l.service, l.id));
    drawExisting(existingDraft, existingService, null);
    // Draft in progress: show tap points so a single tap is visible feedback.
    existingDraft.forEach((p) => {
      L.marker([p.lat, p.lng], {
        icon: divIcon(
          `<span style="display:block;width:12px;height:12px;border-radius:9999px;background:${SERVICE_COLORS[existingService] ?? "#EAB308"};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.6);"></span>`,
          [12, 12],
          [6, 6]
        ),
        interactive: false,
        keyboard: false,
      }).addTo(overlay);
    });

    // --- other finished new lines: dashed in their own colors; tap to edit or delete ---
    otherRuns.forEach((r) => {
      if (r.points.length < 2) return;
      const color = serviceColor(r.service);
      const latlngs = r.points.map((p) => [p.lat, p.lng] as [number, number]);
      L.polyline(latlngs, { color: "#0C1017", weight: 8, opacity: 0.6, dashArray: "12 10", interactive: false }).addTo(overlay);
      const line = L.polyline(latlngs, {
        color,
        weight: 5,
        opacity: 0.9,
        dashArray: "12 10",
        bubblingMouseEvents: false,
      }).addTo(overlay);
      const feet = pathFeet(r.points).total;
      const midIdx = Math.floor((r.points.length - 1) / 2);
      const mid = midpoint(r.points[midIdx], r.points[midIdx + 1]);
      L.marker([mid.lat, mid.lng], {
        icon: divIcon(segmentLabelHtml(feet), [80, 16], [40, 8]),
        interactive: false,
        keyboard: false,
      }).addTo(overlay);
      const box = document.createElement("div");
      box.style.cssText = "font-size:13px;color:#111;";
      const title = document.createElement("div");
      title.textContent = `${newLineLabel(r.service)} (${Math.round(feet)} ft)`;
      title.style.cssText = "font-weight:700;margin-bottom:6px;";
      const btn = (text: string, color: string) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.style.cssText = `border:1px solid #d1d5db;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;background:#fff;color:${color};margin-right:6px;`;
        return b;
      };
      const edit = btn("Edit this line", "#111");
      edit.addEventListener("click", () => {
        map.closePopup();
        // Park the line being drawn, pick this one up.
        setOtherRuns((prev) => {
          const rest = prev.filter((x) => x.id !== r.id);
          return pathPointsRef.current.length >= 2
            ? [...rest, { id: nextId(), service: serviceRef.current, points: pathPointsRef.current }]
            : rest;
        });
        setPathPoints(r.points);
        setService(r.service);
        setMode("draw");
      });
      const del = btn("× Delete this line", "#b91c1c");
      del.addEventListener("click", () => {
        map.closePopup();
        setOtherRuns((prev) => prev.filter((x) => x.id !== r.id));
      });
      box.append(title, edit, del);
      line.bindPopup(box, { closeButton: true });
    });

    // --- new (bore) line: dashed, colored by the chosen service ---
    const newColor = serviceColor(service);
    if (pathPoints.length >= 2) {
      const latlngs = pathPoints.map((p) => [p.lat, p.lng] as [number, number]);
      L.polyline(latlngs, {
        color: "#0C1017",
        weight: 8,
        opacity: 0.7,
        dashArray: "12 10",
        interactive: false,
      }).addTo(overlay);
      polylineRef.current = L.polyline(latlngs, {
        color: newColor,
        weight: 5,
        opacity: 0.95,
        dashArray: "12 10",
        bubblingMouseEvents: false,
      }).addTo(overlay);
      {
        const box = document.createElement("div");
        box.style.cssText = "font-size:13px;color:#111;";
        const title = document.createElement("div");
        title.textContent = "New line";
        title.style.cssText = "font-weight:700;margin-bottom:6px;";
        const del = document.createElement("button");
        del.type = "button";
        del.textContent = "× Delete this line";
        del.style.cssText =
          "border:1px solid #d1d5db;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;background:#fff;color:#b91c1c;";
        del.addEventListener("click", () => {
          map.closePopup();
          setPathPoints([]);
        });
        box.append(title, del);
        polylineRef.current.bindPopup(box, { closeButton: true });
      }

      // "New Power to be installed here" running along the longest segment.
      let longest = 0;
      for (let i = 1; i < pathPoints.length; i++) {
        if (
          haversineFeet(pathPoints[i - 1], pathPoints[i]) >
          haversineFeet(pathPoints[longest], pathPoints[longest + 1])
        ) {
          longest = i - 1;
        }
      }
      const a = pathPoints[longest];
      const b = pathPoints[longest + 1];
      const pa = map.latLngToContainerPoint([a.lat, a.lng]);
      const pb = map.latLngToContainerPoint([b.lat, b.lng]);
      let angle = (Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      const mid = midpoint(a, b);
      L.marker([mid.lat, mid.lng], {
        icon: divIcon(
          alongLineLabelHtml(newLineLabel(service), newColor, angle),
          [300, 20],
          [150, 10]
        ),
        interactive: false,
        keyboard: false,
      }).addTo(overlay);
    }

    // --- segment footage labels ---
    const { segments } = pathFeet(pathPoints);
    segments.forEach((feet, i) => {
      const mid = midpoint(pathPoints[i], pathPoints[i + 1]);
      const label = L.marker([mid.lat, mid.lng], {
        icon: divIcon(segmentLabelHtml(feet), [80, 16], [40, 8]),
        interactive: false,
        keyboard: false,
      }).addTo(overlay);
      segLabelsRef.current.push(label);
    });

    // --- draggable path point handles ---
    pathPoints.forEach((p, i) => {
      const handle = L.marker([p.lat, p.lng], {
        icon: divIcon(pathPointHtml(), [16, 16], [8, 8]),
        draggable: true,
        keyboard: false,
      }).addTo(overlay);
      handle.on("drag", () => {
        // Live measurement updates without rebuilding layers mid-drag.
        const ll = handle.getLatLng();
        const pts = pathPoints.map((pt, j) => (j === i ? { lat: ll.lat, lng: ll.lng } : pt));
        polylineRef.current?.setLatLngs(pts.map((pt) => [pt.lat, pt.lng]));
        let total = 0;
        for (let s = 0; s < pts.length - 1; s++) {
          const feet = haversineFeet(pts[s], pts[s + 1]);
          total += feet;
          const lbl = segLabelsRef.current[s];
          if (lbl && (s === i - 1 || s === i)) {
            const mid = midpoint(pts[s], pts[s + 1]);
            lbl.setLatLng([mid.lat, mid.lng]);
            lbl.setIcon(divIcon(segmentLabelHtml(feet), [80, 16], [40, 8]));
          }
        }
        setLiveFeet(total);
      });
      handle.on("dragend", () => {
        const ll = handle.getLatLng();
        setLiveFeet(null);
        setPathPoints((prev) =>
          prev.map((pt, j) => (j === i ? { lat: ll.lat, lng: ll.lng } : pt))
        );
      });
      // Tap a point to delete it (a drag doesn't count as a tap).
      const box = document.createElement("div");
      box.style.cssText = "font-size:13px;color:#111;";
      const title = document.createElement("div");
      title.textContent = `Point ${i + 1} of ${pathPoints.length}`;
      title.style.cssText = "font-weight:700;margin-bottom:6px;";
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "× Delete point";
      del.style.cssText =
        "border:1px solid #d1d5db;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;background:#fff;color:#b91c1c;";
      del.addEventListener("click", () => {
        map.closePopup();
        setPathPoints((prev) => prev.filter((_, j) => j !== i));
      });
      box.append(title, del);
      handle.bindPopup(box, { closeButton: true, offset: [0, -4] });
      // Desktop shortcut: right-click a point to delete it right away.
      handle.on("contextmenu", () => {
        setPathPoints((prev) => prev.filter((_, j) => j !== i));
      });
    });

    // --- obstacle markers ---
    obstacles.forEach((o) => {
      const cfg = MARKER_TYPES.find((m) => m.type === o.type) ?? MARKER_TYPES[0];
      const marker = L.marker([o.position.lat, o.position.lng], {
        icon: divIcon(obstacleHtml(cfg.color, cfg.label), [60, 32], [30, 7]),
        draggable: true,
        keyboard: false,
      }).addTo(overlay);

      const popup = document.createElement("div");
      popup.style.cssText = "font-size:13px;color:#111;";
      const title = document.createElement("div");
      title.textContent = cfg.label;
      title.style.cssText = "font-weight:700;margin-bottom:4px;";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "× Remove";
      remove.style.cssText =
        "border:1px solid #d1d5db;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;background:#fff;color:#b91c1c;";
      remove.addEventListener("click", () => {
        setObstacles((prev) => prev.filter((m) => m.id !== o.id));
      });
      popup.append(title, remove);
      marker.bindPopup(popup, { closeButton: true });

      marker.on("dragend", () => {
        const ll = marker.getLatLng();
        setObstacles((prev) =>
          prev.map((m) => (m.id === o.id ? { ...m, position: { lat: ll.lat, lng: ll.lng } } : m))
        );
      });
    });

    // --- note labels ---
    notes.forEach((n) => {
      const marker = L.marker([n.position.lat, n.position.lng], {
        icon: divIcon(noteHtml(n.text), [180, 24], [10, 12]),
        draggable: true,
        keyboard: false,
      }).addTo(overlay);

      const popup = document.createElement("div");
      popup.style.cssText = "font-size:13px;color:#111;max-width:200px;";
      const body = document.createElement("div");
      body.textContent = n.text;
      body.style.cssText = "margin-bottom:4px;";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "× Delete note";
      remove.style.cssText =
        "border:1px solid #d1d5db;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;background:#fff;color:#b91c1c;";
      remove.addEventListener("click", () => {
        setNotes((prev) => prev.filter((x) => x.id !== n.id));
      });
      popup.append(body, remove);
      marker.bindPopup(popup, { closeButton: true });

      marker.on("dragend", () => {
        const ll = marker.getLatLng();
        setNotes((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, position: { lat: ll.lat, lng: ll.lng } } : x))
        );
      });
    });
  }, [ready, pathPoints, otherRuns, obstacles, notes, service, existingLines, existingDraft, existingService]);

  // ---- emit annotation ----
  useEffect(() => {
    const { segments, total: activeTotal } = pathFeet(pathPoints);
    const total = activeTotal + otherRuns.reduce((sum, r) => sum + pathFeet(r.points).total, 0);
    // An unfinished existing-line draft still counts — nobody should lose a
    // drawn line because they never pressed a "done" button.
    const allExisting: ExistingLine[] =
      existingDraft.length >= 2
        ? [...existingLines, { id: -1, service: existingService, points: existingDraft }]
        : existingLines;
    const empty =
      pathPoints.length === 0 &&
      otherRuns.length === 0 &&
      obstacles.length === 0 &&
      notes.length === 0 &&
      allExisting.length === 0 &&
      !address &&
      !service &&
      pipeSize === "not-sure";

    if (empty) {
      onChangeRef.current(null);
      return;
    }

    const map = mapRef.current;
    const center = map ? map.getCenter() : null;
    const annotation: MapAnnotation = {
      center: center ? { lat: center.lat, lng: center.lng } : DEFAULT_CENTER,
      zoom: map ? map.getZoom() : DEFAULT_ZOOM,
      markers: obstacles.map((o) => ({ type: o.type, position: o.position })),
      paths: [
        ...(pathPoints.length > 0
          ? [{ type: "bore-path" as const, points: pathPoints, color: serviceColor(service), service: service || undefined }]
          : []),
        ...otherRuns
          .filter((r) => r.points.length >= 2)
          .map((r) => ({ type: "bore-path" as const, points: r.points, color: serviceColor(r.service), service: r.service || undefined })),
        ...allExisting.slice(0, 15).map((l) => ({
          type: `existing-${l.service}`,
          points: l.points,
          color: SERVICE_COLORS[l.service] ?? "#EAB308",
        })),
      ],
      polygons: [],
      labels: notes.map((n) => ({ position: n.position, text: n.text })),
      terrain: pathPoints.length >= 2 && terrain ? terrain : null,
      runFeet: Math.round(total),
      segmentFeet: segments.map((s) => Math.round(s)),
      service: service || undefined,
      pipeSize,
      address: address || undefined,
      version: 2,
    };
    onChangeRef.current(annotation);
  }, [pathPoints, otherRuns, obstacles, notes, service, pipeSize, address, existingLines, existingDraft, existingService, terrain]);

  // ---- auto-center on the form's address field ----
  const autoGeoDoneRef = useRef(false);
  const hasDrawingRef = useRef(false);
  hasDrawingRef.current = pathPoints.length > 0 || otherRuns.length > 0 || obstacles.length > 0 || notes.length > 0;
  useEffect(() => {
    if (!ready || autoGeoDoneRef.current) return;
    if (initialRef.current) return; // a saved annotation's position wins
    const q = (geocodeAddress ?? "").trim();
    if (q.length < 5) return;
    const timer = setTimeout(() => {
      fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&viewbox=${GEOCODE_VIEWBOX}&q=${encodeURIComponent(q)}`
      )
        .then((res) => (res.ok ? res.json() : []))
        .then((data: SearchResult[]) => {
          if (autoGeoDoneRef.current || hasDrawingRef.current) return;
          const r = Array.isArray(data) ? data[0] : undefined;
          if (!r) return;
          const lat = parseFloat(r.lat);
          const lng = parseFloat(r.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          autoGeoDoneRef.current = true;
          mapRef.current?.flyTo([lat, lng], 18, { duration: 1.2 });
          setAddress((prev) => prev || r.display_name);
        })
        .catch(() => {}); // silent — the manual search box still works
    }, 1200);
    return () => clearTimeout(timer);
  }, [ready, geocodeAddress]);

  // ---- debounced address search (Nominatim) ----
  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setShowResults(false);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`
      )
        .then((res) => {
          if (!res.ok) throw new Error(`geocode ${res.status}`);
          return res.json();
        })
        .then((data: SearchResult[]) => {
          setSearchError("");
          setResults(Array.isArray(data) ? data : []);
          setShowResults(true);
        })
        .catch(() => {
          setResults([]);
          setShowResults(false);
          setSearchError(
            admin
              ? "Address lookup isn't responding right now. Drag and zoom the map to find the site."
              : "Address lookup isn't responding right now. You can still drag and zoom the map to find your place."
          );
        })
        .finally(() => setSearching(false));
    }, 600);
    return () => clearTimeout(timer);
  }, [query]);

  const pickResult = (r: SearchResult) => {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      mapRef.current?.flyTo([lat, lng], 18, { duration: 1.2 });
      setAddress(r.display_name);
    }
    skipSearchRef.current = true;
    setQuery(r.display_name.split(",").slice(0, 3).join(","));
    setResults([]);
    setShowResults(false);
    setSearchError("");
  };

  const useMyLocation = () => {
    setGeoError("");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError(
        admin
          ? "This browser can't share its location. Search the address instead."
          : "Your browser can't share your location. Search your address instead."
      );
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        mapRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 18, {
          duration: 1.2,
        });
      },
      () => {
        setLocating(false);
        setGeoError(
          admin
            ? "Couldn't get your location. The browser may be blocking it. Search the address instead."
            : "We couldn't get your location — your browser may be blocking it. Search your address instead."
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const saveNote = () => {
    const text = noteDraft.trim();
    if (text && pendingNote) {
      setNotes((prev) => [
        ...prev,
        { id: nextId(), position: { lat: pendingNote.lat, lng: pendingNote.lng }, text },
      ]);
    }
    setPendingNote(null);
    setNoteDraft("");
  };

  // Fold the in-progress existing-line draft into the finished list.
  const finalizeExistingDraft = useCallback(() => {
    setExistingDraft((draft) => {
      if (draft.length >= 2) {
        setExistingLines((prev) =>
          prev.length >= 15
            ? prev
            : [...prev, { id: idRef.current++, service: existingService, points: draft }]
        );
      }
      return [];
    });
  }, [existingService]);

  const setModeAnd = useCallback(
    (m: Mode) => {
      finalizeExistingDraft();
      setMode(m);
      setPendingNote(null);
      setNoteDraft("");
    },
    [finalizeExistingDraft]
  );

  const pickExistingService = (value: string) => {
    finalizeExistingDraft();
    setExistingService(value);
  };

  // ---- admin keyboard shortcuts ----
  // Ctrl+Z undo, Esc finish/cancel, Ctrl+S save. Ignored while typing in a
  // box so Ctrl+Z still undoes typing there.
  const onSaveRef = useRef(onSaveShortcut);
  onSaveRef.current = onSaveShortcut;
  const escRef = useRef<() => void>(() => {});
  escRef.current = () => {
    mapRef.current?.closePopup();
    if (confirming) {
      setConfirming("");
      return;
    }
    if (mode !== "pan") setModeAnd("pan");
  };
  useEffect(() => {
    if (!admin) return;
    const onKey = (e: KeyboardEvent) => {
      if (typingIn(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && key === "s") {
        e.preventDefault();
        onSaveRef.current?.();
      } else if (e.key === "Escape") {
        escRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [admin, undo]);

  const { total: computedTotal } = pathFeet(pathPoints);
  const othersFeet = otherRuns.reduce((sum, r) => sum + pathFeet(r.points).total, 0);
  const totalFeet = (liveFeet ?? computedTotal) + othersFeet;
  const runSummary = [
    ...otherRuns.map((r) => ({ service: r.service, feet: pathFeet(r.points).total })),
    ...(pathPoints.length >= 2 ? [{ service, feet: liveFeet ?? computedTotal }] : []),
  ];
  const startAnotherLine = () => {
    if (pathPoints.length < 2) return;
    setOtherRuns((prev) => [...prev, { id: nextId(), service, points: pathPoints }]);
    setPathPoints([]);
    setMode("draw");
  };

  const lineChoices = (
    <LineChoices
      admin={admin}
      service={service}
      setService={setService}
      pipeSize={pipeSize}
      setPipeSize={setPipeSize}
      drawingAnother={otherRuns.length > 0}
    />
  );

  const modeButtons: Array<{ mode: Mode; label: string; icon: ReactNode }> = [
    { mode: "pan", label: "Move map", icon: <IconHand /> },
    { mode: "draw", label: "Draw new line", icon: <IconLine /> },
    { mode: "existing", label: "Mark existing lines", icon: <IconLine /> },
    { mode: "marker", label: "Mark what's there", icon: <IconPin /> },
    { mode: "note", label: "Note", icon: <IconNote /> },
  ];

  if (loadError) {
    return admin ? (
      <div className="w-full bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">
        The map didn&apos;t load. Reload the page to try again. You can still price the job with the
        lines below, and the saved drawing is not touched.
      </div>
    ) : (
      <div className="w-full bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">
        The map didn&apos;t load on this device. No problem — just describe where the line
        needs to go in the box above, or attach a photo of the yard below.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Find the property */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            <IconSearch />
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
            placeholder={admin ? "Find the job site address..." : "Search your address..."}
            autoComplete="off"
            className={cn(
              "w-full pl-9 pr-3 py-2.5 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary",
              admin && "text-base sm:text-sm"
            )}
            aria-label={admin ? "Find the job site address" : "Search your address"}
          />
          {showResults && results.length > 0 && (
            <ul className="absolute z-[1200] mt-1 w-full bg-card border border-border rounded-md shadow-lg overflow-hidden">
              {results.map((r, i) => (
                <li key={`${r.lat}-${r.lon}-${i}`}>
                  <button
                    type="button"
                    onClick={() => pickResult(r)}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted focus:bg-muted focus:outline-none border-b border-border last:border-b-0"
                  >
                    {r.display_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-muted border border-border rounded-md text-sm font-medium hover:border-primary hover:text-primary transition-colors disabled:opacity-50 shrink-0"
        >
          <IconCrosshair />
          {locating ? "Finding you..." : admin ? "I'm on site" : "Use my location"}
        </button>
      </div>
      {searching && <p className="text-xs text-muted-foreground">Looking that up...</p>}
      {searchError && <p className="text-xs text-muted-foreground">{searchError}</p>}
      {geoError && <p className="text-xs text-muted-foreground">{geoError}</p>}

      {/* The estimator picks the utility and pipe before drawing. */}
      {admin && lineChoices}

      {/* Mode buttons */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
        {modeButtons.map((b) => (
          <button
            key={b.mode}
            type="button"
            onClick={() => setModeAnd(b.mode)}
            aria-pressed={mode === b.mode}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-md text-sm font-medium border transition-colors ${
              mode === b.mode
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted border-border hover:border-primary hover:text-primary"
            }`}
          >
            {b.icon}
            {b.label}
          </button>
        ))}
      </div>

      {/* Existing-utility palette */}
      {mode === "existing" && (
        <>
          <div className="flex flex-wrap gap-2">
            {EXISTING_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => pickExistingService(opt.value)}
                aria-pressed={existingService === opt.value}
                className={`flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-md text-sm border transition-colors ${
                  existingService === opt.value
                    ? "bg-primary/10 border-primary text-primary font-semibold"
                    : "bg-muted border-border hover:border-primary"
                }`}
              >
                <span
                  className="inline-block w-3 h-3 rounded-full border border-white/60 shrink-0"
                  style={{ backgroundColor: SERVICE_COLORS[opt.value] }}
                />
                {opt.label}
              </button>
            ))}
          </div>
          {(existingDraft.length > 0 || existingLines.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {existingDraft.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExistingDraft((prev) => prev.slice(0, -1))}
                  className="flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-md text-sm font-medium bg-muted border border-border hover:border-primary hover:text-primary transition-colors"
                >
                  <IconUndo />
                  Undo last point
                </button>
              )}
              {existingDraft.length >= 2 && (
                <button
                  type="button"
                  onClick={finalizeExistingDraft}
                  className="px-3 py-2 min-h-[44px] rounded-md text-sm font-medium bg-muted border border-border hover:border-primary hover:text-primary transition-colors"
                >
                  Start another line
                </button>
              )}
              {confirming === "existing" ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming("");
                      setExistingDraft([]);
                      setExistingLines([]);
                    }}
                    className="px-3 py-2 min-h-[44px] rounded-md text-sm font-semibold border border-destructive text-destructive bg-destructive/10 transition-colors"
                  >
                    Yes, clear all {existingLines.length + (existingDraft.length >= 2 ? 1 : 0)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming("")}
                    className="px-3 py-2 min-h-[44px] rounded-md text-sm font-medium bg-muted border border-border hover:border-primary transition-colors"
                  >
                    Keep them
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming("existing")}
                  className="px-3 py-2 min-h-[44px] rounded-md text-sm font-medium bg-muted border border-border hover:border-destructive hover:text-destructive transition-colors"
                >
                  Clear existing lines
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Marker palette */}
      {mode === "marker" && (
        <div className="flex flex-wrap gap-2">
          {MARKER_TYPES.map((m) => (
            <button
              key={m.type}
              type="button"
              onClick={() => setMarkerType(m.type)}
              aria-pressed={markerType === m.type}
              className={`flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-md text-sm border transition-colors ${
                markerType === m.type
                  ? "bg-primary/10 border-primary text-primary font-semibold"
                  : "bg-muted border-border hover:border-primary"
              }`}
            >
              <span
                className="inline-block w-3 h-3 rounded-full border border-white/60 shrink-0"
                style={{ backgroundColor: m.color }}
              />
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* Draw controls */}
      {(pathPoints.length > 0 || (admin && undoCount > 0)) && (
        <div className="flex flex-wrap gap-2">
          {admin && (
            <button
              type="button"
              onClick={undo}
              disabled={undoCount === 0}
              title="Ctrl+Z"
              className="flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-md text-sm font-medium bg-muted border border-border hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
            >
              <IconUndo />
              Undo
            </button>
          )}
          {pathPoints.length > 0 && (
            <button
              type="button"
              onClick={() => setPathPoints((prev) => prev.slice(0, -1))}
              className="flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-md text-sm font-medium bg-muted border border-border hover:border-primary hover:text-primary transition-colors"
            >
              {!admin && <IconUndo />}
              {admin ? "Remove last point" : "Undo last point"}
            </button>
          )}
          {pathPoints.length > 0 &&
            (confirming === "line" ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming("");
                    setPathPoints([]);
                  }}
                  className="px-3 py-2 min-h-[44px] rounded-md text-sm font-semibold border border-destructive text-destructive bg-destructive/10 transition-colors"
                >
                  Yes, delete this line
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming("")}
                  className="px-3 py-2 min-h-[44px] rounded-md text-sm font-medium bg-muted border border-border hover:border-primary transition-colors"
                >
                  Keep it
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming("line")}
                className="px-3 py-2 min-h-[44px] rounded-md text-sm font-medium bg-muted border border-border hover:border-destructive hover:text-destructive transition-colors"
              >
                Delete whole line
              </button>
            ))}
          {pathPoints.length >= 2 && (
            <button
              type="button"
              onClick={startAnotherLine}
              className="px-3 py-2 min-h-[44px] rounded-md text-sm font-medium bg-muted border border-border hover:border-primary hover:text-primary transition-colors"
            >
              + Start another new line
            </button>
          )}
        </div>
      )}
      {pathPoints.length === 0 && otherRuns.length > 0 && mode === "draw" && (
        <p className="text-xs text-muted-foreground">
          {admin
            ? "Pick what goes in this line above, then click along its route. Click a finished line to edit or delete it."
            : "Pick what goes in this line below, then tap along its route. Tap a finished line to edit or delete it."}
        </p>
      )}
      {runSummary.length > 1 && (
        <p className="text-xs text-muted-foreground">
          {runSummary.map((r) => `${newLineLabel(r.service)}: ${Math.round(r.feet)} ft`).join(" · ")}
        </p>
      )}

      {/* The map */}
      <div className="relative z-0 rounded-lg overflow-hidden border border-border">
        <div
          ref={containerRef}
          className="w-full h-[380px] sm:h-[450px] bg-muted"
        />
        {!ready && !loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted z-[500]">
            <p className="text-sm text-muted-foreground">Loading map...</p>
          </div>
        )}
        {ready && totalFeet > 0 && (
          <div className="absolute top-2 right-2 z-[1000] bg-background/90 border border-primary rounded-md px-3 py-1.5 pointer-events-none">
            <span className="text-lg font-bold text-primary">{formatFeet(totalFeet)}</span>
            <span className="block text-[10px] text-muted-foreground leading-none">{runSummary.length > 1 ? `${runSummary.length} lines total` : "total run"}</span>
          </div>
        )}
        {pendingNote && (
          <div
            className="absolute z-[1100] flex items-center gap-1"
            style={{
              left: Math.max(pendingNote.x, 110),
              top: Math.max(pendingNote.y, 56),
              transform: "translate(-50%, -120%)",
            }}
          >
            <input
              autoFocus
              type="text"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveNote();
                } else if (e.key === "Escape") {
                  setPendingNote(null);
                  setNoteDraft("");
                }
              }}
              placeholder="Type a note..."
              className="w-44 px-2.5 py-2 bg-card border border-primary rounded-md text-sm shadow-lg focus:outline-none"
              aria-label="Map note"
            />
            <button
              type="button"
              onClick={saveNote}
              className="px-3 py-2 min-h-[40px] bg-primary text-primary-foreground rounded-md text-sm font-semibold shadow-lg"
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* Helper line + quiet notices */}
      <p className="text-xs text-muted-foreground">{helperText[mode]}</p>

      {/* Terrain profile along the drawn line */}
      {pathPoints.length >= 2 && (
        <TerrainProfile
          points={pathPoints}
          service={service}
          boreControls={showBoreProfile}
          initialDrill={initialRef.current?.terrain ?? null}
          onData={setTerrain}
        />
      )}
      {tileError && (
        <p className="text-xs text-muted-foreground">
          {admin
            ? "The satellite photos aren't loading right now. Lines and pins still work and still save."
            : "The satellite photos aren't loading right now. Your line and pins still work, and everything here is optional anyway."}
        </p>
      )}

      {!admin && lineChoices}
    </div>
  );
}

/** The utility and pipe-size buttons for the line being drawn. */
function LineChoices({
  admin,
  service,
  setService,
  pipeSize,
  setPipeSize,
  drawingAnother,
}: {
  admin: boolean;
  service: string;
  setService: (s: string) => void;
  pipeSize: string;
  setPipeSize: (s: string) => void;
  drawingAnother: boolean;
}) {
  const chip = admin ? "px-3 py-2 min-h-[44px]" : "px-4 py-2.5 min-h-[44px]";
  return (
    <div className={cn(admin ? "grid gap-3 sm:grid-cols-2" : "space-y-3")}>
      {/* Service chips */}
      <div className="space-y-2 pt-1">
        <p className="text-sm font-medium">
          What&apos;s going in the line?{drawingAnother ? (admin ? " (the one being drawn)" : " (the one you're drawing now)") : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {SERVICE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setService(service === opt.value ? "" : opt.value)}
              aria-pressed={service === opt.value}
              className={`${chip} rounded-full text-sm border transition-colors ${
                service === opt.value
                  ? "bg-primary text-primary-foreground border-primary font-semibold"
                  : "bg-card border-border hover:border-primary hover:text-primary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pipe size chips */}
      <div className="space-y-2">
        <p className="text-sm font-medium">{admin ? "Pipe size" : "Pipe size, if you know it"}</p>
        <div className="flex flex-wrap gap-2">
          {PIPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPipeSize(opt.value)}
              aria-pressed={pipeSize === opt.value}
              className={`${chip} rounded-full text-sm border transition-colors ${
                pipeSize === opt.value
                  ? "bg-primary text-primary-foreground border-primary font-semibold"
                  : "bg-card border-border hover:border-primary hover:text-primary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
