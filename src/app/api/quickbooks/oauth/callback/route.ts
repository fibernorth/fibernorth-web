import { NextResponse } from "next/server";
import { QBO_REDIRECT_PATH, companyName, exchangeCode, getQboSecret, saveQboSecret } from "@/lib/quickbooks";

// Step 2: Intuit sends the admin back here with a code and the company's
// realmId. Exchange the code for tokens and store them. No Firebase auth on
// this route (it is a browser redirect from Intuit); the state check ties it
// to a start request an admin made within the last 10 minutes.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const realmId = url.searchParams.get("realmId") || "";
  const back = (msg: string) => NextResponse.redirect(`${url.origin}/admin/settings?quickbooks=${encodeURIComponent(msg)}`);

  const s = await getQboSecret();
  const fresh = s.pendingState && s.pendingStateAt && Date.now() - new Date(s.pendingStateAt).getTime() < 10 * 60_000;
  if (!code || !state || !realmId || !fresh || state !== s.pendingState) return back("error:state");

  try {
    await saveQboSecret({ realmId, pendingState: "", pendingStateAt: "" });
    const tokens = await exchangeCode(s, code, `${url.origin}${QBO_REDIRECT_PATH}`);
    let name = "";
    try {
      name = await companyName({ ...s, realmId, ...tokens });
    } catch {
      /* the connection still works without the name */
    }
    await saveQboSecret({
      companyName: name,
      ...(s.recordEstimates === undefined ? { recordEstimates: true } : {}),
      ...(s.emailFromQuickBooks === undefined ? { emailFromQuickBooks: false } : {}),
    });
    return back("connected");
  } catch (e) {
    console.error("QuickBooks connect failed:", e);
    return back("error:token");
  }
}
