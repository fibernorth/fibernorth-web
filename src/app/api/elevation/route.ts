import { NextResponse } from "next/server";
import { z } from "zod";

// Proxy to the USGS 3DEP elevation point service (1m DEM across Michigan,
// no key). Proxied server-side so the browser needs no CORS luck and we can
// cap request size. Values come back in feet; failures come back as null so
// one bad sample never sinks the profile.

const bodySchema = z.object({
  points: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
    )
    .min(1)
    .max(80),
});

// Tiny in-memory cache — profiles get re-requested as a line is nudged.
const cache = new Map<string, number>();
const CACHE_MAX = 5000;

async function elevationFeet(lat: number, lng: number): Promise<number | null> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  try {
    const res = await fetch(
      `https://epqs.nationalmap.gov/v1/json?x=${lng}&y=${lat}&wkid=4326&units=Feet&includeDate=false`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { value?: unknown };
    const value = typeof data.value === "number" ? data.value : Number(data.value);
    if (!Number.isFinite(value) || value < -1500 || value > 21000) return null;
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(key, value);
    return value;
  } catch {
    return null;
  }
}

// Basic per-instance flood protection, same pattern as the quote endpoint.
const recent = new Map<string, { count: number; windowStart: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = recent.get(ip);
  if (!entry || now - entry.windowStart > 60_000) {
    recent.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > 30;
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (rateLimited(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
    const points = parsed.data.points;

    // Small concurrency pool — USGS answers ~200-500ms per point.
    const results: Array<number | null> = new Array(points.length).fill(null);
    let next = 0;
    const worker = async () => {
      while (next < points.length) {
        const i = next++;
        results[i] = await elevationFeet(points[i].lat, points[i].lng);
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));

    return NextResponse.json({ elevations: results });
  } catch {
    return NextResponse.json({ error: "Elevation lookup failed" }, { status: 500 });
  }
}
