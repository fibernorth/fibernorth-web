// MISS DIG ticket sheet: everything Bill needs to enter a ticket at
// missdig811.org when a customer accepts a quote. Pure (no Firebase), so the
// sheet page, the dashboard card and the tests share one copy.
//
// The quote is the source: its address, its map drawing (bore path, existing
// utilities, markers), the line going in and its footage. Michigan law needs
// the ticket in at least 3 business days before digging (weekends and legal
// holidays don't count), so the sheet shows the earliest legal dig date for a
// ticket entered today.

import { addBusinessDays } from "@/lib/business-days";
import type { MapAnnotation, QuoteRequest } from "@/lib/types";

export type MissDigStatus = "needed" | "entered";

type Point = { lat: number; lng: number };

export interface MissDigSheet {
  customer: { name: string; phone: string; email: string };
  address: string;
  /** "Directional bore to install a 1-1/4 in water line, about 140 ft" */
  workType: string;
  method: string;
  feet: number | null;
  pipeSize: string;
  service: string;
  /** The bore path's ends and its points, for the ticket's map and GPS fields. */
  start: Point | null;
  end: Point | null;
  path: Point[];
  /** Existing utilities and obstacles drawn on the map. */
  existing: string[];
  /** A starting point for the ticket's "marking instructions" box. */
  markingInstructions: string;
  /** Earliest legal dig day for a ticket entered on `today` (3 business days; weekends and holidays skipped). */
  earliestDig: string;
  scheduled: string;
  mapsUrl: string;
}

const SERVICE_WORDS: Record<string, string> = {
  water: "water line",
  power: "electric conduit",
  electric: "electric conduit",
  gas: "gas line",
  fiber: "fiber / communications conduit",
  internet: "fiber / communications conduit",
  sewer: "sewer line",
  septic: "septic line",
  irrigation: "irrigation line",
  conduit: "conduit",
};

const EXISTING_WORDS: Record<string, string> = {
  "existing-power": "existing power",
  "existing-water": "existing water",
  "existing-gas": "existing gas",
  "existing-fiber": "existing fiber / phone",
  "existing-sewer": "existing sewer",
  "existing-line": "existing line",
};

const MARKER_WORDS: Record<string, string> = {
  well: "well",
  "septic-tank": "septic tank",
  "septic-field": "septic field",
  "utility-line": "utility line",
  "tree-obstacle": "trees / obstacle",
};

function asAnnotation(a: unknown): MapAnnotation | null {
  if (!a || typeof a !== "object") return null;
  const m = a as MapAnnotation;
  return Array.isArray(m.paths) ? m : null;
}

function serviceWords(s: string): string {
  const k = (s || "").toLowerCase();
  for (const [key, words] of Object.entries(SERVICE_WORDS)) if (k.includes(key)) return words;
  return k ? `${k} line` : "utility line";
}

function fmt(p: Point): string {
  return `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
}

/** Google Maps link to a point (or the address when there's no drawing). */
export function mapsLink(p: Point | null, address: string): string {
  if (p) return `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : "";
}

export function missDigSheet(
  quote: Partial<QuoteRequest>,
  today: string,
  extra: { scheduled?: string; leadPhone?: string } = {}
): MissDigSheet {
  const ann = asAnnotation(quote.mapAnnotation);
  const bores = (ann?.paths || []).filter((p) => p.type === "bore-path" && Array.isArray(p.points) && p.points.length > 1);
  const path = bores.flatMap((p) => p.points);
  const start = path[0] ?? null;
  const end = path.length > 1 ? path[path.length - 1] : null;
  const service = bores.find((b) => b.service)?.service || ann?.service || quote.serviceType || "";
  const pipeSize = (ann?.pipeSize || "").replace(/^not-sure$/, "");
  const feet = typeof ann?.runFeet === "number" && ann.runFeet > 0 ? Math.round(ann.runFeet) : null;
  const line = serviceWords(service);
  const workType = [
    `Directional bore to install ${pipeSize ? `a ${pipeSize} ` : /^[aeiou]/i.test(line) ? "an " : "a "}${line}`,
    feet ? `about ${feet} ft` : "",
    bores.length > 1 ? `(${bores.length} runs)` : "",
  ]
    .filter(Boolean)
    .join(", ")
    .replace(", (", " (");

  const existing = [
    ...new Set([
      ...(ann?.paths || []).filter((p) => p.type !== "bore-path").map((p) => EXISTING_WORDS[p.type] || p.type.replace(/^existing-/, "existing ")),
      ...(ann?.markers || []).map((m) => MARKER_WORDS[m.type] || m.type),
    ]),
  ];

  const address = (quote.address || ann?.address || "").trim();
  const markingInstructions = start && end
    ? `Mark a 25 ft wide corridor along the bore path from ${fmt(start)} to ${fmt(end)}${feet ? ` (about ${feet} ft)` : ""}, including both pit locations. Mark all utilities in that area.`
    : `Mark the area of the planned ${line} on the property at ${address || "the address"}.`;

  return {
    customer: { name: quote.name || "", phone: quote.phone || extra.leadPhone || "", email: quote.email || "" },
    address,
    workType,
    method: "Horizontal directional drilling (boring)",
    feet,
    pipeSize,
    service: line,
    start,
    end,
    path,
    existing,
    markingInstructions,
    earliestDig: addBusinessDays(today, 3),
    scheduled: extra.scheduled || "",
    mapsUrl: mapsLink(start, address),
  };
}

/** Quotes waiting on a MISS DIG ticket, oldest acceptance first. */
export function missDigQueue<Q extends Pick<QuoteRequest, "id"> & Partial<Pick<QuoteRequest, "missDigStatus" | "missDigNeededAt" | "acceptedAt">>>(
  quotes: Q[]
): Q[] {
  return quotes
    .filter((q) => q.missDigStatus === "needed")
    .sort((a, b) => (a.missDigNeededAt || a.acceptedAt || "").localeCompare(b.missDigNeededAt || b.acceptedAt || ""));
}

/** A ticket number as MISS DIG prints them (digits, maybe a dash); trimmed and capped. */
export function cleanTicket(t: string): string {
  return String(t || "").replace(/\s+/g, "").slice(0, 30);
}
