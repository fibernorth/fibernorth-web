import { NextResponse } from "next/server";
import { z } from "zod";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { verifyApiAuth } from "@/lib/api-auth";
import { loadBoreOnSecrets } from "@/services/bore-on";
import { pullAllBoreOn } from "@/services/bore-on-pull-all";

// "Pull all from Bore-ON": every quote that was ever sent to Bore-ON gets its
// design read back and applied, in one go. Two steps:
//
//   {}  or { dryRun: true }             preview: which quotes would re-price, old → new total. Nothing written.
//   { confirm: true, approved: {id: newTotal} }
//                                       apply. A quote re-prices only when it was in the preview at the
//                                       same new total; anything else that would change price is held
//                                       and reported ("run the preview again").
//
// A quote whose design has not changed since the last pull is left alone (no
// write, no history line), so this is safe to run twice. Admin-only; all
// writes awaited.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  dryRun: z.boolean().optional(),
  confirm: z.boolean().optional(),
  approved: z.record(z.string().max(200), z.number().nullable()).optional(),
});

export async function POST(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response;

  let raw: unknown = {};
  try {
    const text = await request.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const db = getFirestore(initializeAdminApp());
  const secrets = await loadBoreOnSecrets(db);
  if (!secrets.baseUrl || !secrets.apiKey) {
    return NextResponse.json(
      { error: "Bore-ON isn't configured yet. Add the base URL and API key under Admin → Settings." },
      { status: 409 }
    );
  }

  const apply = parsed.data.confirm === true && !parsed.data.dryRun;
  // TODO(owner-gate): applying pull-all (bulk re-price) is an owner-only tool
  // once verifyOwnerCaller lands (src/lib/server-action-auth.ts).
  const r = await pullAllBoreOn(db, secrets, apply ? { approved: parsed.data.approved ?? {} } : null);
  return NextResponse.json(r);
}
