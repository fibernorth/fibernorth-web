import { rateLimit, type RateLimitOptions, type RateLimitResult } from "@/lib/rate-limit";

// Abuse caps for the public letter-link counters (/camp, /pros). Anyone can
// hit those URLs, so without a cap a script could inflate the counts and
// grow linkStats/{link}/visits without bound. The redirect itself is never
// affected — only whether the hit is counted / logged.
//
// - Per IP: at most VISIT_LIMIT_PER_IP_PER_HOUR counted hits per hour. A real
//   letter response is one or two hits; beyond the cap nothing is written.
// - Log size: at most VISIT_LOG_LIMIT_PER_DAY visit-log docs per link per
//   day across all IPs. Beyond that the counter still counts but the
//   per-visit log entry is skipped.
// Both use the shared Firestore limiter and fail open (a limiter hiccup
// still counts the visit, matching the counters' best-effort design).

export const VISIT_LIMIT_PER_IP_PER_HOUR = 20;
export const VISIT_LOG_LIMIT_PER_DAY = 500;

type Limiter = (opts: RateLimitOptions) => Promise<RateLimitResult>;

/** True when this IP may still be counted for this link this hour. */
export async function visitCountAllowed(
  link: string,
  ip: string,
  limiter: Limiter = rateLimit
): Promise<boolean> {
  const r = await limiter({
    bucket: `link-visit-${link}`,
    key: ip || "unknown",
    limit: VISIT_LIMIT_PER_IP_PER_HOUR,
    windowMs: 60 * 60_000,
  });
  return !r.limited;
}

/**
 * Both checks for one visit, bounded by `timeoutMs` so a slow Firestore
 * can't stall the redirect (fails open: count and log). The log budget is
 * only spent on visits that are counted.
 */
export async function visitLimits(
  link: string,
  ip: string,
  limiter: Limiter = rateLimit,
  timeoutMs = 1500
): Promise<{ count: boolean; log: boolean }> {
  const open = { count: true, log: true };
  const check = (async () => {
    if (!(await visitCountAllowed(link, ip, limiter))) return { count: false, log: false };
    return { count: true, log: await visitLogAllowed(link, limiter) };
  })().catch(() => open);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof open>((resolve) => {
    timer = setTimeout(() => resolve(open), timeoutMs);
  });
  try {
    return await Promise.race([check, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** True when today's per-visit log for this link still has room. */
export async function visitLogAllowed(link: string, limiter: Limiter = rateLimit): Promise<boolean> {
  const r = await limiter({
    bucket: `link-visit-log-${link}`,
    key: "all",
    limit: VISIT_LOG_LIMIT_PER_DAY,
    windowMs: 24 * 60 * 60_000,
  });
  return !r.limited;
}
