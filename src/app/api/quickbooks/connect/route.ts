import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { verifyApiOwner } from "@/lib/api-auth";
import { publicOrigin } from "@/lib/google-calendar";
import { QBO_AUTHORIZE_URL, QBO_REDIRECT_PATH, QBO_SCOPE, getQboSecret, saveQboSecret } from "@/services/quickbooks";

// Step 1 of connecting QuickBooks: returns Intuit's sign-in URL for the owner
// to open. The state value is stored server-side and checked on return.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await verifyApiOwner(request);
  if (!auth.authorized) return auth.response;

  const s = await getQboSecret();
  if (!s.clientId || !s.clientSecret) {
    return NextResponse.json({ error: "Save the QuickBooks client ID and secret first." }, { status: 409 });
  }

  const redirectUri = `${publicOrigin(request.url)}${QBO_REDIRECT_PATH}`;
  const state = randomBytes(24).toString("hex");
  await saveQboSecret({ pendingState: state, pendingStateAt: new Date().toISOString() });

  const url = new URL(QBO_AUTHORIZE_URL);
  url.searchParams.set("client_id", s.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", QBO_SCOPE);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  return NextResponse.json({ url: url.toString(), redirectUri });
}
