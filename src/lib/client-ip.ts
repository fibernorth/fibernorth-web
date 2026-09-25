// Client IP for rate limits, visit logs and e-signature records.
//
// Never trust the FIRST X-Forwarded-For entry: the browser can send its own
// X-Forwarded-For and Google's front end keeps it, appending the real client
// address and then its own hop, i.e. "<anything the client sent>, <client>,
// <proxy>". Order of preference:
//
// 1. On Firebase App Hosting, `x-fah-client-ip` — the platform's own client
//    IP header (set by App Hosting's CDN; Firebase support confirms it as the
//    client identity header). Only trusted when we can tell we're running on
//    App Hosting / Cloud Run, so a spoofed header means nothing elsewhere.
// 2. X-Forwarded-For, second-to-last entry when there are 2+ entries (the
//    client address the Google load balancer appended before its own hop),
//    otherwise the only entry.
// 3. x-real-ip (local dev / other hosts), else "unknown".

type HeaderSource = Headers | { headers: Headers };

const IP_RE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|(?=[0-9a-fA-F:.]{2,45}$)[0-9a-fA-F]*:[0-9a-fA-F:.]*)$/;

function cleanIp(value: string | null | undefined): string | null {
  if (!value) return null;
  let v = value.trim();
  // "[2001:db8::1]:443" or "1.2.3.4:5678" -> bare address
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(v);
  if (bracketed) v = bracketed[1];
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(v)) v = v.replace(/:\d+$/, "");
  return IP_RE.test(v) ? v : null;
}

export function isAppHostingRuntime(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.FIREBASE_CONFIG || env.K_SERVICE);
}

export function getClientIp(
  source: HeaderSource,
  env: Record<string, string | undefined> = process.env
): string {
  const headers = source instanceof Headers ? source : source.headers;

  if (isAppHostingRuntime(env)) {
    const fah = cleanIp(headers.get("x-fah-client-ip"));
    if (fah) return fah;
  }

  const xff = (headers.get("x-forwarded-for") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (xff.length >= 2) {
    const ip = cleanIp(xff[xff.length - 2]);
    if (ip) return ip;
  } else if (xff.length === 1) {
    const ip = cleanIp(xff[0]);
    if (ip) return ip;
  }

  return cleanIp(headers.get("x-real-ip")) || "unknown";
}
