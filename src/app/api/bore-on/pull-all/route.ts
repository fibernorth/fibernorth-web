import { NextResponse } from "next/server";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { verifyApiAuth } from "@/lib/api-auth";
import { applyBoreOnReadback, fetchBoreOnReadback, loadBoreOnSecrets } from "@/services/bore-on";
import type { QuoteRequest } from "@/lib/types";

// "Pull all from Bore-ON": every quote that was ever sent to Bore-ON gets its
// design read back and applied, in one go. A quote whose design has not
// changed since the last pull is left alone (no write, no history line), so
// this is safe to run twice. Admin-only; all writes awaited.

export const dynamic = "force-dynamic";

const MAX_QUOTES = 200;
const AT_A_TIME = 3;

type Outcome = "pulled" | "repriced" | "unchanged" | "skipped";

export async function POST(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response;

  const db = getFirestore(initializeAdminApp());
  const secrets = await loadBoreOnSecrets(db);
  if (!secrets.baseUrl || !secrets.apiKey) {
    return NextResponse.json(
      { error: "Bore-ON isn't configured yet. Add the base URL and API key under Admin → Settings." },
      { status: 409 }
    );
  }

  const snap = await db.collection("quoteRequests").where("boreOnDesignId", ">", "").limit(MAX_QUOTES).get();
  const quotes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<QuoteRequest, "id">) }));

  let pulled = 0;
  let repriced = 0;
  let unchanged = 0;
  const skipped: Array<{ quoteId: string; name: string; reason: string }> = [];

  const one = async (q: QuoteRequest & { id: string }): Promise<Outcome> => {
    const readback = await fetchBoreOnReadback(secrets, q.boreOnDesignId!);
    if (!readback) {
      skipped.push({ quoteId: q.id, name: q.name || q.address || q.id, reason: "could not read the design" });
      return "skipped";
    }
    if (q.boreOnResult && readback.updatedAt && readback.updatedAt === q.boreOnUpdatedAt) return "unchanged";
    const { id, ...rest } = q;
    const applied = await applyBoreOnReadback(db, id, rest, readback, { url: readback.url });
    return applied.repriced ? "repriced" : "pulled";
  };

  for (let i = 0; i < quotes.length; i += AT_A_TIME) {
    const outcomes = await Promise.all(quotes.slice(i, i + AT_A_TIME).map(one));
    for (const o of outcomes) {
      if (o === "unchanged") unchanged += 1;
      else if (o === "skipped") continue;
      else {
        pulled += 1;
        if (o === "repriced") repriced += 1;
      }
    }
  }

  return NextResponse.json({ total: quotes.length, pulled, repriced, unchanged, skipped });
}
