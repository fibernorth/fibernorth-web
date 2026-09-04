import { NextResponse } from "next/server";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// Print-only vanity URL for the campground letter campaign. The URL appears
// only on mailed letters and their QR code, so every human hit is a letter
// response. Counts land in linkStats/camp (total + per-day) for the admin
// dashboard, then the visitor is forwarded to /campgrounds with UTM tags so
// GA4 attributes the session too. Counting must never block the redirect.

export const dynamic = "force-dynamic";

const DESTINATION =
  "/campgrounds?utm_source=direct-mail&utm_medium=letter&utm_campaign=campground-fall-2026";

const BOT_UA = /bot|crawl|spider|slurp|preview|fetch|scan|monitor|curl|wget|python/i;

export async function GET(request: Request) {
  const ua = request.headers.get("user-agent") || "";
  if (!BOT_UA.test(ua)) {
    try {
      const db = getFirestore(initializeAdminApp());
      const day = new Date().toISOString().slice(0, 10);
      // Fire and forget — a slow write shouldn't delay the visitor.
      db.collection("linkStats")
        .doc("camp")
        .set(
          {
            total: FieldValue.increment(1),
            [`days.${day}`]: FieldValue.increment(1),
            lastVisit: new Date().toISOString(),
          },
          { merge: true }
        )
        .catch(() => {});
    } catch {
      // Counting is best-effort; the redirect always happens.
    }
  }
  return NextResponse.redirect(new URL(DESTINATION, request.url), 302);
}
