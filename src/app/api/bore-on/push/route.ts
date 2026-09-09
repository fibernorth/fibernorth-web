import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { verifyApiAuth } from "@/lib/api-auth";

// Pushes a quote's map/terrain data to Bore-ON's Design Center per the
// import API spec (scratchpad/bore-on-design-api-spec.md, shared with the
// Bore-ON side). Admin-only; credentials come from integrationSecrets/boreOn
// so they never ride in client code or world-readable settings.

export const dynamic = "force-dynamic";

interface LatLng {
  lat: number;
  lng: number;
}
interface AnnPath {
  type?: string;
  points?: LatLng[];
}
interface Annotation {
  center?: LatLng;
  zoom?: number;
  markers?: Array<{ type?: string; position?: LatLng; label?: string }>;
  paths?: AnnPath[];
  labels?: Array<{ position?: LatLng; text?: string }>;
  terrain?: { dists?: number[]; elevs?: number[] } | null;
  runFeet?: number;
  segmentFeet?: number[];
  service?: string;
  pipeSize?: string;
  address?: string;
}

function buildPayload(
  quoteId: string,
  quote: Record<string, unknown>
): Record<string, unknown> {
  const ann = (quote.mapAnnotation ?? {}) as Annotation;
  const paths = ann.paths ?? [];

  const borePaths = paths
    .filter((p) => (p.type ?? "") === "bore-path" && (p.points?.length ?? 0) >= 2)
    .map((p, i) => ({
      id: `bore-${i + 1}`,
      service: ann.service || (quote.serviceType as string) || "",
      points: p.points,
      ...(i === 0 && ann.segmentFeet?.length ? { segmentFeet: ann.segmentFeet } : {}),
      ...(i === 0 && ann.runFeet ? { totalFeet: ann.runFeet } : {}),
    }));

  const existingUtilities = paths
    .filter(
      (p) => (p.type ?? "").startsWith("existing-") && (p.points?.length ?? 0) >= 2
    )
    .map((p) => ({
      service: (p.type as string).slice("existing-".length),
      points: p.points,
    }));

  const terrain =
    ann.terrain?.dists?.length && ann.terrain.elevs?.length
      ? {
          samples: ann.terrain.dists.length,
          distFt: ann.terrain.dists,
          elevFt: ann.terrain.elevs,
          sourceDatum: "USGS 3DEP 1m, NAVD88 feet",
        }
      : undefined;

  return {
    specVersion: 1,
    externalRef: `fibernorth:quote:${quoteId}`,
    source: "fibernorth.com",
    createdAt: new Date().toISOString(),
    job: {
      customerName: (quote.name as string) || "",
      address: ann.address || (quote.address as string) || "",
      serviceType: ann.service || (quote.serviceType as string) || "",
      ...(ann.pipeSize ? { pipeSize: ann.pipeSize } : {}),
      ...(quote.description ? { notes: quote.description } : {}),
    },
    map: {
      ...(ann.center ? { center: ann.center, zoom: ann.zoom ?? 18 } : {}),
      borePaths,
      existingUtilities,
      markers: (ann.markers ?? []).filter((m) => m.position),
      labels: (ann.labels ?? []).filter((l) => l.position && l.text),
    },
    ...(terrain ? { terrain } : {}),
  };
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
  const secret = secretSnap.data() as
    | { baseUrl?: string; apiKey?: string }
    | undefined;
  if (!secret?.baseUrl || !secret?.apiKey) {
    return NextResponse.json(
      {
        error:
          "Bore-ON isn't configured yet. Add the base URL and API key under Admin → Settings.",
      },
      { status: 409 }
    );
  }

  const quoteRef = db.collection("quoteRequests").doc(quoteId);
  const quoteSnap = await quoteRef.get();
  if (!quoteSnap.exists) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  const quote = quoteSnap.data() as Record<string, unknown>;

  const payload = buildPayload(quoteId, quote);
  if ((payload.map as { borePaths: unknown[] }).borePaths.length === 0) {
    return NextResponse.json(
      { error: "This quote has no bore path drawn on the map yet." },
      { status: 422 }
    );
  }

  const existingDesignId = (quote.boreOnDesignId as string) || "";
  const base = secret.baseUrl.replace(/\/+$/, "");
  const target = existingDesignId
    ? `${base}/api/v1/designs/${existingDesignId}`
    : `${base}/api/v1/designs`;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: existingDesignId ? "PUT" : "POST",
      headers: {
        Authorization: `Bearer ${secret.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach Bore-ON. Check the base URL in Settings." },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return NextResponse.json(
      {
        error: `Bore-ON rejected the design (HTTP ${upstream.status}).`,
        detail: detail.slice(0, 500),
      },
      { status: 502 }
    );
  }

  const result = (await upstream.json().catch(() => ({}))) as {
    designId?: string;
    url?: string;
  };
  const designId = result.designId || existingDesignId;
  const url = result.url || (quote.boreOnUrl as string) || "";

  await quoteRef.update({
    boreOnDesignId: designId ?? "",
    boreOnUrl: url,
    boreOnPushedAt: new Date().toISOString(),
  });

  return NextResponse.json({ designId, url, updated: Boolean(existingDesignId) });
}
