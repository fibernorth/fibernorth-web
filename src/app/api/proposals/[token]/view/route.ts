import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { db, isExpired, rateLimited, tokenOk } from "@/lib/proposal-server";
import { sendProposalEventNotice } from "@/services/notifications";
import type { Proposal } from "@/lib/types";

// Fired by the proposal page after it loads in a real browser (not on the
// server render), so email link scanners don't mark a quote as viewed.
//
// Firestore transactions must do every read before the first write, so the
// proposal, quote and lead are all read up front.

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!tokenOk(token) || rateLimited(request)) return NextResponse.json({ ok: false }, { status: 400 });
  const store = db();
  const ref = store.collection("proposals").doc(token);
  const now = new Date().toISOString();

  let first: Proposal | null = null;
  try {
    first = await store.runTransaction(async (tx) => {
      // ---- reads ----
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const p = snap.data() as Proposal;
      const isFirst = !p.viewedAt;
      const qRef = p.quoteId ? store.collection("quoteRequests").doc(p.quoteId) : null;
      const qSnap = qRef ? await tx.get(qRef) : null;
      const leadRef = isFirst && p.status === "sent" && p.leadId ? store.collection("leads").doc(p.leadId) : null;
      const leadSnap = leadRef ? await tx.get(leadRef) : null;

      // ---- writes ----
      const patch: Record<string, unknown> = { viewCount: FieldValue.increment(1), lastViewedAt: now };
      if (isFirst) patch.viewedAt = now;
      if (p.status === "sent" && !isExpired(p)) patch.status = "viewed";
      tx.update(ref, patch);

      // The quote page shows "Viewed <date>, N times" for the version it
      // last sent, so only count opens of that version.
      if (qRef && qSnap?.exists && qSnap.get("proposalId") === token) {
        const qPatch: Record<string, unknown> = { viewCount: FieldValue.increment(1), lastViewedAt: now };
        if (isFirst) qPatch.viewedAt = now;
        if (isFirst && p.status === "sent") qPatch.estimateStatus = "viewed";
        tx.update(qRef, qPatch);
      }

      if (leadRef && leadSnap?.exists) {
        const activity = (leadSnap.get("activity") as unknown[]) || [];
        const quote = (leadSnap.get("quote") as Record<string, unknown>) || {};
        tx.update(leadRef, {
          quote: { ...quote, status: "viewed", viewedAt: now },
          activity: [...activity, { ts: now, type: "system", text: `Customer opened quote v${p.version}` }],
          updatedAt: now,
        });
      }
      return isFirst ? p : null;
    });
  } catch (err) {
    console.error("Proposal view record failed:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

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
