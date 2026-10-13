import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { verifyApiOwner } from "@/lib/api-auth";
import { REDIRECT_PATH, getCalendarSecret, publicOrigin } from "@/lib/google-calendar";
import { GMAIL_ACCOUNT_HINT, GMAIL_SCOPE, GMAIL_STATE_PREFIX } from "@/lib/gmail-replies";
import { saveGmailSecret } from "@/services/gmail-replies";

// Step 1 of connecting Gmail (lead replies): returns the Google consent URL.
// Same OAuth client and the same registered redirect URI as the calendar;
// the "gmail." state prefix tells the shared callback which one this is.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await verifyApiOwner(request);
  if (!auth.authorized) return auth.response;

  const s = await getCalendarSecret();
  if (!s.clientId || !s.clientSecret) {
    return NextResponse.json(
      { error: "Save the Google OAuth client ID and secret under Google Calendar first." },
      { status: 409 }
    );
  }

  const origin = publicOrigin(request.url);
  const redirectUri = `${origin}${REDIRECT_PATH}`;
  const state = `${GMAIL_STATE_PREFIX}${randomBytes(24).toString("hex")}`;
  await saveGmailSecret({ pendingState: state, pendingStateAt: new Date().toISOString() });

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", s.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  url.searchParams.set("login_hint", GMAIL_ACCOUNT_HINT);

  return NextResponse.json({ url: url.toString(), redirectUri });
}
