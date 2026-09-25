import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyApiAuth } from "@/lib/api-auth";

// Admin SDK read of one quote, used when client Firestore reads are denied.

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response;
  const { id } = await ctx.params;
  const snap = await getFirestore(initializeAdminApp()).collection("quoteRequests").doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ quote: { id: snap.id, ...snap.data() } });
}
