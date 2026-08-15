"use client";

import { GoogleMap, useJsApiLoader, Marker, Polyline } from "@react-google-maps/api";
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID } from "@/lib/maps";

const MAP_STYLES = { width: "100%", height: "350px" };

interface LatLng {
  lat: number;
  lng: number;
}

interface ViewerMarker {
  type: string;
  position: LatLng;
}

interface ViewerPath {
  type: string;
  points: LatLng[];
}

interface ValidAnnotation {
  center: LatLng;
  zoom: number;
  markers: ViewerMarker[];
  paths: ViewerPath[];
}

function isLatLng(value: unknown): value is LatLng {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.lat === "number" &&
    Number.isFinite(v.lat) &&
    typeof v.lng === "number" &&
    Number.isFinite(v.lng)
  );
}

/**
 * Defensively parse an untrusted mapAnnotation value from Firestore into a
 * shape safe to render. Returns null if the data is missing or malformed.
 */
function parseAnnotation(value: unknown): ValidAnnotation | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!isLatLng(v.center)) return null;
  if (typeof v.zoom !== "number" || !Number.isFinite(v.zoom)) return null;

  const markers: ViewerMarker[] = Array.isArray(v.markers)
    ? v.markers.flatMap((m: unknown): ViewerMarker[] => {
        if (typeof m !== "object" || m === null) return [];
        const mk = m as Record<string, unknown>;
        if (typeof mk.type !== "string" || !isLatLng(mk.position)) return [];
        return [{ type: mk.type, position: mk.position }];
      })
    : [];

  const paths: ViewerPath[] = Array.isArray(v.paths)
    ? v.paths.flatMap((p: unknown): ViewerPath[] => {
        if (typeof p !== "object" || p === null) return [];
        const pa = p as Record<string, unknown>;
        if (typeof pa.type !== "string" || !Array.isArray(pa.points)) return [];
        const points = pa.points.filter(isLatLng);
        if (points.length < 2) return [];
        return [{ type: pa.type, points }];
      })
    : [];

  if (markers.length === 0 && paths.length === 0) return null;
  return { center: v.center, zoom: v.zoom, markers, paths };
}

interface QuoteMapViewerProps {
  annotation: unknown;
}

export function QuoteMapViewer({ annotation }: QuoteMapViewerProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const parsed = parseAnnotation(annotation);
  if (!parsed) return null;
  if (!apiKey) {
    return (
      <p className="text-xs text-muted-foreground bg-muted rounded p-2">
        The customer attached a property map, but it can&apos;t be displayed
        (Google Maps key is not configured).
      </p>
    );
  }
  return <QuoteMapViewerInner annotation={parsed} apiKey={apiKey} />;
}

function QuoteMapViewerInner({
  annotation,
  apiKey,
}: {
  annotation: ValidAnnotation;
  apiKey: string;
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: apiKey,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  if (loadError) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Customer map annotation could not be displayed.
      </p>
    );
  }

  if (!isLoaded) {
    return (
      <div className="w-full h-[350px] bg-muted rounded-lg flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading map...</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden border border-border">
      <GoogleMap
        mapContainerStyle={MAP_STYLES}
        center={annotation.center}
        zoom={annotation.zoom}
        mapTypeId="satellite"
        options={{
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        }}
      >
        {annotation.markers.map((m, i) => (
          <Marker
            key={`marker-${i}`}
            position={m.position}
            label={{
              text: m.type.charAt(0).toUpperCase(),
              color: "#fff",
              fontSize: "12px",
              fontWeight: "bold",
            }}
            title={m.type.replace(/-/g, " ")}
          />
        ))}
        {annotation.paths.map((p, i) => (
          <Polyline
            key={`path-${i}`}
            path={p.points}
            options={{
              strokeColor: "#E8672A",
              strokeWeight: 4,
              strokeOpacity: 0.8,
              geodesic: true,
            }}
          />
        ))}
      </GoogleMap>
    </div>
  );
}
