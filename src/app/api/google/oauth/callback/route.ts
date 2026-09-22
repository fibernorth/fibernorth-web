import { NextResponse } from "next/server";
import { REDIRECT_PATH, getCalendarSecret, saveCalendarSecret } from "@/lib/google-calendar";

// Step 2: Google sends the admin back here with a code. Exchange it for a
// refresh token and store it. No Firebase auth on this route (it's a browser
// redirect from Google); the state check ties it to a start request an
// admin made within the last 10 minutes.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const back = (msg: string) =>
    NextResponse.redirect(`${url.origin}/admin/settings?calendar=${encodeURIComponent(msg)}`);

  const s = await getCalendarSecret();
  const fresh =
    s.pendingState &&
    s.pendingStateAt &&
    Date.now() - new Date(s.pendingStateAt).getTime() < 10 * 60_000;
  if (!code || !state || !fresh || state !== s.pendingState) return back("error:state");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: s.clientId || "",
      client_secret: s.clientSecret || "",
      redirect_uri: `${url.origin}${REDIRECT_PATH}`,
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

  await saveCalendarSecret({
    refreshToken: json.refresh_token,
    accountEmail: email,
    calendarId: "primary",
    pendingState: "",
    pendingStateAt: "",
  });
  return back("connected");
}
