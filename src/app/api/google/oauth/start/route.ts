import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { verifyApiOwner } from "@/lib/api-auth";
import { CALENDAR_SCOPE, REDIRECT_PATH, getCalendarSecret, saveCalendarSecret } from "@/lib/google-calendar";

// Step 1 of connecting Google Calendar: returns the Google consent URL for the
// admin to open. The state value is stored server-side and checked on return.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Owner only, like the rest of the integration settings.
  const auth = await verifyApiOwner(request);
  if (!auth.authorized) return auth.response;

  const s = await getCalendarSecret();
  if (!s.clientId || !s.clientSecret) {
    return NextResponse.json(
      { error: "Save the Google OAuth client ID and secret first." },
      { status: 409 }
    );
  }

  const origin = new URL(request.url).origin.replace(/^http:\/\/localhost/, "http://localhost");
  const redirectUri = `${origin}${REDIRECT_PATH}`;
  const state = randomBytes(24).toString("hex");
  await saveCalendarSecret({ pendingState: state, pendingStateAt: new Date().toISOString() });

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", s.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", `${CALENDAR_SCOPE} openid email`);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  url.searchParams.set("login_hint", "admin@fibernorth.com");

  return NextResponse.json({ url: url.toString(), redirectUri });
}
