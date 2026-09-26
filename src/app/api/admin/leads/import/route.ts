import { NextResponse } from "next/server";
import { z } from "zod";
import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyApiAuth } from "@/lib/api-auth";
import { ImportError, applyImport, listImportRuns, previewImport, undoImportRun } from "@/services/lead-import-runs";

// One-click imports so every contact FiberNorth already has lives in the
// pipeline, and letter logging on everyone a letter went to. Every run is
// previewed first:
//
//   { source, letter?, date? }                       dry run: counts + up to 20 names each, nothing written
//   { source, letter?, date?, confirm: true, expect } apply (expect = the preview's create/update counts)
//   { action: "undo", runId }                        undo an applied run
//   GET                                              the latest runs, for the Undo list
//
//   source "quotes"        every quoteRequests doc without a lead -> lead
//   source "campgrounds"   the 106 campground letter recipients (+ letter N on that letter's list)
//   source "contractors"   the 278 contractors (+ letter N on that letter's list)
//
// All idempotent (keyed by externalId, new leads created with deterministic
// ids), so re-running is safe. See src/services/lead-import-runs.ts.

export const dynamic = "force-dynamic";

const runSchema = z.object({
  source: z.enum(["quotes", "campgrounds", "contractors"]),
  letter: z.number().int().min(1).max(6).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dryRun: z.boolean().optional(),
  confirm: z.boolean().optional(),
  expect: z.object({ create: z.number().int().min(0), update: z.number().int().min(0) }).optional(),
});
const undoSchema = z.object({ action: z.literal("undo"), runId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/) });

function fail(e: unknown) {
  if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("Lead import failed:", e);
  return NextResponse.json({ error: "Import failed" }, { status: 500 });
}

export async function GET(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response;
  try {
    return NextResponse.json({ runs: await listImportRuns(getFirestore(initializeAdminApp())) });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const db = getFirestore(initializeAdminApp());
  const by = auth.email || auth.uid || "";

  if ((body as { action?: unknown })?.action === "undo") {
    const u = undoSchema.safeParse(body);
    if (!u.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    // TODO(owner-gate): undoing a bulk run is an owner-only tool once
    // verifyOwnerCaller lands (src/lib/server-action-auth.ts).
    try {
      return NextResponse.json({ ok: true, ...(await undoImportRun(db, u.data.runId, { by })) });
    } catch (e) {
      return fail(e);
    }
  }

  const parsed = runSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { source, letter, date, confirm, expect } = parsed.data;
  const params = { source, ...(letter ? { letter } : {}), ...(date ? { date } : {}) };

  try {
    // Anything not explicitly confirmed is a dry run.
    if (!confirm || parsed.data.dryRun) return NextResponse.json(await previewImport(db, params));
    // TODO(owner-gate): applying a bulk run is an owner-only tool once
    // verifyOwnerCaller lands (src/lib/server-action-auth.ts).
    const r = await applyImport(db, params, { by, expect });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return fail(e);
  }
}
