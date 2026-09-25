import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, db, isExpired, rateLimitedShared, tokenOk } from "@/lib/proposal-server";
import { sendProposalEventNotice } from "@/services/notifications";
import type { Proposal } from "@/lib/types";

// Customer accepts or declines a proposal. Accept requires a typed full name
// and the "I agree" box (enough for an e-signature under Michigan's UETA);
// we record time, IP and browser against the immutable snapshot.

export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), name: z.string().trim().min(2).max(120), agree: z.literal(true) }),
  z.object({ action: z.literal("decline"), reason: z.string().trim().max(1000).optional().default("") }),
]);

export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!tokenOk(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (await rateLimitedShared(request, "proposal-respond", 10)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body;
  try {
    body = schema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!body.success) return NextResponse.json({ error: "Type your full name and check the box to accept." }, { status: 400 });

  const store = db();
  const ref = store.collection("proposals").doc(token);
  const now = new Date().toISOString();
  const ip = clientIp(request);
  const ua = (request.headers.get("user-agent") || "").slice(0, 300);
  const data = body.data;

  let result: { p: Proposal; error?: string } | null = null;
  try {
    result = await store.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const p = snap.data() as Proposal;
      if (p.status === "superseded") return { p, error: "This quote was replaced by a newer version. Use the link to the latest one." };
      if (p.status === "accepted") return { p, error: "This quote was already accepted. Thank you." };
      if (p.status === "declined" && data.action === "decline") return { p, error: "Already declined." };
      if (isExpired(p)) return { p, error: "This quote has expired. Call (231) 944-6471 and we'll refresh it." };

      const leadRef = p.leadId ? store.collection("leads").doc(p.leadId) : null;
      const leadSnap = leadRef ? await tx.get(leadRef) : null;
      const qRef = store.collection("quoteRequests").doc(p.quoteId);

      if (data.action === "accept") {
        tx.update(ref, { status: "accepted", acceptedAt: now, acceptedName: data.name, acceptedIp: ip, acceptedUa: ua });
        tx.update(qRef, { estimateStatus: "accepted", acceptedAt: now });
        if (leadRef && leadSnap?.exists) {
          const activity = (leadSnap.get("activity") as unknown[]) || [];
          const quote = (leadSnap.get("quote") as Record<string, unknown>) || {};
          tx.update(leadRef, {
            stage: "won",
            saleAmount: p.totals.total.toFixed(2),
            nextAction: "Schedule the job",
            nextActionAt: now.slice(0, 10),
            lastContactAt: now.slice(0, 10),
            quote: { ...quote, status: "accepted" },
            activity: [...activity, { ts: now, type: "quote", text: `Customer ACCEPTED quote v${p.version} (signed "${data.name}")` }],
            touched: true,
            updatedAt: now,
          });
        }
      } else {
        tx.update(ref, { status: "declined", declinedAt: now, declineReason: data.reason });
        tx.update(qRef, { estimateStatus: "declined", declinedAt: now });
        if (leadRef && leadSnap?.exists) {
          const activity = (leadSnap.get("activity") as unknown[]) || [];
          const quote = (leadSnap.get("quote") as Record<string, unknown>) || {};
          tx.update(leadRef, {
            nextAction: "Call about the declined quote",
            nextActionAt: now.slice(0, 10),
            quote: { ...quote, status: "declined" },
            activity: [...activity, { ts: now, type: "quote", text: `Customer declined quote v${p.version}${data.reason ? `: ${data.reason}` : ""}` }],
            touched: true,
            updatedAt: now,
          });
        }
      }
      return { p };
    });
  } catch {
    return NextResponse.json({ error: "Something went wrong. Call (231) 944-6471." }, { status: 500 });
  }

  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result.error) return NextResponse.json({ error: result.error }, { status: 409 });

  await sendProposalEventNotice({
    event: data.action === "accept" ? "accepted" : "declined",
    customerName: result.p.customer.name,
    total: result.p.totals.total,
    version: result.p.version,
    leadId: result.p.leadId,
    detail: data.action === "accept" ? `signed "${data.name}"` : data.reason,
  }).catch(() => {});

  return NextResponse.json({ ok: true, status: data.action === "accept" ? "accepted" : "declined" });
}
