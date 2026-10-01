import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyApiOwner } from "@/lib/api-auth";
import { disconnectBoreOn } from "@/services/bore-on-pairing";

// Forgets the Bore-ON key and callback secret. Owner only. Revoking the key on
// Bore-ON's side (Admin → Integrations → Disconnect) is a separate step there.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await verifyApiOwner(request);
  if (!auth.authorized) return auth.response;
  try {
    await disconnectBoreOn(getFirestore(initializeAdminApp()), { uid: auth.uid!, email: auth.email });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Bore-ON disconnect failed:", err);
    return NextResponse.json({ error: "Couldn't disconnect. Try again." }, { status: 500 });
  }
}
