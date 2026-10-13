import { NextResponse } from "next/server";
import { verifyApiOwner } from "@/lib/api-auth";
import { disconnectGmail } from "@/services/gmail-replies";

// Stops the lead-reply check: asks Google to revoke the Gmail login (best
// effort) and forgets it here either way. Replies already logged stay.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await verifyApiOwner(request);
  if (!auth.authorized) return auth.response;
  const { revoked } = await disconnectGmail();
  return NextResponse.json({ ok: true, revoked });
}
