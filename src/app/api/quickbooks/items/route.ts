import { NextResponse } from "next/server";
import { verifyApiAuth } from "@/lib/api-auth";
import { getQboSecret, isQboConnected, listSalesItems } from "@/lib/quickbooks";

// The company's products and services, for picking which item the work and
// the materials bill against. Admin-only.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response;
  const s = await getQboSecret();
  if (!isQboConnected(s)) return NextResponse.json({ error: "QuickBooks isn't connected." }, { status: 409 });
  try {
    return NextResponse.json({ items: await listSalesItems(s) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't list items" }, { status: 502 });
  }
}
