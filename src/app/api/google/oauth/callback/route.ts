import { NextResponse } from "next/server";
import { REDIRECT_PATH, getCalendarSecret, publicOrigin, saveCalendarSecret } from "@/lib/google-calendar";
import { isGmailState } from "@/lib/gmail-replies";
import { getGmailSecret, saveGmailSecret } from "@/services/gmail-replies";

// Step 2: Google sends the admin back here with a code. Exchange it for a
// refresh token and store it. No Firebase auth on this route (it's a browser
// redirect from Google); the state check ties it to a start request an
// admin made within the last 10 minutes.
//
// Shared by two connections on the same OAuth client and redirect URI:
// Google Calendar (admin@) and Gmail lead replies (bill@, state "gmail.…").

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const origin = publicOrigin(request.url);
  const gmail = isGmailState(state);
  const back = (msg: string) =>
    NextResponse.redirect(`${origin}/admin/settings?${gmail ? "gmail" : "calendar"}=${encodeURIComponent(msg)}`);

  const s = await getCalendarSecret();
  const pending = gmail ? await getGmailSecret() : s;
  const fresh =
    pending.pendingState &&
    pending.pendingStateAt &&
    Date.now() - new Date(pending.pendingStateAt).getTime() < 10 * 60_000;
  if (gmail && url.searchParams.get("error")) return back("error:denied");
  if (!code || !state || !fresh || state !== pending.pendingState) return back("error:state");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: s.clientId || "",
      client_secret: s.clientSecret || "",
      redirect_uri: `${origin}${REDIRECT_PATH}`,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return back(`error:token${res.status}`);
  const json = (await res.json()) as { refresh_token?: string; id_token?: string };
  if (!json.refresh_token) return back("error:norefresh");

  let email = "";
  if (json.id_token) {
    try {
      const payload = JSON.parse(Buffer.from(json.id_token.split(".")[1], "base64url").toString());
      email = String(payload.email || "");
    } catch {
      // fine
    }
  }

  if (gmail) {
    await saveGmailSecret({
      refreshToken: json.refresh_token,
      accountEmail: email,
      connectedAt: new Date().toISOString(),
      pendingState: "",
      pendingStateAt: "",
    });
    return back("connected");
  }

  await saveCalendarSecret({
    refreshToken: json.refresh_token,
    accountEmail: email,
    calendarId: "primary",
    pendingState: "",
    pendingStateAt: "",
  });
  return back("connected");
}
