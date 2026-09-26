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
import { sendAcceptanceConfirmation, sendProposalEventNotice } from "@/services/notifications";
import { acceptedSaleTotal, money, proposalUrl } from "@/lib/proposal";
import { QUOTE_CHANGED as CHANGED, shownHash } from "@/lib/proposal-evidence";
import { acceptConsentText, DECLINE_CONSENT_TEXT, nameLooselyMatches } from "@/lib/proposal-consent";
import { readGuardedJson } from "@/lib/request-guard";
import { parseMoney, todayISO, type Lead, type LeadActivity } from "@/lib/leads";
import type { Proposal, QuoteRequest } from "@/lib/types";

// Customer accepts or declines a proposal. Accept requires a typed full name
// and the "I agree" box (enough for an e-signature under Michigan's UETA).
//
// The page posts back what the customer was looking at: the version, the
// total, the content hash (src/lib/proposal-hash.ts) and the exact words
// next to the box or button. Inside the transaction all of it must match
// the stored proposal, which must still be the quote's current version, or
// nothing is recorded ("This quote changed. Reload to see the current
// one."). The evidence then goes into an add-only record,
// proposals/{token}/events/{auto}, written with create() in the same
// commit as the status change. The acceptedAt/acceptedName/... fields on
// the proposal stay for the screens that read them.
//
// A customer who declined can still accept the same version while it is good
// (it's their choice, and the price hasn't changed). Once the good-through
// date passes, nothing but an accepted proposal stands: accept and decline
// are both refused, whatever the status, and Bill sends a fresh version.
//
// A lead can have several quotes (one per job site). The lead's badge is
// worked out from all of them (leadQuoteRollup), so accepting site A never
// repaints site B's badge.
//
// After the commit: the office notice (checked, retried, recorded in
// notices/{eventId}) and, on accept, the customer's own copy by email.

export const dynamic = "force-dynamic";

const shown = {
  version: z.number().int().min(1).max(10_000),
  total: z.number().finite(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  consentText: z.string().max(500),
};

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), name: z.string().trim().min(2).max(120), agree: z.literal(true), ...shown }),
  z.object({ action: z.literal("decline"), reason: z.string().trim().max(1000).optional().default(""), ...shown }),
]);

const GONE = "This quote is no longer available. Call or text Bill at (231) 944-6471.";

export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!tokenOk(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await readGuardedJson(request);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  if (await rateLimitedShared(request, "proposal-respond", 10)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body;
  try {
    body = schema.safeParse(JSON.parse(guard.text));
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!body.success) {
    const accepting = (() => {
      try {
        return JSON.parse(guard.text)?.action === "accept";
      } catch {
        return false;
      }
    })();
    // A page from before the evidence fields existed: have them reload.
    const missing = body.error.issues.some((i) => ["version", "total", "contentHash", "consentText"].includes(String(i.path[0])));
    return NextResponse.json(
      { error: missing ? CHANGED : accepting ? "Type your full name and check the box to accept." : "Bad request" },
      { status: missing ? 409 : 400 }
    );
  }

  const store = db();
  const ref = store.collection("proposals").doc(token);
  const eventRef = store.collection(`proposals/${token}/events`).doc();
  const now = new Date().toISOString();
  const today = todayISO();
  const ip = clientIp(request);
  const ua = (request.headers.get("user-agent") || "").slice(0, 300);
  const data = body.data;

  let result: { p: Proposal; error?: string; status?: number; hash?: string; nameMatches?: boolean } | null = null;
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

      // What the customer saw must be what is stored, and still the
      // version the quote last sent.
      const hash = shownHash(p);
      const expectedConsent = data.action === "accept" ? acceptConsentText(p.totals.total) : DECLINE_CONSENT_TEXT;
      if (
        quote.proposalId !== token ||
        data.version !== p.version ||
        Math.abs(data.total - p.totals.total) > 0.005 ||
        data.contentHash !== hash ||
        data.consentText !== expectedConsent
      ) {
        return { p, error: CHANGED, status: 409 };
      }

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

      // ---- writes ----
      // The evidence: add-only, one per response, in the same commit.
      const nameMatches = data.action === "accept" ? nameLooselyMatches(data.name, p.customer?.name || "") : undefined;
      tx.create(eventRef, {
        type: data.action === "accept" ? "accepted" : "declined",
        at: now,
        name: data.action === "accept" ? data.name : "",
        ...(data.action === "accept" ? { nameMatches } : { reason: data.reason }),
        consentText: data.consentText,
        version: p.version,
        total: p.totals.total,
        contentHash: hash,
        // Whether the hash came from the send (true) or was worked out from
        // the stored copy of an older proposal (false).
        hashStoredAtSend: !!p.contentHash,
        customerName: p.customer?.name || "",
        quoteId: quote.id,
        leadId: p.leadId || "",
        ip,
        ua,
      });

      const history: LeadActivity[] = [];
      if (data.action === "accept") {
        tx.update(ref, {
          status: "accepted",
          acceptedAt: now,
          acceptedName: data.name,
          acceptedIp: ip,
          acceptedUa: ua,
        });
        const qPatch = { estimateStatus: "accepted" as const, acceptedAt: now };
        tx.update(qRef, qPatch);
        if (lead && leadRef) {
          history.push({ ts: now, type: "quote", text: `Customer ACCEPTED quote v${p.version} (signed "${data.name}")` });
          if (!nameMatches) {
            history.push({
              ts: now,
              type: "system",
              text: `Signed as "${data.name}", quote was for ${p.customer?.name || "(no name)"}. Check who approved it.`,
            });
          }
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
        const qPatch = { estimateStatus: "declined" as const, declinedAt: now };
        tx.update(qRef, qPatch);
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
      return { p, hash, nameMatches };
    });
  } catch (err) {
    console.error("Proposal response failed:", err);
    return NextResponse.json({ error: "Something went wrong. Call (231) 944-6471." }, { status: 500 });
  }

  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status ?? 409 });

  const p = result.p;
  const accepted = data.action === "accept";
  // Awaited: on serverless, work left after the response can be dropped.
  // Both record their own outcome (notices/...) and never fail the response.
  await Promise.all([
    sendProposalEventNotice({
      event: accepted ? "accepted" : "declined",
      customerName: p.customer.name,
      total: p.totals.total,
      version: p.version,
      leadId: p.leadId,
      detail: accepted ? `signed "${data.name}"${result.nameMatches === false ? " (not the name on the quote)" : ""}` : data.reason,
      eventId: eventRef.id,
      proposalToken: token,
    }).catch((err) => console.error("Proposal notice failed:", err)),
    accepted
      ? sendAcceptanceConfirmation({
          eventId: eventRef.id,
          proposalToken: token,
          leadId: p.leadId,
          to: p.customer.email || p.sentTo || "",
          customerName: p.customer.name,
          acceptedName: data.name,
          acceptedAt: now,
          version: p.version,
          total: p.totals.total,
          address: p.customer.address,
          url: proposalUrl(token),
          contentHash: result.hash || "",
          senderEmail: p.sentBy,
        }).catch((err) => console.error("Acceptance copy failed:", err))
      : null,
  ]);

  return NextResponse.json({
    ok: true,
    status: accepted ? "accepted" : "declined",
    ...(accepted ? { acceptedAt: now, acceptedName: data.name } : {}),
  });
}
