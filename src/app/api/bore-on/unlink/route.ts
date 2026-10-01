import { NextResponse } from "next/server";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyApiAuth } from "@/lib/api-auth";

// "Start over" for a quote whose Bore-ON design is gone or wrong: forgets the
// link so the next send makes a fresh design. Nothing is deleted in Bore-ON,
// and the quote's lines and prices are untouched. Admin only.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response;

  let quoteId = "";
  try {
    quoteId = String((await request.json())?.quoteId ?? "").trim();
  } catch {
    // falls through to the check below
  }
  if (!quoteId) return NextResponse.json({ error: "quoteId required" }, { status: 400 });

  const db = getFirestore(initializeAdminApp());
  const quoteRef = db.collection("quoteRequests").doc(quoteId);
  const quoteSnap = await quoteRef.get();
  if (!quoteSnap.exists) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  const quote = quoteSnap.data() as { leadId?: string };

  await quoteRef.update({
    boreOnDesignId: FieldValue.delete(),
    boreOnUrl: FieldValue.delete(),
    boreOnStatus: FieldValue.delete(),
    boreOnWarnings: FieldValue.delete(),
    boreOnPushedAt: FieldValue.delete(),
  });

  // The pipeline lead mirrors the link; clear it there too. A system line, not a touch.
  try {
    const leadRef = quote.leadId
      ? db.collection("leads").doc(quote.leadId)
      : (await db.collection("leads").where("quoteId", "==", quoteId).limit(1).get()).docs[0]?.ref;
    const leadSnap = leadRef ? await leadRef.get() : null;
    if (leadRef && leadSnap?.exists) {
      const at = new Date().toISOString();
      await leadRef.update({
        boreOnUrl: FieldValue.delete(),
        activity: FieldValue.arrayUnion({ ts: at, type: "system", text: "Bore-ON link cleared" }),
        updatedAt: at,
      });
    }
  } catch (err) {
    console.error("Lead Bore-ON unlink mirror failed:", err);
  }

  return NextResponse.json({ ok: true });
}
