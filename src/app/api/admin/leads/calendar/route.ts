import { NextResponse } from "next/server";
import { verifyApiAuth } from "@/lib/api-auth";
import { syncLeadEventById } from "@/lib/google-calendar";

// Push a lead's appointment to Google Calendar (create/update/remove).

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response;
  let leadId = "";
  try {
    leadId = String((await request.json())?.leadId || "");
  } catch {
    // handled below
  }
  if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });
  try {
    const result = await syncLeadEventById(leadId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Calendar sync failed" },
      { status: 502 }
    );
  }
}
