import { NextResponse } from "next/server";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { verifyApiAuth } from "@/lib/api-auth";

// Reads the letter-campaign counters and recent visits with the Admin SDK,
// which bypasses Firestore security rules. The dashboard uses this instead of
// a direct client read so the card works even when the client read rules for
// linkStats aren't published. Admin Bearer token still required here.

export const dynamic = "force-dynamic";

interface Counter {
  total: number;
  days: Record<string, number>;
  lastVisit: string | null;
}

async function readDoc(
  db: FirebaseFirestore.Firestore,
  id: string
): Promise<{ counter: Counter; visits: unknown[] }> {
  const ref = db.collection("linkStats").doc(id);
  const [snap, visitsSnap] = await Promise.all([
    ref.get(),
    ref.collection("visits").orderBy("ts", "desc").limit(12).get().catch(() => null),
  ]);
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  return {
    counter: {
      total: typeof data.total === "number" ? data.total : 0,
      days: (data.days as Record<string, number>) ?? {},
      lastVisit: typeof data.lastVisit === "string" ? data.lastVisit : null,
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
