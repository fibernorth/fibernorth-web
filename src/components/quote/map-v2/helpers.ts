// Pure, SSR-safe helpers for the Leaflet quote map tool. No Leaflet imports here.

export interface LatLngLit {
  lat: number;
  lng: number;
}

/** Straight-line distance between two points in feet (haversine). */
export function haversineFeet(a: LatLngLit, b: LatLngLit): number {
  const R_FEET = 20902231; // Earth radius in feet
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R_FEET * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Per-segment and total footage for a polyline. */
export function pathFeet(points: LatLngLit[]): { segments: number[]; total: number } {
  const segments: number[] = [];
  for (let i = 1; i < points.length; i++) {
    segments.push(haversineFeet(points[i - 1], points[i]));
  }
  return { segments, total: segments.reduce((s, n) => s + n, 0) };
}

export function formatFeet(feet: number): string {
  return `~${Math.round(feet)} ft`;
}

/** Midpoint of a segment (good enough at property scale). */
export function midpoint(a: LatLngLit, b: LatLngLit): LatLngLit {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type ObstacleType =
  | "well"
  | "septic-tank"
  | "septic-field"
  | "utility-line"
  | "tree-obstacle";

export const MARKER_TYPES: Array<{
  type: ObstacleType;
  label: string;
  color: string;
}> = [
  { type: "well", label: "Well", color: "#60A5FA" },
  { type: "septic-tank", label: "Septic tank", color: "#C4A484" },
  { type: "septic-field", label: "Drain field", color: "#9CA3AF" },
  { type: "utility-line", label: "Utility", color: "#FACC15" },
  { type: "tree-obstacle", label: "Tree", color: "#4ADE80" },
];

export const SERVICE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "water", label: "Water" },
  { value: "power", label: "Power" },
  { value: "gas", label: "Gas/Propane" },
  { value: "internet", label: "Internet" },
  { value: "septic", label: "Septic" },
  { value: "drainage", label: "Drainage" },
  { value: "not-sure", label: "Not sure" },
];

export const PIPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '1"', label: '1"' },
  { value: '1.5"', label: '1.5"' },
  { value: '2"', label: '2"' },
  { value: '3"', label: '3"' },
  { value: '4"+', label: '4"+' },
  { value: "not-sure", label: "Not sure — most people pick this" },
];

// Esri "Clarity" serves the sharpest available vintage of each area (often a
// year or two older than the standard feed, but much higher resolution in
// rural Northern Michigan). Standard World Imagery is the fallback if the
// Clarity endpoint ever stops serving.
export const IMAGERY_URL =
  "https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const IMAGERY_FALLBACK_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export const DEFAULT_CENTER: LatLngLit = { lat: 44.7631, lng: -85.3935 };
export const DEFAULT_ZOOM = 13;
export const BRAND_ORANGE = "#E8672A";

// Line colors follow the APWA / MISS DIG locate-flag convention people have
// seen in their yards: red = electric, yellow = gas, blue = water,
// orange = communications, green = sewer/septic. Drainage gets teal so it
// reads apart from septic on satellite imagery.
export const SERVICE_COLORS: Record<string, string> = {
  power: "#EF4444",
  gas: "#EAB308",
  water: "#3B82F6",
  internet: "#F97316",
  septic: "#22C55E",
  drainage: "#14B8A6",
};

export function serviceColor(service?: string): string {
  return (service && SERVICE_COLORS[service]) || BRAND_ORANGE;
}

export const SERVICE_NAMES: Record<string, string> = {
  power: "Power",
  gas: "Gas",
  water: "Water",
  internet: "Internet",
  septic: "Septic",
  drainage: "Drainage",
};

/** Text that runs along the customer's new (to-be-bored) line. */
export function newLineLabel(service?: string): string {
  const name = service ? SERVICE_NAMES[service] : undefined;
  return name ? `New ${name} to be installed here` : "New line to be installed here";
}

/** "existing-power" -> "power"; legacy "existing-line" -> "" */
export function existingServiceFromPathType(type: string): string {
  if (!type.startsWith("existing-")) return "";
  const s = type.slice("existing-".length);
  return s in SERVICE_COLORS ? s : "";
}

// Utilities offered in the "mark existing lines" palette.
export const EXISTING_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "power", label: "Power" },
  { value: "gas", label: "Gas" },
  { value: "water", label: "Water" },
  { value: "internet", label: "Internet" },
  { value: "septic", label: "Septic" },
  { value: "drainage", label: "Drainage" },
];
