import { NextResponse } from "next/server";
import { verifyApiAuth } from "@/lib/api-auth";
import { syncGmailReplies } from "@/services/gmail-replies";

// Check bill@'s inbox for lead replies (src/services/gmail-replies.ts). Any
// admin's open tab pings this every few minutes; the service runs at most
// every two minutes however many ask. { force: true } (Check now in
// Settings, owner only) may run sooner.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response;
  const body = (await request.json().catch(() => ({}))) as { force?: unknown };
  const result = await syncGmailReplies({ force: body.force === true && auth.owner === true });
  if (!result.ok) return NextResponse.json(result, { status: 502 });
  return NextResponse.json(result);
}
