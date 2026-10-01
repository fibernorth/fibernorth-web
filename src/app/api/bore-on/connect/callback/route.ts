import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { publicOrigin } from "@/lib/google-calendar";
import { completePairing } from "@/services/bore-on-pairing";

// Step 2: Bore-ON sends the admin's browser back here with a one-time code.
// No Firebase auth on this route (it's a browser redirect); the state check
// ties it to a start request the owner made in the last ten minutes, and the
// code is worthless without the verifier only this server holds.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = publicOrigin(request.url);
  let outcome: string;
  try {
    outcome = await completePairing(getFirestore(initializeAdminApp()), new URL(request.url).searchParams);
  } catch (err) {
    console.error("Bore-ON pairing callback failed:", err);
    outcome = "exchange";
  }
  return NextResponse.redirect(`${origin}/admin/settings?boreon=${encodeURIComponent(outcome)}`);
}
