import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { db, isExpired, leadQuoteFields, leadQuotePatch, rateLimited, readLeadQuotes, tokenOk } from "@/lib/proposal-server";
import { initializeAdminApp } from "@/services/firebase-admin";
import { isAdminIdentity } from "@/lib/admin-allowlist";
import { sendProposalEventNotice } from "@/services/notifications";
import { todayISO, type Lead } from "@/lib/leads";
import type { Proposal, QuoteRequest } from "@/lib/types";

// Fired by the proposal page after it loads in a real browser (not on the
// server render), so email link scanners don't mark a quote as viewed.
// The office's own looks (the page sends a signed-in admin's ID token) are
// not customer views and are ignored; "?preview=1" alone is not enough.
//
// Firestore transactions must do every read before the first write, so the
// proposal, quote, lead and the lead's other quotes are all read up front.

export const dynamic = "force-dynamic";

/** True when the request carries a valid admin ID token (the office looking). */
async function fromAdmin(request: Request): Promise<boolean> {
  const h = request.headers.get("authorization") || "";
  if (!h.startsWith("Bearer ")) return false;
  try {
    const decoded = await getAuth(initializeAdminApp()).verifyIdToken(h.slice(7));
    return isAdminIdentity(decoded.uid, decoded.email, decoded);
  } catch {
    return false;
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!tokenOk(token) || rateLimited(request)) return NextResponse.json({ ok: false }, { status: 400 });
  // Only a valid admin ID token makes a request a preview. "?preview=1" on
  // its own is a hint anyone could add, so it doesn't stop tracking.
  if (await fromAdmin(request)) {
    return NextResponse.json({ ok: true, preview: true });
  }
  const store = db();
  const ref = store.collection("proposals").doc(token);
  const now = new Date().toISOString();
  const today = todayISO();

  let first: Proposal | null = null;
  try {
    first = await store.runTransaction(async (tx) => {
      // ---- reads ----
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const p = snap.data() as Proposal;
      // A deleted quote's link: nothing to record.
      if (p.status === "void") return null;
      const isFirst = !p.viewedAt;
      const expired = isExpired(p);
      const qRef = p.quoteId ? store.collection("quoteRequests").doc(p.quoteId) : null;
      const qSnap = qRef ? await tx.get(qRef) : null;
      const quote = qSnap?.exists ? ({ id: qSnap.id, ...(qSnap.data() as Omit<QuoteRequest, "id">) } as QuoteRequest) : null;
      // Views of the version the quote last sent, only; an old version's
      // opens don't move the quote or the lead.
      const current = !!quote && quote.proposalId === token;
      const touchLead = isFirst && p.status === "sent" && current && !!p.leadId;
      const leadRef = touchLead ? store.collection("leads").doc(p.leadId) : null;
      const leadSnap = leadRef ? await tx.get(leadRef) : null;
      const lead = leadSnap?.exists ? (leadSnap.data() as Lead) : null;
      const quotes = lead && !expired ? await readLeadQuotes(tx, store, p.leadId, lead.quoteId) : [];

      // ---- writes ----
      const patch: Record<string, unknown> = { viewCount: FieldValue.increment(1), lastViewedAt: now };
      if (isFirst) patch.viewedAt = now;
      if (p.status === "sent" && !expired) patch.status = "viewed";
      tx.update(ref, patch);

      // The quote page shows "Viewed <date>, N times" for the version it
      // last sent, so only count opens of that version. An expired quote
      // stays "sent": the customer saw only "this quote expired".
      const qPatch: Record<string, unknown> = {};
      if (current && qRef) {
        Object.assign(qPatch, { viewCount: FieldValue.increment(1), lastViewedAt: now });
        if (isFirst) qPatch.viewedAt = now;
        if (isFirst && p.status === "sent" && !expired) qPatch.estimateStatus = "viewed";
        tx.update(qRef, qPatch);
      }

      if (leadRef && lead && quote) {
        const text = expired ? `Customer opened quote v${p.version} (expired)` : `Customer opened quote v${p.version}`;
        const quoteFields = expired
          ? {}
          : leadQuotePatch(
              leadQuoteFields(quotes, { [quote.id]: { ...quote, estimateStatus: "viewed", viewedAt: now } }, today)
            );
        tx.update(leadRef, {
          ...quoteFields,
          activity: FieldValue.arrayUnion({ ts: now, type: "system", text }),
          updatedAt: now,
        });
      }
      return isFirst && !expired ? p : null;
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
