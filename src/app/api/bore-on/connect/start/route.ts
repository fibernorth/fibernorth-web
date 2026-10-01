import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyApiOwner } from "@/lib/api-auth";
import { startPairing } from "@/services/bore-on-pairing";

// Step 1 of connecting Bore-ON: returns the Bore-ON consent page for the
// owner to open. The state and verifier are kept server-side and checked on
// the way back. Owner only, like the rest of the integration settings.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await verifyApiOwner(request);
  if (!auth.authorized) return auth.response;
  try {
    const { url } = await startPairing(getFirestore(initializeAdminApp()), { uid: auth.uid!, email: auth.email });
    return NextResponse.json({ url });
  } catch (err) {
    console.error("Bore-ON pairing start failed:", err);
    return NextResponse.json({ error: "Couldn't start the connection. Try again." }, { status: 500 });
  }
}
