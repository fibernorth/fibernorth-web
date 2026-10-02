import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyApiAuth } from "@/lib/api-auth";
import { cardCodeOrEmpty, cardDocId, cardRecord, type CardKind } from "@/lib/pitch/card-registry";

// The team's cards by number, for the pitch calling app. Anyone signed in to
// the app (same accounts as the app's sign-in) gets every card: GET with
// ?id opens one, GET alone lists them, POST keeps one. A stored card is never
// changed (its number is worked out from the setup), so a printed number
// always opens that card.

export const dynamic = "force-dynamic";

const COL = "pitchCards";

export async function GET(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response;
  const db = getFirestore(initializeAdminApp());
  const raw = new URL(request.url).searchParams.get("id");
  if (raw === null) {
    // Every card the team has made, newest first.
    const snap = await db.collection(COL).orderBy("createdAt", "desc").limit(300).get();
    return NextResponse.json(
      { cards: snap.docs.map((d) => ({ kind: d.get("kind"), id: d.get("id"), createdAt: d.get("createdAt") })) },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  const id = cardCodeOrEmpty(raw);
  if (!id) return NextResponse.json({ error: "That isn't a card number (like 5665-JJC)." }, { status: 400 });
  const [pitch, signs] = await Promise.all(
    (["pitch", "signs"] as CardKind[]).map((k) => db.collection(COL).doc(cardDocId(k, id)).get())
  );
  return NextResponse.json(
    {
      id,
      pitch: pitch.exists ? pitch.get("settings") ?? null : null,
      signs: signs.exists ? signs.get("settings") ?? null : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response;
  const text = await request.text();
  if (text.length > 20_000) return NextResponse.json({ error: "Too big" }, { status: 413 });
  let body: { kind?: unknown; settings?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const kind = body.kind === "pitch" || body.kind === "signs" ? body.kind : null;
  if (!kind) return NextResponse.json({ error: "kind must be pitch or signs" }, { status: 400 });
  const rec = cardRecord(kind, body.settings);
  if (!rec) return NextResponse.json({ error: "That setup doesn't make a card." }, { status: 422 });

  const db = getFirestore(initializeAdminApp());
  try {
    await db
      .collection(COL)
      .doc(cardDocId(kind, rec.id))
      .create({ kind, id: rec.id, settings: rec.settings, createdAt: new Date().toISOString() });
  } catch (err) {
    // Already kept: same number, same card.
    if ((err as { code?: number }).code !== 6) {
      console.error("pitch card save failed:", err);
      return NextResponse.json({ error: "Couldn't save the card." }, { status: 500 });
    }
  }
  return NextResponse.json({ id: rec.id });
}
