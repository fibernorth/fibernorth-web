import { NextResponse } from "next/server";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// Print-only vanity URL for the contractor letter campaign — same pattern as
// /camp. Counts land in linkStats/pros for the admin dashboard, then the
// visitor is forwarded with UTM tags for GA4. Counting never blocks the
// redirect, and the destination is absolute because request.url carries the
// container's internal bind address behind App Hosting's proxy.

export const dynamic = "force-dynamic";

const DESTINATION =
  "https://fibernorth.com/services?utm_source=direct-mail&utm_medium=letter&utm_campaign=contractor-fall-2026";

const BOT_UA = /bot|crawl|spider|slurp|preview|fetch|scan|monitor|curl|wget|python/i;

export async function GET(request: Request) {
  const ua = request.headers.get("user-agent") || "";
  if (!BOT_UA.test(ua)) {
    try {
      const db = getFirestore(initializeAdminApp());
      const day = new Date().toISOString().slice(0, 10);
      db.collection("linkStats")
        .doc("pros")
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
      // best-effort
    }
  }
  return NextResponse.redirect(DESTINATION, 302);
}
