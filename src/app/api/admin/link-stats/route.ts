import { NextResponse } from "next/server";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { verifyApiAuth } from "@/lib/api-auth";
import { detroitDayStartIso, lastDays, sumLastDays } from "@/lib/link-stats";
import { todayISO } from "@/lib/leads";

// Reads the letter-campaign counters and recent visits with the Admin SDK,
// which bypasses Firestore security rules. The dashboard uses this instead of
// a direct client read so the card works even when the client read rules for
// linkStats aren't published. Admin Bearer token still required here.

export const dynamic = "force-dynamic";

interface Counter {
  total: number;
  days: Record<string, number>;
  lastVisit: string | null;
  /** Visits in the last 7 Detroit days (today included). */
  week: number;
}

async function readDoc(
  db: FirebaseFirestore.Firestore,
  id: string
): Promise<{ counter: Counter; visits: unknown[] }> {
  const ref = db.collection("linkStats").doc(id);
  const today = todayISO();
  const weekStart = detroitDayStartIso(lastDays(today, 7)[6]);
  const [snap, visitsSnap, weekSnap] = await Promise.all([
    ref.get(),
    ref.collection("visits").orderBy("ts", "desc").limit(12).get().catch(() => null),
    // Count from the per-visit log, which has exact times, so "last 7 days"
    // is right whatever time zone the older day keys were written in.
    ref.collection("visits").where("ts", ">=", weekStart).count().get().catch(() => null),
  ]);
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const days = (data.days as Record<string, number>) ?? {};
  return {
    counter: {
      total: typeof data.total === "number" ? data.total : 0,
      days,
      lastVisit: typeof data.lastVisit === "string" ? data.lastVisit : null,
      week: weekSnap ? weekSnap.data().count : sumLastDays(days, today, 7),
    },
    visits: visitsSnap
      ? visitsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      : [],
  };
}

export async function GET(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response;

  try {
    const db = getFirestore(initializeAdminApp());
    const [camp, pros] = await Promise.all([
      readDoc(db, "camp"),
      readDoc(db, "pros"),
    ]);
    return NextResponse.json({
      camp: camp.counter,
      pros: pros.counter,
      campVisits: camp.visits,
      prosVisits: pros.visits,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "read failed" },
      { status: 500 }
    );
  }
}
