import { NextResponse } from "next/server";
import { verifyApiOwner } from "@/lib/api-auth";
import { disconnectQuickBooks } from "@/services/quickbooks";

// Revokes the QuickBooks login at Intuit (best effort) and forgets the tokens
// here either way. The client ID and secret stay, so Connect works again.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await verifyApiOwner(request);
  if (!auth.authorized) return auth.response;
  const { revoked } = await disconnectQuickBooks();
  return NextResponse.json({ ok: true, revoked });
}
