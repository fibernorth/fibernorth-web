import { NextResponse } from "next/server";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getClientIp } from "@/lib/client-ip";
import { classifyVisit } from "@/lib/visit-filter";
import { visitLimits } from "@/lib/link-visit-limit";
import { visitDayKey } from "@/lib/link-stats";

// Print-only vanity URL for the campground letter campaign. The URL appears
// only on mailed letters and their QR code, so every human hit is a letter
// response. Counts land in linkStats/camp (total + per-day) for the admin
// dashboard, then the visitor is forwarded to /campgrounds with UTM tags so
// GA4 attributes the session too. Counting must never block the redirect.

export const dynamic = "force-dynamic";

// Absolute URL on the canonical domain: behind App Hosting's proxy,
// request.url carries the container's internal bind address (0.0.0.0:8080),
// so building the redirect from it sends visitors to a dead end.
const DESTINATION =
  "https://fibernorth.com/campgrounds?utm_source=direct-mail&utm_medium=letter&utm_campaign=campground-fall-2026";

const BOT_UA = /bot|crawl|spider|slurp|preview|fetch|scan|monitor|curl|wget|python/i;

export async function GET(request: Request) {
  const ua = request.headers.get("user-agent") || "";

  // The old unauthenticated ?diag=...&reset=... mode is gone: counter repair
  // and reset now live behind admin auth at POST /api/admin/camp-reset.

  if (!BOT_UA.test(ua)) {
    try {
      const ip = getClientIp(request);
      // Anyone can hit this URL: at most 20 counted visits per IP per hour,
      // and at most 500 visit-log docs a day (see src/lib/link-visit-limit.ts).
      // Past either cap the visitor is still redirected as normal.
      const limits = await visitLimits("camp", ip);
      const { count, org } = limits.count ? await classifyVisit(ip) : { count: false, org: "" };
      if (count) {
        const db = getFirestore(initializeAdminApp());
        // Detroit day, so an evening visit counts on the day it happened
        // (keys before Sept 2026 are UTC days; see src/lib/link-stats.ts).
        const day = visitDayKey();
        // The write MUST be awaited: on serverless hosting the instance is
        // frozen the moment the response returns, so a fire-and-forget write
        // usually never commits (real letter responses were lost this way).
        // The race caps the wait so a hung Firestore can't stall the visitor.
        // NB: nested map, not a dotted key — with set(), a dotted key becomes a
        // literal field name ("days.2026-09-04") instead of days[date].
        const ref = db.collection("linkStats").doc("camp");
        await Promise.race([
          Promise.all([
            ref.set(
              {
                total: FieldValue.increment(1),
                days: { [day]: FieldValue.increment(1) },
                lastVisit: new Date().toISOString(),
                dayKeysTz: "America/Detroit",
              },
              { merge: true }
            ),
            // Per-visit log so the admin can tell a real letter response from
            // the owner's own testing (IP is clickable to a lookup there).
            limits.log
              ? ref.collection("visits").add({
                  ts: new Date().toISOString(),
                  ip,
                  ua: ua.slice(0, 300),
                  org,
                })
              : null,
          ]),
          new Promise((resolve) => setTimeout(resolve, 2500)),
        ]);
      }
    } catch (err) {
      // Counting is best-effort; the redirect always happens.
      console.error("linkStats/camp write failed:", err);
    }
  }
  return NextResponse.redirect(DESTINATION, 302);
}
