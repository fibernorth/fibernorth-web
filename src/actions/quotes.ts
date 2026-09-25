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
    tx.set(qRef, {
      name: lead.name || "",
      phone: lead.phone || "",
      email: lead.email || "",
      address: lead.address || "",
      serviceType: lead.serviceType || "",
      description: lead.sourceNotes || lead.notes || "",
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
    });
    const activity: LeadActivity = { ts: now, type: "system", text: "Quote started" };
    tx.update(leadRef, {
      quoteId: qRef.id,
      quote: { status: "draft", total: null, version: 0 },
      activity: [...(lead.activity || []), activity],
      touched: true,
      updatedAt: now,
    });
    return { quoteId: qRef.id };
  });
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
): Promise<{ url: string; version: number; emailed: boolean; emailError?: string }> {
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
  return { url, version: result.version, emailed, emailError };
}
