import { NextResponse } from "next/server";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

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

  // Diagnostic mode: perform the same counter write, but report the outcome
  // and current doc as JSON instead of redirecting. Visit counts aren't
  // sensitive; the token just keeps casual crawlers off it.
  const diag = new URL(request.url).searchParams.get("diag");
  if (diag === "fn-diag-2026") {
    const day = new Date().toISOString().slice(0, 10);
    try {
      const db = getFirestore(initializeAdminApp());
      const ref = db.collection("linkStats").doc("camp");
      await ref.set(
        {
          total: FieldValue.increment(1),
          [`days.${day}`]: FieldValue.increment(1),
          lastVisit: new Date().toISOString(),
        },
        { merge: true }
      );
      const snap = await ref.get();
      return NextResponse.json({ writeOk: true, doc: snap.data() ?? null });
    } catch (err) {
      return NextResponse.json({
        writeOk: false,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
    }
  }

  if (!BOT_UA.test(ua)) {
    try {
      const db = getFirestore(initializeAdminApp());
      const day = new Date().toISOString().slice(0, 10);
      // The write MUST be awaited: on serverless hosting the instance is
      // frozen the moment the response returns, so a fire-and-forget write
      // usually never commits (real letter responses were lost this way).
      // The race caps the wait so a hung Firestore can't stall the visitor.
      await Promise.race([
        db
          .collection("linkStats")
          .doc("camp")
          .set(
            {
              total: FieldValue.increment(1),
              [`days.${day}`]: FieldValue.increment(1),
              lastVisit: new Date().toISOString(),
            },
            { merge: true }
          ),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch (err) {
      // Counting is best-effort; the redirect always happens.
      console.error("linkStats/camp write failed:", err);
    }
  }
  return NextResponse.redirect(DESTINATION, 302);
}
