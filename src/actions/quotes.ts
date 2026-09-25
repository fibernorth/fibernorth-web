"use server";

import { randomBytes } from "crypto";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyServerActionCaller } from "@/lib/server-action-auth";
import {
  computeLineTotals,
  DEFAULT_VALID_DAYS,
  defaultScope,
  money,
  proposalUrl,
  STANDARD_TERMS,
} from "@/lib/proposal";
import { addDays, contactPatch, type Lead, type LeadActivity } from "@/lib/leads";
import type { Proposal, QuoteLine, QuoteRequest } from "@/lib/types";
import { sendProposalEmail } from "@/services/notifications";
import { recordEstimateForQuote, type QboOutcome } from "@/services/quickbooks-sync";

function db(): Firestore {
  return getFirestore(initializeAdminApp());
}

const EARLY_STAGES = ["new", "contacted", "walk_scheduled", "walk_done", "nurture"];

/**
 * Open (or create) the quote for a lead. Idempotent: a double tap returns the
 * same quote. Keeps lead.quoteId and quote.leadId linked both ways.
 */
export async function ensureQuoteForLead(leadId: string, authToken: string): Promise<{ quoteId: string }> {
  await verifyServerActionCaller(authToken);
  const store = db();
  const leadRef = store.collection("leads").doc(leadId);

  return store.runTransaction(async (tx) => {
    const leadSnap = await tx.get(leadRef);
    if (!leadSnap.exists) throw new Error("Lead not found");
    const lead = leadSnap.data() as Lead;
    const now = new Date().toISOString();

    if (lead.quoteId) {
      const qRef = store.collection("quoteRequests").doc(lead.quoteId);
      const qSnap = await tx.get(qRef);
      if (qSnap.exists) {
        if (!qSnap.get("leadId")) tx.update(qRef, { leadId });
        return { quoteId: lead.quoteId };
      }
    }

    const qRef = store.collection("quoteRequests").doc();
    tx.set(qRef, quoteDocForLead(lead, leadId, now));
    const activity: LeadActivity = { ts: now, type: "system", text: "Quote started" };
    tx.update(leadRef, {
      quoteId: qRef.id,
      quote: { status: "draft", total: null, version: 0 },
      quoteCount: 1,
      activity: [...(lead.activity || []), activity],
      touched: true,
      updatedAt: now,
    });
    return { quoteId: qRef.id };
  });
}

