"use client";

import { useState, useCallback, useRef } from "react";
import { GoogleMap, useJsApiLoader, Marker, Polyline } from "@react-google-maps/api";
import { MapToolbar, type MarkerType, type DrawMode } from "./map-toolbar";
import { MapLegend } from "./map-legend";
import type { MapAnnotation } from "@/lib/types";

const MAP_STYLES = { width: "100%", height: "450px" };
const DEFAULT_CENTER = { lat: 44.7631, lng: -85.3935 }; // Williamsburg, MI

const MARKER_COLORS: Record<MarkerType, string> = {
  well: "#60A5FA",
  "septic-tank": "#9CA3AF",
  "septic-field": "#6B7280",
  "utility-line": "#FBBF24",
  "tree-obstacle": "#4ADE80",
};

interface PlacedMarker {
  type: MarkerType;
  position: { lat: number; lng: number };
  label?: string;
}

interface DrawnPath {
  type: "bore-path" | "existing-line";
  points: { lat: number; lng: number }[];
}

import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID } from "@/lib/maps";

interface MapDrawingToolProps {
  onAnnotationChange: (annotation: MapAnnotation | null) => void;
}

export function MapDrawingTool({ onAnnotationChange }: MapDrawingToolProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  if (!apiKey) {
    return <MapUnavailable />;
  }
  return <MapDrawingToolInner onAnnotationChange={onAnnotationChange} apiKey={apiKey} />;
}

function MapUnavailable() {
  return (
    <div className="bg-muted border border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
      The property map isn&apos;t available right now — just describe your
      property and bore path in the description above and we&apos;ll take it
      from there.
    </div>
  );
}

