import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { db, isExpired, rateLimited, tokenOk } from "@/lib/proposal-server";
import { sendProposalEventNotice } from "@/services/notifications";
import type { Proposal } from "@/lib/types";

// Fired by the proposal page after it loads in a real browser (not on the
// server render), so email link scanners don't mark a quote as viewed.

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!tokenOk(token) || rateLimited(request)) return NextResponse.json({ ok: false }, { status: 400 });
  const store = db();
  const ref = store.collection("proposals").doc(token);
  const now = new Date().toISOString();

  const first = await store.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const p = snap.data() as Proposal;
    const isFirst = !p.viewedAt;
    const patch: Record<string, unknown> = { viewCount: FieldValue.increment(1) };
    if (isFirst) patch.viewedAt = now;
    if (p.status === "sent" && !isExpired(p)) patch.status = "viewed";
    tx.update(ref, patch);

    if (isFirst && p.status === "sent") {
      tx.update(store.collection("quoteRequests").doc(p.quoteId), { estimateStatus: "viewed", viewedAt: now });
      if (p.leadId) {
        const leadRef = store.collection("leads").doc(p.leadId);
        const leadSnap = await tx.get(leadRef);
        if (leadSnap.exists) {
          const activity = (leadSnap.get("activity") as unknown[]) || [];
          const quote = (leadSnap.get("quote") as Record<string, unknown>) || {};
          tx.update(leadRef, {
            quote: { ...quote, status: "viewed", viewedAt: now },
            activity: [...activity, { ts: now, type: "system", text: `Customer opened quote v${p.version}` }],
            updatedAt: now,
          });
        }
      }
    }
    return isFirst ? p : null;
  });

  if (first) {
    await sendProposalEventNotice({
      event: "viewed",
      customerName: first.customer.name,
      total: first.totals.total,
      version: first.version,
      leadId: first.leadId,
    }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
