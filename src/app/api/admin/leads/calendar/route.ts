import { NextResponse } from "next/server";
import { verifyApiAuth } from "@/lib/api-auth";
import { trySyncLeadEventById } from "@/lib/google-calendar";

// Push a lead's appointment to Google Calendar (create/update/remove).
// Response: { ok: true, eventId, htmlLink } or 502 { ok: false, error }.

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
  // { ok: true, eventId, htmlLink } or { ok: false, error } with a 502, so
  // callers can tell the user the calendar wasn't updated and why.
  const result = await trySyncLeadEventById(leadId);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
