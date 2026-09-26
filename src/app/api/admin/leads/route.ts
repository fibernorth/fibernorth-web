import { NextResponse } from "next/server";
import { getFirestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyApiAuth } from "@/lib/api-auth";

// Admin SDK read of the pipeline. The Leads page prefers a live client
// subscription and falls back to this when the browser can't read `leads`
// directly (rules not published, or a denied read). Reads in pages of 1000
// up to MAX_LEADS; `capped` says there were more, so the page can warn.

export const dynamic = "force-dynamic";

const PAGE = 1000;
const MAX_LEADS = 5000;

export async function GET(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response;
  const col = getFirestore(initializeAdminApp()).collection("leads");
  const docs: QueryDocumentSnapshot[] = [];
  let last: QueryDocumentSnapshot | undefined;
  let capped = false;
  for (;;) {
    let q = col.orderBy("createdAt", "desc").limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    docs.push(...snap.docs);
    if (snap.size < PAGE) break;
    last = snap.docs[snap.docs.length - 1];
    if (docs.length >= MAX_LEADS) {
      capped = !(await col.orderBy("createdAt", "desc").startAfter(last).limit(1).get()).empty;
      break;
    }
  }
  return NextResponse.json({ leads: docs.map((d) => ({ id: d.id, ...d.data() })), capped });
}
