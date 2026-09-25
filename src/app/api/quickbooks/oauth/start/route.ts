import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { verifyApiAuth } from "@/lib/api-auth";
import { QBO_REDIRECT_PATH, authorizeUrl, getQboSecret, saveQboSecret } from "@/lib/quickbooks";

// Step 1 of connecting QuickBooks Online: returns the Intuit consent URL for
// the admin to open. The state value is stored server-side and checked on
// return, the same way the Google Calendar connection works.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response;

  const s = await getQboSecret();
  if (!s.clientId || !s.clientSecret) {
    return NextResponse.json({ error: "Save the QuickBooks client ID and secret first." }, { status: 409 });
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}${QBO_REDIRECT_PATH}`;
  const state = randomBytes(24).toString("hex");
  await saveQboSecret({ pendingState: state, pendingStateAt: new Date().toISOString() });

  return NextResponse.json({ url: authorizeUrl(s, redirectUri, state), redirectUri });
}
