import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/google-calendar";
import { tokenPatch } from "@/lib/quickbooks/tokens";
import {
  QBO_REDIRECT_PATH,
  exchangeCode,
  fetchCompanyName,
  getQboSecret,
  recordQboStatus,
  saveQboSecret,
} from "@/services/quickbooks";

// Step 2: Intuit sends the owner back here with a code and the company
// (realm) id. Exchange the code for tokens and store them. No Firebase auth
// on this route (it's a browser redirect from Intuit); the state check ties
// it to a connect request the owner made within the last 10 minutes.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const realmId = url.searchParams.get("realmId") || "";
  const denied = url.searchParams.get("error") || "";
  const origin = publicOrigin(request.url);
  const back = (msg: string) =>
    NextResponse.redirect(`${origin}/admin/settings?quickbooks=${encodeURIComponent(msg)}`);

  const s = await getQboSecret();
  const fresh =
    s.pendingState &&
    s.pendingStateAt &&
    Date.now() - new Date(s.pendingStateAt).getTime() < 10 * 60_000;
  if (!state || !fresh || state !== s.pendingState) return back("error:state");
  // The state is single use, whatever happens next.
  await saveQboSecret({ pendingState: "", pendingStateAt: "" });
  if (denied) return back(denied === "access_denied" ? "error:denied" : `error:${denied.slice(0, 40)}`);
  if (!code) return back("error:nocode");
  if (!realmId) return back("error:norealm");

  let tokens;
  try {
    tokens = await exchangeCode(s, code, `${origin}${QBO_REDIRECT_PATH}`);
  } catch (e) {
    console.error("QuickBooks code exchange failed:", e);
    const status = (e as { status?: number }).status;
    return back(`error:token${status || ""}`);
  }
  let patch;
  try {
    patch = tokenPatch(tokens, {});
  } catch {
    return back("error:norefresh");
  }

  let companyName = "";
  try {
    companyName = await fetchCompanyName(realmId, patch.accessToken);
  } catch (e) {
    // Connected all the same; Settings just won't show the name.
    console.error("QuickBooks company lookup failed:", e);
  }

  await saveQboSecret({
    ...patch,
    realmId,
    companyName,
    connectedAt: new Date().toISOString(),
  });
  await recordQboStatus({ reset: true });
  return back("connected");
}
