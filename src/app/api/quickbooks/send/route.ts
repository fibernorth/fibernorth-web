import { NextResponse } from "next/server";
import { verifyApiAuth } from "@/lib/api-auth";
import { QboBusyError, QboNotConnectedError, sendQuoteToQuickBooks } from "@/services/quickbooks";

// Send to QuickBooks on the quote screen: creates the quote's estimate in
// QuickBooks Online, or updates the one it made before.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response;

  let quoteId = "";
  try {
    const body = await request.json();
    quoteId = String(body?.quoteId ?? "").trim();
  } catch {
    // fall through to the check below
  }
  if (!quoteId || quoteId.includes("/") || quoteId.length > 200) {
    return NextResponse.json({ error: "quoteId required" }, { status: 400 });
  }

  try {
    const out = await sendQuoteToQuickBooks(quoteId);
    return NextResponse.json({ ok: true, docNumber: out.docNumber, url: out.url, created: out.created, from: out.from });
  } catch (e) {
    const error = e instanceof Error && e.message ? e.message : "QuickBooks send failed.";
    const status =
      e instanceof QboNotConnectedError ? 409 : e instanceof QboBusyError ? 409 : error === "Quote not found" ? 404 : 502;
    if (status === 502) console.error("QuickBooks send failed:", e);
    return NextResponse.json({ error, ...(e instanceof QboNotConnectedError ? { notConnected: true } : {}) }, { status });
  }
}
