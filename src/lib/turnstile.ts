// Cloudflare Turnstile ("are you human") check for the public forms: the
// quote form, the campground/contractor form and the job application.
//
// On only when TURNSTILE_SECRET_KEY (server) and
// NEXT_PUBLIC_TURNSTILE_SITE_KEY (browser) are set, so the site keeps
// working before Bill has created the keys. The forms' own bot traps (hidden
// field, time to fill) stay either way.

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type HumanCheck = { ok: true; skipped?: boolean } | { ok: false; reason: string };

/** Whether the check is switched on for this server. */
export function turnstileEnabled(): boolean {
  return Boolean((process.env.TURNSTILE_SECRET_KEY || "").trim());
}

/**
 * Ask Cloudflare whether the browser's token is good. Off (no secret) → ok,
 * skipped. A missing or rejected token → not ok. If Cloudflare can't be
 * reached, let the submission through rather than lose a real lead; the
 * other bot traps still apply.
 */
export async function verifyTurnstile(
  token: string | undefined | null,
  ip?: string,
  fetchImpl: typeof fetch = fetch
): Promise<HumanCheck> {
  const secret = (process.env.TURNSTILE_SECRET_KEY || "").trim();
  if (!secret) return { ok: true, skipped: true };
  const t = String(token || "").trim();
  if (!t) return { ok: false, reason: "missing" };
  try {
    const body = new URLSearchParams({ secret, response: t });
    if (ip) body.set("remoteip", ip);
    const res = await fetchImpl(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: true, skipped: true };
    const j = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    return j.success ? { ok: true } : { ok: false, reason: (j["error-codes"] || ["rejected"]).join(",") };
  } catch {
    return { ok: true, skipped: true };
  }
}

/** The message a person sees when the check didn't pass. */
export const HUMAN_CHECK_MESSAGE =
  "Please finish the quick \"are you human\" check above the button, then send again. Trouble? Call us at (231) 264-0757.";