function MapDrawingToolInner({
  onAnnotationChange,
  apiKey,
}: MapDrawingToolProps & { apiKey: string }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: apiKey,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(15);
  const [markers, setMarkers] = useState<PlacedMarker[]>([]);
  const [paths, setPaths] = useState<DrawnPath[]>([]);
  const [currentPath, setCurrentPath] = useState<{ lat: number; lng: number }[]>([]);
  const [drawMode, setDrawMode] = useState<DrawMode>("select");
  const [markerType, setMarkerType] = useState<MarkerType>("well");
  const addressRef = useRef<HTMLInputElement>(null);

  const hasItems = markers.length > 0 || paths.length > 0 || currentPath.length > 0;

  const updateAnnotation = useCallback(
    (m: PlacedMarker[], p: DrawnPath[]) => {
      if (m.length === 0 && p.length === 0) {
        onAnnotationChange(null);
        return;
      }
      onAnnotationChange({
        center,
        zoom,
        markers: m.map((mk) => ({ type: mk.type, position: mk.position, label: mk.label })),
        paths: p.map((pa) => ({
          type: pa.type,
          points: pa.points,
          color: pa.type === "bore-path" ? "#E8672A" : "#FBBF24",
        })),
        polygons: [],
      });
    },
    [center, zoom, onAnnotationChange]
  );

  const handleMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const pos = { lat: e.latLng.lat(), lng: e.latLng.lng() };

      if (drawMode === "marker") {
        const newMarkers = [...markers, { type: markerType, position: pos }];
        setMarkers(newMarkers);
        updateAnnotation(newMarkers, paths);
      } else if (drawMode === "bore-path" || drawMode === "existing-line") {
        setCurrentPath((prev) => [...prev, pos]);
      }
    },
    [drawMode, markerType, markers, paths, updateAnnotation]
  );

  const handleMapDblClick = useCallback(() => {
    if ((drawMode === "bore-path" || drawMode === "existing-line") && currentPath.length > 1) {
      const newPath: DrawnPath = {
        type: drawMode === "bore-path" ? "bore-path" : "existing-line",
        points: currentPath,
      };
      const newPaths = [...paths, newPath];
      setPaths(newPaths);
      setCurrentPath([]);
      updateAnnotation(markers, newPaths);
    }
  }, [drawMode, currentPath, paths, markers, updateAnnotation]);

  const handleUndo = () => {
    if (currentPath.length > 0) {
      setCurrentPath((prev) => prev.slice(0, -1));
    } else if (paths.length > 0) {
      const newPaths = paths.slice(0, -1);
      setPaths(newPaths);
      updateAnnotation(markers, newPaths);
    } else if (markers.length > 0) {
      const newMarkers = markers.slice(0, -1);
      setMarkers(newMarkers);
      updateAnnotation(newMarkers, paths);
    }
  };

  const handleClear = () => {
    setMarkers([]);
    setPaths([]);
    setCurrentPath([]);
    onAnnotationChange(null);
  };

  const handleAddressSearch = () => {
    if (!addressRef.current?.value || !map) return;
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: addressRef.current.value }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        const loc = results[0].geometry.location;
        const newCenter = { lat: loc.lat(), lng: loc.lng() };
        setCenter(newCenter);
        setZoom(19);
        map.panTo(newCenter);
        map.setZoom(19);
      }
    });
  };

  if (loadError) {
    return <MapUnavailable />;
  }

  if (!isLoaded) {
    return (
      <div className="w-full h-[450px] bg-muted rounded-lg flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading map...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Address Search */}
      <div className="flex gap-2">
        <input
          ref={addressRef}
          type="text"
          placeholder="Enter your property address to zoom in..."
          className="flex-1 px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddressSearch())}
        />
        <button
          type="button"
          onClick={handleAddressSearch}
          className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90 transition-colors"
        >
          Find
        </button>
      </div>

      {/* Toolbar */}
      <MapToolbar
        activeMode={drawMode}
        activeMarkerType={markerType}
        onModeChange={setDrawMode}
        onMarkerTypeChange={setMarkerType}
        onUndo={handleUndo}
        onClear={handleClear}
        hasItems={hasItems}
      />

      {/* Instructions */}
      <p className="text-xs text-muted-foreground">
        {drawMode === "select" && "Click and drag to pan. Use the tools above to mark your property."}
        {drawMode === "marker" && "Click on the map to place a marker."}
        {drawMode === "bore-path" && "Click to add points to your desired bore path. Double-click to finish."}
        {drawMode === "existing-line" && "Click to trace an existing utility line. Double-click to finish."}
      </p>

      {/* Map */}
      <div className="rounded-lg overflow-hidden border border-border">
        <GoogleMap
          mapContainerStyle={MAP_STYLES}
          center={center}
          zoom={zoom}
          mapTypeId="satellite"
          onClick={handleMapClick}
          onDblClick={handleMapDblClick}
          onLoad={(m) => setMap(m)}
          options={{
            disableDoubleClickZoom: drawMode !== "select",
            draggableCursor: drawMode !== "select" ? "crosshair" : undefined,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          }}
        >
          {/* Placed markers */}
          {markers.map((m, i) => (
            <Marker
              key={`marker-${i}`}
              position={m.position}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: MARKER_COLORS[m.type],
                fillOpacity: 0.9,
                strokeColor: "#fff",
                strokeWeight: 2,
              }}
              title={m.type.replace("-", " ")}
            />
          ))}

          {/* Completed paths */}
          {paths.map((p, i) => (
            <Polyline
              key={`path-${i}`}
              path={p.points}
              options={{
                strokeColor: p.type === "bore-path" ? "#E8672A" : "#FBBF24",
                strokeWeight: p.type === "bore-path" ? 4 : 2,
                strokeOpacity: 0.8,
                geodesic: true,
              }}
            />
          ))}

          {/* Current drawing path */}
          {currentPath.length > 0 && (
            <Polyline
              path={currentPath}
              options={{
                strokeColor: drawMode === "bore-path" ? "#E8672A" : "#FBBF24",
                strokeWeight: drawMode === "bore-path" ? 4 : 2,
                strokeOpacity: 0.6,
                geodesic: true,
                icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "15px" }],
              }}
            />
          )}
        </GoogleMap>
      </div>

      {/* Legend */}
      <MapLegend />

      <p className="text-xs text-muted-foreground italic">
        Optional: Mark as much or as little as you&apos;d like. Even a rough idea helps us quote faster.
      </p>
    </div>
  );
}
