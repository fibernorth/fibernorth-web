import { NextResponse } from "next/server";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { classifyVisit } from "@/lib/visit-filter";

// Print-only vanity URL for the contractor letter campaign — same pattern as
// /camp. Counts land in linkStats/pros for the admin dashboard, then the
// visitor is forwarded with UTM tags for GA4. Counting never blocks the
// redirect, and the destination is absolute because request.url carries the
// container's internal bind address behind App Hosting's proxy.

export const dynamic = "force-dynamic";

const DESTINATION =
  "https://fibernorth.com/for-contractors?utm_source=direct-mail&utm_medium=letter&utm_campaign=contractor-fall-2026";

const BOT_UA = /bot|crawl|spider|slurp|preview|fetch|scan|monitor|curl|wget|python/i;

export async function GET(request: Request) {
  const ua = request.headers.get("user-agent") || "";
  if (!BOT_UA.test(ua)) {
    try {
      const ip =
        (request.headers.get("x-forwarded-for") || "")
          .split(",")[0]
          .trim() || "unknown";
      const { count, org } = await classifyVisit(ip);
      if (count) {
        const db = getFirestore(initializeAdminApp());
        const day = new Date().toISOString().slice(0, 10);
        // Awaited on purpose — see /camp: un-awaited writes are dropped when
        // the serverless instance freezes after the response returns.
        const ref = db.collection("linkStats").doc("pros");
        await Promise.race([
          Promise.all([
            ref.set(
              {
                total: FieldValue.increment(1),
                // Nested map on purpose — a dotted key in set() is a literal
                // field name, not a path into days.
                days: { [day]: FieldValue.increment(1) },
                lastVisit: new Date().toISOString(),
              },
              { merge: true }
            ),
            ref.collection("visits").add({
              ts: new Date().toISOString(),
              ip,
              ua: ua.slice(0, 300),
              org,
            }),
          ]),
          new Promise((resolve) => setTimeout(resolve, 2500)),
        ]);
      }
    } catch (err) {
      // best-effort — the redirect always happens
      console.error("linkStats/pros write failed:", err);
    }
  }
  return NextResponse.redirect(DESTINATION, 302);
}
