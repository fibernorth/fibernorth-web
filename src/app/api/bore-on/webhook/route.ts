import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyBoreOnSignature } from "@/lib/bore-on/signature";
import { quoteIdFromExternalRef } from "@/lib/bore-on/types";
import { rateLimited } from "@/lib/proposal-server";
import { applyBoreOnReadback, fetchBoreOnReadback, loadBoreOnSecrets } from "@/services/bore-on";
import type { QuoteRequest } from "@/lib/types";

// Bore-ON calls this when a design we pushed is drawn up (design.designed),
// approved (design.approved) or changed in a way that moves the price
// (design.updated). The body is small; we then GET the design back with our
// API key for the bore length, pits, estimate and plan image, and re-price
// the quote from it.
//
// Auth: HMAC-SHA256 over `${timestamp}.${rawBody}` under the shared secret
// stored admin-only at integrationSecrets/boreOn.webhookSecret (the same
// secret goes on the CRM's key in Bore-ON, Admin → Integrations).
// Semantics Bore-ON relies on: 2xx accepted, any 4xx final (no retry),
// 5xx retried three times. A repeat deliveryId is a 200 no-op: each delivery
// is claimed with create() at boreOnDeliveries/{sha256(deliveryId)}, so a
// replay inside the signature window (A, B, A) or two copies racing never
// apply twice. A delivery that fails before it is applied gives its claim
// back, so Bore-ON's retry still runs.

export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  event: z.enum(["design.designed", "design.approved", "design.updated"]),
  deliveryId: z.string().min(1).max(200),
  designId: z.string().min(1).max(200),
  externalRef: z.string().min(1).max(300),
  status: z.string().max(60),
  boreOnStatus: z.enum(["draft", "in-review", "approved", "transferred", "archived"]),
  url: z.string().max(2000),
  apiUrl: z.string().max(2000),
  updatedAt: z.string().max(60),
});

export async function POST(request: Request) {
  if (rateLimited(request, 120)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const db = getFirestore(initializeAdminApp());
  const secrets = await loadBoreOnSecrets(db);
  if (!secrets.webhookSecret) {
    return NextResponse.json(
      { error: "Bore-ON callbacks aren't configured. Set the callback secret under Admin → Settings." },
      { status: 409 }
    );
  }

  const rawBody = await request.text();
  const check = verifyBoreOnSignature({
    secret: secrets.webhookSecret,
    timestamp: request.headers.get(TIMESTAMP_HEADER),
    signature: request.headers.get(SIGNATURE_HEADER),
    rawBody,
  });
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = payloadSchema.safeParse(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }
  const p = parsed.data;

  const quoteId = quoteIdFromExternalRef(p.externalRef);
  if (!quoteId) return NextResponse.json({ error: "Not our design" }, { status: 404 });
  const quoteSnap = await db.collection("quoteRequests").doc(quoteId).get();
  if (!quoteSnap.exists) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  const quote = quoteSnap.data() as Omit<QuoteRequest, "id">;
  if (quote.boreOnDeliveryId === p.deliveryId) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const claim = db.collection("boreOnDeliveries").doc(createHash("sha256").update(p.deliveryId).digest("hex"));
  try {
    await claim.create({
      deliveryId: p.deliveryId,
      event: p.event,
      designId: p.designId,
      quoteId,
      status: "applying",
      at: new Date().toISOString(),
    });
  } catch (err) {
    const code = (err as { code?: unknown })?.code;
    if (code === 6 || code === "already-exists" || /ALREADY_EXISTS/.test(String((err as Error)?.message))) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw err;
  }
  const release = () => claim.delete().catch((e: unknown) => console.error("Releasing Bore-ON delivery claim failed:", e));

  // The readback URL is built from OUR base URL, never taken from the body,
  // so the API key only ever goes to Bore-ON.
  const readback = await fetchBoreOnReadback(secrets, p.designId);
  if (!readback) {
    // The design exists; we just could not read it. A 5xx makes Bore-ON try
    // again (three times), then record the failure on the design. The claim
    // is given back so that retry runs.
    await release();
    return NextResponse.json({ error: "Could not read the design back" }, { status: 503 });
  }

  let applied;
  try {
    applied = await applyBoreOnReadback(db, quoteId, quote, readback, {
      event: p.event,
      deliveryId: p.deliveryId,
      url: p.url,
      updatedAt: p.updatedAt,
    });
  } catch (err) {
    await release();
    throw err;
  }
  await claim.update({ status: "applied", appliedAt: new Date().toISOString() }).catch(() => {});
  return NextResponse.json({ ok: true, ...applied });
}
