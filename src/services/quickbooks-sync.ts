// Keeping a sent quote and its QuickBooks estimate in step. Server only.
// Every failure lands on the quote as qboError and never stops a quote
// going out; the estimator retries with one click.

import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import {
  findOrCreateCustomer,
  getQboSecret,
  isQboConnected,
  sendEstimate,
  setEstimateStatus,
  upsertEstimate,
  type QboSecret,
} from "@/lib/quickbooks";
import type { LeadActivity } from "@/lib/leads";
import type { Proposal, QuoteRequest } from "@/lib/types";

export type QboOutcome = { docNumber: string; url: string } | { error: string } | { skipped: true };

const clip = (e: unknown) => (e instanceof Error ? e.message : "QuickBooks failed").slice(0, 300);

/**
 * Record (or update) the estimate for the quote's latest proposal. `s` may be
 * passed in when the caller already loaded it.
 */
export async function recordEstimateForQuote(
  quoteId: string,
  opts: { db?: Firestore; secret?: QboSecret; emailTo?: string } = {}
): Promise<QboOutcome> {
  const db = opts.db ?? getFirestore(initializeAdminApp());
  const s = opts.secret ?? (await getQboSecret());
  if (!isQboConnected(s) || s.recordEstimates === false) return { skipped: true };

  const qRef = db.collection("quoteRequests").doc(quoteId);
  const qSnap = await qRef.get();
  if (!qSnap.exists) return { error: "Quote not found" };
  const quote = qSnap.data() as Omit<QuoteRequest, "id">;
  if (!quote.proposalId) return { error: "Send the quote first; the estimate records what was sent." };
  const pSnap = await db.collection("proposals").doc(quote.proposalId).get();
  if (!pSnap.exists) return { error: "The sent proposal is missing" };
  const p = pSnap.data() as Proposal;
  const now = new Date().toISOString();

  try {
    const customer = quote.qboCustomerId
      ? { id: quote.qboCustomerId, displayName: quote.name, created: false }
      : await findOrCreateCustomer(s, { name: quote.name, email: quote.email, phone: quote.phone, address: quote.address });
    const est = await upsertEstimate(s, {
      lines: p.lines,
      customerRef: { value: customer.id },
      email: p.customer.email || undefined,
      memo: p.scopeText,
      expiresAt: p.expiresAt,
      txnDate: p.sentAt,
      privateNote: `FiberNorth quote v${p.version} · https://fibernorth.com/proposal/${quote.proposalId}`,
      existingId: quote.qboEstimateId || undefined,
    });
    const email = opts.emailTo || p.customer.email;
    if (s.emailFromQuickBooks && email) {
      await sendEstimate(s, est.id, email).catch((e) => console.error("QuickBooks send failed:", e));
    }
    await qRef.update({
      qboCustomerId: customer.id,
      qboEstimateId: est.id,
      qboDocNumber: est.docNumber,
      qboEstimateUrl: est.url,
      qboSyncedAt: now,
      qboError: "",
    });
    await noteOnLead(db, quote, `Estimate #${est.docNumber} ${quote.qboEstimateId ? "updated" : "recorded"} in QuickBooks`, now);
    return { docNumber: est.docNumber, url: est.url };
  } catch (e) {
    const error = clip(e);
    console.error("QuickBooks estimate failed:", e);
    await qRef.update({ qboError: error, updatedAt: now }).catch(() => {});
    return { error };
  }
}

/** The customer answered on the proposal page; tell QuickBooks. */
export async function markEstimateAnswered(
  quoteId: string,
  answer: "accepted" | "declined",
  acceptedBy?: string
): Promise<void> {
  const db = getFirestore(initializeAdminApp());
  const qRef = db.collection("quoteRequests").doc(quoteId);
  const qSnap = await qRef.get();
  const quote = qSnap.data() as Omit<QuoteRequest, "id"> | undefined;
  if (!quote?.qboEstimateId) return;
  const s = await getQboSecret();
  if (!isQboConnected(s)) return;
  try {
    await setEstimateStatus(s, quote.qboEstimateId, answer === "accepted" ? "Accepted" : "Rejected", acceptedBy);
    await qRef.update({ qboSyncedAt: new Date().toISOString(), qboError: "" });
  } catch (e) {
    console.error("QuickBooks status update failed:", e);
    await qRef.update({ qboError: clip(e) }).catch(() => {});
  }
}

async function noteOnLead(db: Firestore, quote: Omit<QuoteRequest, "id">, text: string, now: string): Promise<void> {
  if (!quote.leadId) return;
  try {
    const ref = db.collection("leads").doc(quote.leadId);
    const snap = await ref.get();
    if (!snap.exists) return;
    const activity = (snap.data()?.activity as LeadActivity[]) || [];
    await ref.update({
      ...(quote.qboCustomerId ? {} : {}),
      activity: [...activity, { ts: now, type: "quote", text }],
      updatedAt: now,
    });
  } catch (e) {
    console.error("Lead QuickBooks note failed:", e);
  }
}
