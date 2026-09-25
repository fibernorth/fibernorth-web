import { NextResponse } from "next/server";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { verifyApiAuth } from "@/lib/api-auth";
import { applyBoreOnReadback, fetchBoreOnReadback, loadBoreOnSecrets } from "@/services/bore-on";
import type { QuoteRequest } from "@/lib/types";

// "Pull from Bore-ON": the estimator asks for the design now instead of
// waiting for the callback. Same readback, same re-price. Admin-only.

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
  if (!quoteId) return NextResponse.json({ error: "quoteId required" }, { status: 400 });

  const db = getFirestore(initializeAdminApp());
  const secrets = await loadBoreOnSecrets(db);
  if (!secrets.baseUrl || !secrets.apiKey) {
    return NextResponse.json(
      { error: "Bore-ON isn't configured yet. Add the base URL and API key under Admin → Settings." },
      { status: 409 }
    );
  }

  const quoteSnap = await db.collection("quoteRequests").doc(quoteId).get();
  if (!quoteSnap.exists) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  const quote = quoteSnap.data() as Omit<QuoteRequest, "id">;
  if (!quote.boreOnDesignId) {
    return NextResponse.json({ error: "This quote hasn't been sent to Bore-ON yet." }, { status: 422 });
  }

  const readback = await fetchBoreOnReadback(secrets, quote.boreOnDesignId);
  if (!readback) {
    return NextResponse.json({ error: "Couldn't read the design from Bore-ON. Try again in a minute." }, { status: 502 });
  }

  const applied = await applyBoreOnReadback(db, quoteId, quote, readback, { url: readback.url });
  return NextResponse.json({ ok: true, status: readback.status, ...applied });
}
