import { NextResponse } from "next/server";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore, FieldValue, FieldPath } from "firebase-admin/firestore";
import { classifyVisit } from "@/lib/visit-filter";

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
    // reset=zero-now zeroes both counters and clears the visit logs for a
    // clean baseline (removes pre-filter test hits). Otherwise this repairs
    // legacy dotted-key docs and reports both counter docs; idempotent.
    const doReset =
      new URL(request.url).searchParams.get("reset") === "zero-now";
    try {
      const db = getFirestore(initializeAdminApp());
      const out: Record<string, unknown> = {};
      for (const id of ["camp", "pros"]) {
        const ref = db.collection("linkStats").doc(id);
        if (doReset) {
          // Delete the visits subcollection in batches, then zero the doc.
          let cleared = 0;
          while (true) {
            const batch = await ref.collection("visits").limit(300).get();
            if (batch.empty) break;
            const wb = db.batch();
            batch.docs.forEach((d) => wb.delete(d.ref));
            await wb.commit();
            cleared += batch.size;
            if (batch.size < 300) break;
          }
          await ref.set(
            { total: 0, days: {}, lastVisit: null },
            { merge: false }
          );
          out[id] = { reset: true, visitsCleared: cleared };
          continue;
        }
        const snap = await ref.get();
        const data = snap.data() ?? {};
        const days: Record<string, number> =
          typeof data.days === "object" && data.days ? { ...data.days } : {};
        const badKeys = Object.keys(data).filter((k) =>
          /^days\.\d{4}-\d{2}-\d{2}$/.test(k)
        );
        if (badKeys.length > 0) {
          for (const k of badKeys) {
            const d = k.slice(5);
            days[d] = (days[d] ?? 0) + Number(data[k] ?? 0);
          }
          await ref.set({ days }, { merge: true });
          // FieldPath addresses the literal dotted name; plain update paths
          // would descend into the days map instead.
          for (const k of badKeys) {
            await ref.update(new FieldPath(k), FieldValue.delete());
          }
        }
        out[id] = (await ref.get()).data() ?? null;
      }
      return NextResponse.json({ migrated: !doReset, reset: doReset, docs: out });
    } catch (err) {
      return NextResponse.json({
        migrated: false,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
    }
  }

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
              },
              { merge: true }
            ),
            // Per-visit log so the admin can tell a real letter response from
            // the owner's own testing (IP is clickable to a lookup there).
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
      // Counting is best-effort; the redirect always happens.
      console.error("linkStats/camp write failed:", err);
    }
  }
  return NextResponse.redirect(DESTINATION, 302);
}
