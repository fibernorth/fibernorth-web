// Checks for public JSON endpoints that change state (the proposal accept /
// decline route): JSON only, from our own pages only, and small.
//
// A cross-site form or fetch can't set Content-Type: application/json
// without a CORS preflight we never answer, and browsers send Origin (or at
// least Referer) with a POST, so a request that names another site is
// refused. A request with neither header (curl, some privacy setups) is
// allowed: the link token is still the credential.

import { SITE_URL } from "@/lib/proposal";

function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Hosts our own pages are served from. */
function ownHosts(request: Request): Set<string> {
  const hosts = new Set<string>(["fibernorth.com", "www.fibernorth.com"]);
  const add = (h: string | null | undefined) => {
    if (h) hosts.add(h.toLowerCase());
  };
  add(hostOf(SITE_URL));
  add(hostOf(request.url));
  add(request.headers.get("host"));
  add(request.headers.get("x-forwarded-host")?.split(",")[0]?.trim());
  return hosts;
}

export type GuardResult = { ok: true; text: string } | { ok: false; status: number; error: string };

export async function readGuardedJson(request: Request, maxBytes = 8_000): Promise<GuardResult> {
  const type = (request.headers.get("content-type") || "").toLowerCase();
  if (!type.startsWith("application/json")) {
    return { ok: false, status: 415, error: "Bad request" };
  }
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const hosts = ownHosts(request);
  if (origin !== null) {
    const h = hostOf(origin);
    if (!h || !hosts.has(h)) return { ok: false, status: 403, error: "Forbidden" };
  } else if (referer) {
    const h = hostOf(referer);
    if (!h || !hosts.has(h)) return { ok: false, status: 403, error: "Forbidden" };
  }
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) return { ok: false, status: 413, error: "Request too large" };
  const text = await request.text();
  if (text.length > maxBytes) return { ok: false, status: 413, error: "Request too large" };
  return { ok: true, text };
}
