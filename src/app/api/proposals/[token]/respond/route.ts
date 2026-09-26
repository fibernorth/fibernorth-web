import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import {
  clientIp,
  db,
  isExpired,
  leadQuoteFields,
  leadQuotePatch,
  rateLimitedShared,
  readLeadQuotes,
  tokenOk,
} from "@/lib/proposal-server";
import { sendProposalEventNotice } from "@/services/notifications";
import { acceptedSaleTotal, money } from "@/lib/proposal";
import { parseMoney, todayISO, type Lead, type LeadActivity } from "@/lib/leads";
import type { Proposal, QuoteRequest } from "@/lib/types";

// Customer accepts or declines a proposal. Accept requires a typed full name
// and the "I agree" box (enough for an e-signature under Michigan's UETA);
// we record time, IP and browser against the immutable snapshot.
//
// A customer who declined can still accept the same version while it is good
// (it's their choice, and the price hasn't changed). Once the good-through
// date passes, nothing but an accepted proposal stands: accept and decline
// are both refused, whatever the status, and Bill sends a fresh version.
//
// A lead can have several quotes (one per job site). The lead's badge is
// worked out from all of them (leadQuoteRollup), so accepting site A never
// repaints site B's badge.

export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), name: z.string().trim().min(2).max(120), agree: z.literal(true) }),
  z.object({ action: z.literal("decline"), reason: z.string().trim().max(1000).optional().default("") }),
]);

const GONE = "This quote is no longer available. Call or text Bill at (231) 944-6471.";

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
  const today = todayISO();
  const ip = clientIp(request);
  const ua = (request.headers.get("user-agent") || "").slice(0, 300);
  const data = body.data;

  let result: { p: Proposal; error?: string; status?: number } | null = null;
  try {
    result = await store.runTransaction(async (tx) => {
      // ---- reads ----
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const p = snap.data() as Proposal;
      if (p.status === "void") return { p, error: GONE, status: 410 };
      if (p.status === "superseded") return { p, error: "This quote was replaced by a newer version. Use the link to the latest one." };
      if (p.status === "accepted") return { p, error: "This quote was already accepted. Thank you." };
      if (p.status === "declined" && data.action === "decline") return { p, error: "Already declined." };
      if (isExpired(p)) return { p, error: "This quote has expired. Call (231) 944-6471 and we'll refresh it." };

      const qRef = store.collection("quoteRequests").doc(p.quoteId || "-");
      const qSnap = p.quoteId ? await tx.get(qRef) : null;
      // The quote was deleted from the office: the link is dead, say so.
      if (!qSnap?.exists) return { p, error: GONE, status: 410 };
      const quote = { id: qSnap.id, ...(qSnap.data() as Omit<QuoteRequest, "id">) } as QuoteRequest;

      const leadRef = p.leadId ? store.collection("leads").doc(p.leadId) : null;
      const leadSnap = leadRef ? await tx.get(leadRef) : null;
      const lead = leadSnap?.exists ? (leadSnap.data() as Lead) : null;
      const quotes = lead ? await readLeadQuotes(tx, store, p.leadId, lead.quoteId) : [];
      // A lead can have several job sites, each its own quote. The sale is
      // every accepted proposal on the lead, this one included.
      const siblings =
        lead && data.action === "accept"
          ? (await tx.get(store.collection("proposals").where("leadId", "==", p.leadId))).docs
          : [];
      const before = acceptedSaleTotal(siblings.filter((d) => d.id !== token).map((d) => d.data() as Proposal));
      const saleTotal = Math.round((before + p.totals.total) * 100) / 100;
      // Only the version the quote last sent moves the quote's status.
      const current = quote.proposalId === token;

      // ---- writes ----
      const history: LeadActivity[] = [];
      if (data.action === "accept") {
        tx.update(ref, { status: "accepted", acceptedAt: now, acceptedName: data.name, acceptedIp: ip, acceptedUa: ua });
        const qPatch = current ? { estimateStatus: "accepted" as const, acceptedAt: now } : {};
        if (current) tx.update(qRef, qPatch);
        if (lead && leadRef) {
          history.push({ ts: now, type: "quote", text: `Customer ACCEPTED quote v${p.version} (signed "${data.name}")` });
          // A sale amount we wrote (blank, or the accepted total before this
          // one) follows the accepted quotes. One typed by hand stays.
          const typed = parseMoney(lead.saleAmount);
          const ours = !String(lead.saleAmount ?? "").trim() || (typed !== null && Math.abs(typed - before) < 0.005);
          if (!ours) {
            history.push({
              ts: now,
              type: "system",
              text: `Sale may need updating: quote v${p.version} accepted for ${money(p.totals.total)}; the sale amount (${lead.saleAmount}) was typed by hand and was left alone`,
            });
          }
          const reopened = lead.stage === "not_a_lead";
          if (reopened) history.push({ ts: now, type: "system", text: "Reopened by acceptance (was marked not a lead)" });
          tx.update(leadRef, {
            stage: "won",
            ...(ours ? { saleAmount: saleTotal.toFixed(2), saleAmountNum: saleTotal } : {}),
            ...(reopened ? { disqualifyReason: "", disqualifiedAt: "" } : {}),
            nextAction: "Schedule the job",
            nextActionAt: today,
            nextActionAuto: false,
            lastContactAt: today,
            ...leadQuotePatch(leadQuoteFields(quotes, { [quote.id]: { ...quote, ...qPatch } }, today)),
            activity: FieldValue.arrayUnion(...history),
            touched: true,
            updatedAt: now,
          });
        }
      } else {
        tx.update(ref, { status: "declined", declinedAt: now, declineReason: data.reason });
        const qPatch = current ? { estimateStatus: "declined" as const, declinedAt: now } : {};
        if (current) tx.update(qRef, qPatch);
        if (lead && leadRef) {
          history.push({ ts: now, type: "quote", text: `Customer declined quote v${p.version}${data.reason ? `: ${data.reason}` : ""}` });
          // A won lead (another site accepted) keeps its own next step; the
          // decline is logged for Bill to see.
          const won = lead.stage === "won";
          tx.update(leadRef, {
            ...(won ? {} : { nextAction: "Call about the declined quote", nextActionAt: today, nextActionAuto: false }),
            ...leadQuotePatch(leadQuoteFields(quotes, { [quote.id]: { ...quote, ...qPatch } }, today)),
            activity: FieldValue.arrayUnion(...history),
            touched: true,
            updatedAt: now,
          });
        }
      }
      return { p };
    });
  } catch (err) {
    console.error("Proposal response failed:", err);
    return NextResponse.json({ error: "Something went wrong. Call (231) 944-6471." }, { status: 500 });
  }

  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status ?? 409 });

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
