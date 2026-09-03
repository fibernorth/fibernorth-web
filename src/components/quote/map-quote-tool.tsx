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
import {
  BRAND_ORANGE,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MARKER_TYPES,
  PIPE_OPTIONS,
  SERVICE_OPTIONS,
  escapeHtml,
  formatFeet,
  haversineFeet,
  midpoint,
  pathFeet,
  type LatLngLit,
  type ObstacleType,
} from "./map-v2/helpers";

type LeafletModule = typeof import("leaflet");

type Mode = "pan" | "draw" | "marker" | "note";

interface ObstacleMarker {
  id: number;
  type: ObstacleType;
  position: LatLngLit;
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

const TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

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
  draw: "Tap along the route you want the line to take.",
  marker: "Tap the map to drop a pin. Drag it to adjust, tap it to remove.",
  note: "Tap the map where you want to leave a note.",
};

const KNOWN_OBSTACLES = new Set(MARKER_TYPES.map((m) => m.type));

export function MapQuoteTool({
  onAnnotationChange,
  initial,
}: {
  onAnnotationChange: (a: MapAnnotation | null) => void;
  /** Seed an existing annotation for editing (admin workbench). Read once on mount. */
  initial?: MapAnnotation | null;
}) {
  // Captured once — the prop is a mount-time seed, not a controlled value.
  const initialRef = useRef(initial);

  // ---- state ----
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [mode, setMode] = useState<Mode>("pan");
  const [markerType, setMarkerType] = useState<ObstacleType>("well");
  const [pathPoints, setPathPoints] = useState<LatLngLit[]>(
    () => initialRef.current?.paths?.[0]?.points ?? []
  );
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

        // When editing an existing drawing, frame the drawn line rather than
        // trusting the saved viewport.
        const seedPts = seed?.paths?.[0]?.points ?? [];
        if (seedPts.length >= 2) {
          map.fitBounds(
            L.latLngBounds(seedPts.map((p) => [p.lat, p.lng] as [number, number])),
            { padding: [60, 60], maxZoom: 19 }
          );
        }

        const tiles = L.tileLayer(TILE_URL, {
          attribution: "Imagery &copy; Esri",
          maxZoom: 20,
          maxNativeZoom: 19,
        });
        tiles.on("tileerror", () => setTileError(true));
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

    // --- bore path polyline ---
    if (pathPoints.length >= 2) {
      polylineRef.current = L.polyline(
        pathPoints.map((p) => [p.lat, p.lng]),
        { color: BRAND_ORANGE, weight: 5, opacity: 0.9 }
      ).addTo(overlay);
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
  }, [ready, pathPoints, obstacles, notes]);

  // ---- emit annotation ----
  useEffect(() => {
    const { segments, total } = pathFeet(pathPoints);
    const empty =
      pathPoints.length === 0 &&
      obstacles.length === 0 &&
      notes.length === 0 &&
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
      paths:
        pathPoints.length > 0
          ? [{ type: "bore-path" as const, points: pathPoints, color: BRAND_ORANGE }]
          : [],
      polygons: [],
      labels: notes.map((n) => ({ position: n.position, text: n.text })),
      runFeet: Math.round(total),
      segmentFeet: segments.map((s) => Math.round(s)),
      service: service || undefined,
      pipeSize,
      address: address || undefined,
      version: 2,
    };
    onChangeRef.current(annotation);
  }, [pathPoints, obstacles, notes, service, pipeSize, address]);

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
            "Address lookup isn't responding right now. You can still drag and zoom the map to find your place."
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
      setGeoError("Your browser can't share your location. Search your address instead.");
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
          "We couldn't get your location — your browser may be blocking it. Search your address instead."
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

  const setModeAnd = useCallback((m: Mode) => {
    setMode(m);
    setPendingNote(null);
    setNoteDraft("");
  }, []);

  const { total: computedTotal } = pathFeet(pathPoints);
  const totalFeet = liveFeet ?? computedTotal;

  const modeButtons: Array<{ mode: Mode; label: string; icon: ReactNode }> = [
    { mode: "pan", label: "Move map", icon: <IconHand /> },
    { mode: "draw", label: "Draw your line", icon: <IconLine /> },
    { mode: "marker", label: "Mark what's there", icon: <IconPin /> },
    { mode: "note", label: "Note", icon: <IconNote /> },
  ];

  if (loadError) {
    return (
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
            placeholder="Search your address..."
            autoComplete="off"
            className="w-full pl-9 pr-3 py-2.5 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Search your address"
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
          {locating ? "Finding you..." : "Use my location"}
        </button>
      </div>
      {searching && <p className="text-xs text-muted-foreground">Looking that up...</p>}
      {searchError && <p className="text-xs text-muted-foreground">{searchError}</p>}
      {geoError && <p className="text-xs text-muted-foreground">{geoError}</p>}

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
      {mode === "draw" && pathPoints.length > 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPathPoints((prev) => prev.slice(0, -1))}
            className="flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-md text-sm font-medium bg-muted border border-border hover:border-primary hover:text-primary transition-colors"
          >
            <IconUndo />
            Undo last point
          </button>
          <button
            type="button"
            onClick={() => setPathPoints([])}
            className="px-3 py-2 min-h-[44px] rounded-md text-sm font-medium bg-muted border border-border hover:border-destructive hover:text-destructive transition-colors"
          >
            Clear line
          </button>
        </div>
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
            <span className="block text-[10px] text-muted-foreground leading-none">total run</span>
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
      <p className="text-xs text-muted-foreground">{HELPER_TEXT[mode]}</p>
      {tileError && (
        <p className="text-xs text-muted-foreground">
          The satellite photos aren&apos;t loading right now. Your line and pins still work,
          and everything here is optional anyway.
        </p>
      )}

      {/* Service chips */}
      <div className="space-y-2 pt-1">
        <p className="text-sm font-medium">What&apos;s going in the line?</p>
        <div className="flex flex-wrap gap-2">
          {SERVICE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setService(service === opt.value ? "" : opt.value)}
              aria-pressed={service === opt.value}
              className={`px-4 py-2.5 min-h-[44px] rounded-full text-sm border transition-colors ${
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
        <p className="text-sm font-medium">Pipe size, if you know it</p>
        <div className="flex flex-wrap gap-2">
          {PIPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPipeSize(opt.value)}
              aria-pressed={pipeSize === opt.value}
              className={`px-4 py-2.5 min-h-[44px] rounded-full text-sm border transition-colors ${
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
