import { NextResponse } from "next/server";
import { getFirestore, FieldValue, FieldPath } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyApiAuth } from "@/lib/api-auth";
import { rekeyDays } from "@/lib/link-stats";

// Admin-only maintenance for the letter-campaign counters (linkStats/camp and
// linkStats/pros). Replaces the old unauthenticated /camp?diag=... mode.
//
//   POST { "action": "repair" }  fold legacy dotted "days.YYYY-MM-DD" fields
//                                into the days map; returns both docs.
//   POST { "action": "reset", "confirm": "zero-now" }
//                                zero both counters and delete visit logs.
//   POST { "action": "rekey" }   rebuild the days map in Detroit days from
//                                the visit log (day keys were UTC before
//                                Sept 2026); days older than the log stay.
//
// Needs an admin Bearer token (Authorization: Bearer <Firebase ID token>).

export const dynamic = "force-dynamic";

const DOC_IDS = ["camp", "pros"] as const;

export async function POST(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response;

  let body: { action?: string; confirm?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body */
  }
  const action = body.action;
  if (action !== "repair" && action !== "reset" && action !== "rekey") {
    return NextResponse.json({ error: 'action must be "repair", "reset" or "rekey"' }, { status: 400 });
  }
  if (action === "reset" && body.confirm !== "zero-now") {
    return NextResponse.json({ error: 'reset needs confirm: "zero-now"' }, { status: 400 });
  }

  try {
    const db = getFirestore(initializeAdminApp());
    const out: Record<string, unknown> = {};
    for (const id of DOC_IDS) {
      const ref = db.collection("linkStats").doc(id);
      if (action === "reset") {
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
        await ref.set({ total: 0, days: {}, lastVisit: null }, { merge: false });
        out[id] = { reset: true, visitsCleared: cleared };
        continue;
      }

      if (action === "rekey") {
        const [snap, visits] = await Promise.all([ref.get(), ref.collection("visits").select("ts").get()]);
        if (!snap.exists) {
          out[id] = null;
          continue;
        }
        const days = (snap.data()?.days ?? {}) as Record<string, number>;
        const next = rekeyDays(days, visits.docs.map((d) => String(d.get("ts") ?? "")));
        // update() replaces the whole days map (set+merge would keep old keys).
        await ref.update({ days: next, dayKeysTz: "America/Detroit" });
        out[id] = { before: days, after: next, visits: visits.size };
        continue;
      }

      const snap = await ref.get();
      const data = snap.data() ?? {};
      const days: Record<string, number> =
        typeof data.days === "object" && data.days ? { ...data.days } : {};
      const badKeys = Object.keys(data).filter((k) => /^days\.\d{4}-\d{2}-\d{2}$/.test(k));
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
    console.log(`linkStats ${action} by ${auth.uid}`);
    return NextResponse.json({ action, docs: out });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed" },
      { status: 500 }
    );
  }
}
