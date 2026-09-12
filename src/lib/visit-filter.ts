// Decides whether a letter-link visit should be counted. Visits from the
// owner's own network (Coli) and from Anthropic (Claude's test traffic) are
// noise, not prospects, so they don't count. Org is resolved via ipinfo.io —
// the same source the admin dashboard links each IP to — so a name that shows
// there as "Coli, Inc." or "Anthropic" is what gets matched here.

// Word-ish boundaries so "coli" doesn't catch "colin"; case-insensitive.
const EXCLUDED_ORG = /(^|[^a-z])(anthropic|coli)([^a-z]|$)/i;

// Per-instance cache so a repeat visitor isn't looked up every time.
const orgCache = new Map<string, string>();

async function lookupOrg(ip: string): Promise<string> {
  if (orgCache.has(ip)) return orgCache.get(ip)!;
  try {
    const res = await fetch(`https://ipinfo.io/${ip}/json`, {
      signal: AbortSignal.timeout(1500),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return "";
    const data = (await res.json()) as { org?: string };
    const org = String(data.org || "");
    orgCache.set(ip, org);
    return org;
  } catch {
    return "";
  }
}

/**
 * Returns { count, org }. count=false means this visit should be skipped.
 * Fails open: if the lookup can't resolve an org, the visit is counted, so a
 * transient ipinfo hiccup never drops a real letter response.
 */
export async function classifyVisit(
  ip: string
): Promise<{ count: boolean; org: string }> {
  if (!ip || ip === "unknown") return { count: true, org: "" };
  const org = await lookupOrg(ip);
  return { count: !EXCLUDED_ORG.test(org), org };
}
