import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyApiAuth } from "@/lib/api-auth";
import { RestoreError, restorePreviousBoreOnPrices } from "@/services/bore-on";

// "Put back previous Bore-ON prices" on one quote: undo the last Bore-ON
// re-price, as long as nobody has changed the quote since. Admin-only.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response;

  let quoteId = "";
  try {
    const body = await request.json();
    quoteId = String(body?.quoteId ?? "").trim();
  } catch {
    // checked below
  }
  if (!quoteId || quoteId.includes("/") || quoteId.length > 200) {
    return NextResponse.json({ error: "quoteId required" }, { status: 400 });
  }

  try {
    const r = await restorePreviousBoreOnPrices(getFirestore(initializeAdminApp()), quoteId);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof RestoreError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("Bore-ON put-back failed:", e);
    return NextResponse.json({ error: "Couldn't put the prices back" }, { status: 500 });
  }
}
