import { NextResponse } from "next/server";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { verifyApiAuth } from "@/lib/api-auth";
import { boreOnPayload } from "@/lib/bore-on/payload";
import type { BoreOnError } from "@/lib/bore-on/types";
import type { QuoteRequest } from "@/lib/types";

// Pushes a quote's map/terrain data to Bore-ON's Design Center (its import
// API: POST /api/v1/designs, PUT /api/v1/designs/{id}; dedup is on our
// externalRef). Admin-only; credentials come from integrationSecrets/boreOn
// so they never ride in client code or world-readable settings.

export const dynamic = "force-dynamic";

interface PushResult {
  designId?: string;
  url?: string;
  status?: string;
  replaced?: boolean;
  warnings?: Array<{ code: string; message: string }>;
}

export async function POST(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response;

  let quoteId = "";
  try {
    const body = await request.json();
    quoteId = String(body?.quoteId ?? "").trim();
  } catch {
    // fall through to the check below
  }
  if (!quoteId) {
    return NextResponse.json({ error: "quoteId required" }, { status: 400 });
  }

  const db = getFirestore(initializeAdminApp());

  const secretSnap = await db.collection("integrationSecrets").doc("boreOn").get();
  const secret = secretSnap.data() as { baseUrl?: string; apiKey?: string } | undefined;
  if (!secret?.baseUrl || !secret?.apiKey) {
    return NextResponse.json(
      { error: "Bore-ON isn't configured yet. Add the base URL and API key under Admin → Settings." },
      { status: 409 }
    );
  }

  const quoteRef = db.collection("quoteRequests").doc(quoteId);
  const quoteSnap = await quoteRef.get();
  if (!quoteSnap.exists) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  const quote = quoteSnap.data() as Omit<QuoteRequest, "id">;

  const payload = boreOnPayload(quoteId, quote);
  if (payload.map.borePaths.length === 0) {
    return NextResponse.json(
      { error: "This quote has no bore path drawn on the map yet." },
      { status: 422 }
    );
  }

  const existingDesignId = quote.boreOnDesignId || "";
  const base = secret.baseUrl.replace(/\/+$/, "");
  const target = existingDesignId
    ? `${base}/api/v1/designs/${encodeURIComponent(existingDesignId)}`
    : `${base}/api/v1/designs`;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: existingDesignId ? "PUT" : "POST",
      headers: {
        Authorization: `Bearer ${secret.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach Bore-ON. Check the base URL in Settings." },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    // Bore-ON's envelope is { error: { code, message } }; a 422 lists every
    // problem. Say what it said, in its words.
    const body = (await upstream.json().catch(() => null)) as BoreOnError | null;
    const problems = body?.errors?.length ? body.errors : body?.error ? [body.error] : [];
    const said = problems.map((p) => p.message).join(" ");
    const hint =
      upstream.status === 401
        ? "The API key was refused. Check it under Admin → Settings."
        : upstream.status === 404 && existingDesignId
          ? "The design was deleted in Bore-ON. Clear the link and send again."
          : "";
    return NextResponse.json(
      {
        error: `Bore-ON did not take the design (HTTP ${upstream.status}). ${said || hint}`.trim(),
        code: problems[0]?.code || "",
      },
      { status: 502 }
    );
  }

  const result = (await upstream.json().catch(() => ({}))) as PushResult;
  const designId = result.designId || existingDesignId;
  const url = result.url || quote.boreOnUrl || "";
  const warnings = Array.isArray(result.warnings) ? result.warnings.slice(0, 20) : [];

  const pushedAt = new Date().toISOString();
  await quoteRef.update({
    boreOnDesignId: designId ?? "",
    boreOnUrl: url,
    boreOnPushedAt: pushedAt,
    boreOnWarnings: warnings,
    ...(result.status ? { boreOnStatus: result.status } : {}),
  });

  // Mirror the push onto the linked pipeline lead so its history shows it.
  try {
    const leadSnap = await db.collection("leads").where("quoteId", "==", quoteId).limit(1).get();
    if (!leadSnap.empty) {
      const leadDoc = leadSnap.docs[0];
      const activity = (leadDoc.data().activity as unknown[]) || [];
      await leadDoc.ref.update({
        boreOnUrl: url,
        activity: [
          ...activity,
          {
            ts: pushedAt,
            type: "quote",
            text: existingDesignId ? "Design re-sent to Bore-ON" : "Design sent to Bore-ON",
          },
        ],
        updatedAt: pushedAt,
      });
    }
  } catch (err) {
    console.error("Lead Bore-ON mirror failed:", err);
  }

  return NextResponse.json({ designId, url, updated: Boolean(existingDesignId), warnings });
}
