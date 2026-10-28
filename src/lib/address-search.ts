// Address lookup for the quote map's search box, Michigan only.
//
// Nominatim alone is picky: it wants the address spelled the way
// OpenStreetMap has it, and many rural house numbers aren't there at all.
// So: Photon first (OpenStreetMap data too, but built for type-ahead: partial
// words and small typos still match), biased toward Traverse City and boxed
// to Michigan. Then Nominatim, boxed to Michigan. Then, if the house number
// is the problem, the street alone, so the map at least lands on the road.

export interface AddressResult {
  display_name: string;
  lat: string;
  lon: string;
}

/** Michigan's bounding box: west, south, east, north. */
export const MICHIGAN_BBOX = [-90.42, 41.69, -82.12, 48.31] as const;
/** Where results are biased toward (Traverse City). */
const HOME = { lat: 44.763, lon: -85.62 };

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    postcode?: string;
    countrycode?: string;
  };
}

/** One readable line from a Photon result: "123 Main St, Williamsburg, MI 49690". */
export function photonLabel(p: NonNullable<PhotonFeature["properties"]>): string {
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const first = street || p.name || "";
  const place = p.city || p.town || p.village || p.county || "";
  const tail = ["MI", p.postcode].filter(Boolean).join(" ");
  // A named place on a street ("Holiday Park Campground") keeps both.
  const named = p.name && street && p.name !== street ? `${p.name}, ` : "";
  return [named + first, place, tail].filter(Boolean).join(", ");
}

/** Photon features in Michigan, as search results. */
export function fromPhoton(features: PhotonFeature[]): AddressResult[] {
  const out: AddressResult[] = [];
  for (const f of features) {
    const p = f.properties || {};
    const c = f.geometry?.coordinates;
    if (!c || p.state !== "Michigan" || (p.countrycode && p.countrycode.toUpperCase() !== "US")) continue;
    const label = photonLabel(p);
    if (!label || out.some((r) => r.display_name === label)) continue;
    out.push({ display_name: label, lat: String(c[1]), lon: String(c[0]) });
  }
  return out;
}

/** The query without a leading house number ("6227 Arnold Rd" -> "Arnold Rd"), or "" when there is none. */
export function withoutHouseNumber(q: string): string {
  const m = q.trim().match(/^\d+[a-z]?\s+(.+)$/i);
  return m ? m[1] : "";
}

/** Adds ", Michigan" unless the query already names the state. */
export function inMichigan(q: string): string {
  return /\b(mi|mich|michigan)\b/i.test(q) ? q : `${q}, Michigan`;
}

async function photon(q: string, signal?: AbortSignal): Promise<AddressResult[]> {
  const [w, s, e, n] = MICHIGAN_BBOX;
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&lat=${HOME.lat}&lon=${HOME.lon}&bbox=${w},${s},${e},${n}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const data = (await res.json()) as { features?: PhotonFeature[] };
  return fromPhoton(data.features || []).slice(0, 5);
}

async function nominatim(q: string, signal?: AbortSignal): Promise<AddressResult[]> {
  const [w, s, e, n] = MICHIGAN_BBOX;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=us&bounded=1&viewbox=${w},${n},${e},${s}&q=${encodeURIComponent(inMichigan(q))}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const data = (await res.json()) as AddressResult[];
  return Array.isArray(data) ? data : [];
}

/**
 * Michigan addresses matching what was typed. Throws only when every lookup
 * failed outright (both services down); an empty list means nothing matched.
 */
export async function searchMichiganAddress(q: string, signal?: AbortSignal): Promise<AddressResult[]> {
  let failures = 0;
  const attempt = async (fn: () => Promise<AddressResult[]>) => {
    try {
      return await fn();
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      failures++;
      return [];
    }
  };
  let found = await attempt(() => photon(q, signal));
  if (!found.length) found = await attempt(() => nominatim(q, signal));
  if (!found.length) {
    const street = withoutHouseNumber(q);
    if (street) {
      const near = await attempt(() => photon(street, signal));
      found = near.map((r) => ({ ...r, display_name: `${r.display_name} (street only; house number not on the map)` }));
    }
  }
  if (!found.length && failures >= 2) throw new Error("Address lookup isn't responding");
  return found;
}