/** A fresh quote carrying the lead's contact details, at the given job site. */
function quoteDocForLead(
  lead: Lead,
  leadId: string,
  now: string,
  site: { address?: string; serviceType?: string; description?: string } = {}
): Omit<QuoteRequest, "id"> {
  return {
    name: lead.name || "",
    phone: lead.phone || "",
    email: lead.email || "",
    address: site.address ?? (lead.address || ""),
    serviceType: site.serviceType ?? (lead.serviceType || ""),
    description: site.description ?? (lead.sourceNotes || lead.notes || ""),
    urgency: "flexible",
    mapAnnotation: null,
    mapImageUrl: "",
    propertyPhotos: [],
    howHeard: lead.source ? String(lead.source) : "",
    status: "contacted",
    notes: "",
    leadId,
    origin: "lead",
    estimateStatus: "draft",
    version: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export interface NewSiteQuoteInput {
  address: string;
  serviceType?: string;
  description?: string;
}

/**
 * Another quote on the same lead, at another job site. A contractor sends
 * one address after another; each gets its own map, its own push to Bore-ON
 * and its own proposal link, while Won/Lost stays on the one lead. The lead's
 * badge follows the newest quote.
 */
export async function createQuoteForLead(
  leadId: string,
  input: NewSiteQuoteInput,
  authToken: string
): Promise<{ quoteId: string }> {
  await verifyServerActionCaller(authToken);
  const address = input.address.trim().slice(0, 300);
  if (!address) throw new Error("Give the job site an address.");
  const store = db();
  const leadRef = store.collection("leads").doc(leadId);

  return store.runTransaction(async (tx) => {
    const leadSnap = await tx.get(leadRef);
    if (!leadSnap.exists) throw new Error("Lead not found");
    const lead = leadSnap.data() as Lead;
    const now = new Date().toISOString();

    const qRef = store.collection("quoteRequests").doc();
    tx.set(qRef, quoteDocForLead(lead, leadId, now, {
      address,
      serviceType: (input.serviceType || "").trim().slice(0, 100) || lead.serviceType || "",
      description: (input.description || "").trim().slice(0, 2000),
    }));
    const count = Math.max(lead.quoteCount || (lead.quoteId ? 1 : 0), 0) + 1;
    const activity: LeadActivity = { ts: now, type: "system", text: `Quote started for ${address}` };
    tx.update(leadRef, {
      quoteId: qRef.id,
      quote: { status: "draft", total: null, version: 0 },
      quoteCount: count,
      activity: [...(lead.activity || []), activity],
      touched: true,
      updatedAt: now,
    });
    return { quoteId: qRef.id };
  });
}

/**
 * The address found on the quote's map, kept where people look for it. A
 * lead from the ad sheet arrives with no address; the estimator finds it on
 * the map while quoting. Fills the quote's and the lead's address only when
 * they are blank, so a hand-typed one is never overwritten.
 */
export async function syncQuoteAddress(quoteId: string, address: string, authToken: string): Promise<void> {
  await verifyServerActionCaller(authToken);
  const clean = address.trim().slice(0, 400);
  if (!clean) return;
  const store = db();
  const qRef = store.collection("quoteRequests").doc(quoteId);
  const qSnap = await qRef.get();
  if (!qSnap.exists) return;
  const quote = qSnap.data() as Omit<QuoteRequest, "id">;
  const now = new Date().toISOString();
  const batch = store.batch();
  if (!quote.address) batch.update(qRef, { address: clean, updatedAt: now });
  if (quote.leadId) {
    const leadRef = store.collection("leads").doc(quote.leadId);
    const leadSnap = await leadRef.get();
    if (leadSnap.exists && !leadSnap.get("address")) batch.update(leadRef, { address: clean, updatedAt: now });
  }
  await batch.commit();
}

export interface SendProposalInput {
  to: string;
  message: string;
  scopeText: string;
  validDays: number;
  sendEmail: boolean;
}

/**
 * Snapshot the saved quote into an immutable proposal, supersede the old
 * version, update the quote and lead, then email the link. Totals are
 * recomputed here; the client's numbers are never trusted.
 */
export async function sendProposal(
  quoteId: string,
  input: SendProposalInput,
  authToken: string
): Promise<{ url: string; version: number; emailed: boolean; emailError?: string; quickbooks: QboOutcome }> {
  const caller = await verifyServerActionCaller(authToken);
  const store = db();
  const qRef = store.collection("quoteRequests").doc(quoteId);
  const token = randomBytes(24).toString("base64url");
  const now = new Date();
  const nowIso = now.toISOString();
  const validDays = Math.min(Math.max(Math.round(input.validDays || DEFAULT_VALID_DAYS), 1), 120);
  const expiresAt = new Date(now.getTime() + validDays * 86400000).toISOString();
  const to = input.to.trim().toLowerCase();

  const result = await store.runTransaction(async (tx) => {
    const qSnap = await tx.get(qRef);
    if (!qSnap.exists) throw new Error("Quote not found");
    const quote = { id: qSnap.id, ...(qSnap.data() as Omit<QuoteRequest, "id">) } as QuoteRequest;

    let lines: QuoteLine[] = (quote.quoteLines || []).filter((l) => (Number(l.qty) || 0) * (Number(l.unitPrice) || 0) > 0);
    if (lines.length === 0 && typeof quote.quotedPrice === "number" && quote.quotedPrice > 0) {
      lines = [{ description: "Directional drilling, per scope", kind: "work", qty: 1, unitPrice: quote.quotedPrice }];
    }
    if (lines.length === 0) throw new Error("Save a price or at least one line item before sending.");
    const totals = computeLineTotals(lines);

    const leadId = quote.leadId || "";
    const leadRef = leadId ? store.collection("leads").doc(leadId) : null;
    const leadSnap = leadRef ? await tx.get(leadRef) : null;

    const oldToken = quote.proposalId || "";
    const oldRef = oldToken ? store.collection("proposals").doc(oldToken) : null;
    const oldSnap = oldRef ? await tx.get(oldRef) : null;
    if (oldSnap?.exists && oldSnap.get("status") === "accepted") {
      throw new Error("This quote was already accepted. Start a new quote for changes.");
    }

    const version = (quote.version || 0) + 1;
    const scopeText = input.scopeText.trim() || defaultScope(quote.serviceType, quote.mapAnnotation?.runFeet);
    const proposal: Proposal = {
      quoteId,
      leadId,
      version,
      status: "sent",
      customer: {
        name: quote.name || "",
        email: to || quote.email || "",
        phone: quote.phone || "",
        address: quote.address || "",
      },
      scopeText,
      terms: STANDARD_TERMS,
      lines,
      totals,
      annotation: quote.mapAnnotation ?? null,
      ...(quote.boreOnPlanImageUrl ? { planImageUrl: quote.boreOnPlanImageUrl } : {}),
      sentAt: nowIso,
      sentBy: caller.email || caller.uid,
      sentTo: to,
      expiresAt,
      viewCount: 0,
    };
    tx.set(store.collection("proposals").doc(token), proposal);
    if (oldSnap?.exists) tx.update(oldRef!, { status: "superseded", supersededBy: token });

    tx.update(qRef, {
      estimateStatus: "sent",
      version,
      proposalId: token,
      sentAt: nowIso,
      expiresAt,
      scopeText,
      quotedPrice: totals.total,
      status: "quoted",
      updatedAt: nowIso,
    });

    if (leadRef && leadSnap?.exists) {
      const lead = leadSnap.data() as Lead;
      const act: LeadActivity = {
        ts: nowIso,
        type: "quote",
        text: `Quote v${version} sent${to ? ` to ${to}` : ""}: ${money(totals.total)}`,
      };
      const today = nowIso.slice(0, 10);
      tx.update(leadRef, {
        ...contactPatch(lead, act, today),
        stage: EARLY_STAGES.includes(String(lead.stage)) ? "quoted" : lead.stage,
        nextAction: "Follow up on quote",
        nextActionAt: addDays(today, 3),
        quote: { status: "sent", total: totals.total, version, sentAt: nowIso, url: proposalUrl(token) },
        activity: [...(lead.activity || []), act],
        touched: true,
        updatedAt: nowIso,
      });
    }

    return { version, customerName: quote.name || "", total: totals.total, scopeText };
  });

  const url = proposalUrl(token);
  // The estimate in QuickBooks mirrors what was just sent. Never blocks the send.
  const quickbooks = await recordEstimateForQuote(quoteId, { db: store, emailTo: to }).catch(
    (e): QboOutcome => ({ error: e instanceof Error ? e.message : "QuickBooks failed" })
  );
  let emailed = false;
  let emailError: string | undefined;
  if (input.sendEmail && to) {
    try {
      await sendProposalEmail({
        to,
        customerName: result.customerName,
        url,
        total: result.total,
        version: result.version,
        message: input.message,
        expiresAt,
      });
      emailed = true;
    } catch (e) {
      emailError = e instanceof Error ? e.message : "Email failed";
    }
  }
  return { url, version: result.version, emailed, emailError, quickbooks };
}

/** Record (or refresh) the QuickBooks estimate for a quote that was already sent. */
export async function syncQuoteToQuickBooks(quoteId: string, authToken: string): Promise<QboOutcome> {
  await verifyServerActionCaller(authToken);
  return recordEstimateForQuote(quoteId);
}
