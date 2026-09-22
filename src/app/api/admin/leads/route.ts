import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyApiAuth } from "@/lib/api-auth";

// Admin SDK read of the pipeline. The Leads page prefers a live client
// subscription and falls back to this when the Firestore rules for `leads`
// haven't been published yet (rules deploys are manual on this project).

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response;
  const snap = await getFirestore(initializeAdminApp())
    .collection("leads")
    .orderBy("createdAt", "desc")
    .limit(1000)
    .get();
  return NextResponse.json({ leads: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
}
