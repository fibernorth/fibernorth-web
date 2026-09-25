"use server";

import { randomBytes } from "crypto";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyServerActionCaller } from "@/lib/server-action-auth";
import {
  acceptedSaleTotal,
  computeLineTotals,
  customerContentKey,
  DEFAULT_VALID_DAYS,
  defaultScope,
  money,
  proposalLines,
  proposalUrl,
  stableStringify,
  STANDARD_TERMS,
} from "@/lib/proposal";
import { isExpired } from "@/lib/proposal-server";
import { addDays, contactPatch, todayISO, type Lead, type LeadActivity } from "@/lib/leads";
import { canReplaceNextAction, nextCadenceStep } from "@/lib/cadence";
import { enforceAdminEmailLimit } from "@/lib/rate-limit";
import type { MapAnnotation, Proposal, QuoteLine, QuoteRequest } from "@/lib/types";
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
  // Check the email limit before anything is written, so a refusal doesn't
  // leave a half-sent version behind.
  if (input.sendEmail && to) await enforceAdminEmailLimit(caller.uid);

  const result = await store.runTransaction(async (tx) => {
    const qSnap = await tx.get(qRef);
    if (!qSnap.exists) throw new Error("Quote not found");
    const quote = { id: qSnap.id, ...(qSnap.data() as Omit<QuoteRequest, "id">) } as QuoteRequest;

    // $0 lines with a description stay on the customer's copy as "Included".
    const lines: QuoteLine[] = proposalLines(quote.quoteLines, quote.quotedPrice).map((l) => ({
      description: l.description,
      kind: l.kind,
      qty: Number(l.qty) || 0,
      unitPrice: Number(l.unitPrice) || 0,
    }));
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
      // Opens are counted per version; the new link starts at zero.
      viewCount: 0,
      viewedAt: FieldValue.delete(),
      lastViewedAt: FieldValue.delete(),
      updatedAt: nowIso,
    });

    if (leadRef && leadSnap?.exists) {
      const lead = leadSnap.data() as Lead;
      const act: LeadActivity = {
        ts: nowIso,
        type: "quote",
        text: `Quote v${version} sent${to ? ` to ${to}` : ""}: ${money(totals.total)}`,
      };
      const today = todayISO(now);
      const stage = EARLY_STAGES.includes(String(lead.stage)) ? "quoted" : String(lead.stage);
      const badge = { status: "sent", total: totals.total, version, sentAt: nowIso, expiresAt, url: proposalUrl(token) };
      // First step of the quote follow-up schedule (day 2 text), unless Bill
      // has his own next action set for a later day.
      const step = nextCadenceStep({ ...lead, stage, quote: badge, activity: [...(lead.activity || []), act] }, today);
      const next = canReplaceNextAction(lead, today)
        ? step
          ? { nextAction: step.label, nextActionAt: step.date, nextActionAuto: true }
          : { nextAction: "Follow up on quote", nextActionAt: addDays(today, 3), nextActionAuto: false }
        : {};
      tx.update(leadRef, {
        ...contactPatch(lead, act, today),
        stage,
        ...next,
        quote: badge,
        activity: [...(lead.activity || []), act],
        touched: true,
        updatedAt: nowIso,
      });
    }

    return { version, customerName: quote.name || "", address: quote.address || "", total: totals.total, scopeText };
  });

  const url = proposalUrl(token);
  let emailed = false;
  let emailError: string | undefined;
  if (input.sendEmail && to) {
    const sent = await emailProposal(store, quoteId, {
      senderEmail: caller.email || undefined,
      to,
      customerName: result.customerName,
      address: result.address,
      url,
      total: result.total,
      version: result.version,
      message: input.message,
      expiresAt,
    });
    emailed = sent.ok;
    emailError = sent.error;
  }
  return { url, version: result.version, emailed, emailError };
}

/**
 * Send the quote email and keep a record of the try on the quote, so
 * "did it go?" has an answer a day later: who, when, which version, and
 * Resend's message id or its error.
 */
async function emailProposal(
  store: Firestore,
  quoteId: string,
  data: Parameters<typeof sendProposalEmail>[0]
): Promise<{ ok: boolean; error?: string }> {
  const at = new Date().toISOString();
  try {
    const r = await sendProposalEmail(data);
    await store.collection("quoteRequests").doc(quoteId).update({
      lastEmail: { to: data.to, at, version: data.version, id: r.id, bcc: r.bcc },
    });
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Email failed";
    await store
      .collection("quoteRequests")
      .doc(quoteId)
      .update({ lastEmail: { to: data.to, at, version: data.version, error } })
      .catch(() => {});
    return { ok: false, error };
  }
}

/**
 * Email the current version again, without making a new version: for a
 * customer who never got it, or a second address. Same BCC, same record.
 */
export async function resendProposalEmail(
  quoteId: string,
  input: { to: string; message: string },
  authToken: string
): Promise<{ emailed: boolean; emailError?: string; version: number }> {
  const caller = await verifyServerActionCaller(authToken);
  const to = input.to.trim().toLowerCase();
  if (!to.includes("@")) throw new Error("Enter the customer's email address.");
  const store = db();
  const qSnap = await store.collection("quoteRequests").doc(quoteId).get();
  if (!qSnap.exists) throw new Error("Quote not found");
  const quote = qSnap.data() as Omit<QuoteRequest, "id">;
  if (!quote.proposalId) throw new Error("Send the quote first.");
  const pSnap = await store.collection("proposals").doc(quote.proposalId).get();
  if (!pSnap.exists) throw new Error("The sent proposal is missing.");
  const p = pSnap.data() as Proposal;
  if (p.status === "superseded") throw new Error("A newer version exists; send that one.");
  if (p.status === "accepted") throw new Error("The customer already accepted this quote.");
  // The link on an expired proposal only says "This quote expired". Send a
  // fresh version instead (same price, new date).
  if (isExpired(p)) {
    const on = new Date(p.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Detroit" });
    throw new Error(`Version ${p.version} expired ${on}, so its link won't work. Send a fresh copy with a new date instead.`);
  }

  await enforceAdminEmailLimit(caller.uid);
  const sent = await emailProposal(store, quoteId, {
    senderEmail: caller.email || undefined,
    to,
    customerName: p.customer.name,
    address: p.customer.address,
    url: proposalUrl(quote.proposalId),
    total: p.totals.total,
    version: p.version,
    message: input.message,
    expiresAt: p.expiresAt,
  });

  if (sent.ok && quote.leadId) {
    const leadRef = store.collection("leads").doc(quote.leadId);
    const leadSnap = await leadRef.get();
    if (leadSnap.exists) {
      const now = new Date().toISOString();
      const act: LeadActivity = { ts: now, type: "quote", text: `Quote v${p.version} emailed again to ${to}` };
      await leadRef.update({ activity: FieldValue.arrayUnion(act), updatedAt: now });
    }
  }
  return { emailed: sent.ok, emailError: sent.error, version: p.version };
}

/**
 * Take back an acceptance that was a test or a slip. The proposal goes back
 * to sent (or viewed), the quote can be revised and re-sent, and the lead
 * returns to Quoted. The customer's link keeps working. Logged on the lead
 * with who did it.
 */
export async function undoAcceptance(quoteId: string, authToken: string): Promise<{ ok: true }> {
  const caller = await verifyServerActionCaller(authToken);
  const store = db();
  const qRef = store.collection("quoteRequests").doc(quoteId);
  const now = new Date().toISOString();

  await store.runTransaction(async (tx) => {
    const qSnap = await tx.get(qRef);
    if (!qSnap.exists) throw new Error("Quote not found");
    const quote = qSnap.data() as Omit<QuoteRequest, "id">;
    if (quote.estimateStatus !== "accepted") throw new Error("This quote isn't accepted.");
    const pRef = quote.proposalId ? store.collection("proposals").doc(quote.proposalId) : null;
    const pSnap = pRef ? await tx.get(pRef) : null;
    const p = pSnap?.exists ? (pSnap.data() as Proposal) : null;
    const leadRef = quote.leadId ? store.collection("leads").doc(quote.leadId) : null;
    const leadSnap = leadRef ? await tx.get(leadRef) : null;
    // Other accepted quotes on the same lead still count toward the sale.
    const siblings = quote.leadId
      ? (await tx.get(store.collection("proposals").where("leadId", "==", quote.leadId))).docs
      : [];
    const allAccepted = acceptedSaleTotal(siblings.map((d) => d.data() as Proposal));
    const othersAccepted = acceptedSaleTotal(
      siblings.filter((d) => d.id !== quote.proposalId).map((d) => d.data() as Proposal)
    );

    const back: "sent" | "viewed" = p?.viewedAt ? "viewed" : "sent";
    if (pRef && p) {
      tx.update(pRef, {
        status: back,
        acceptedAt: FieldValue.delete(),
        acceptedName: FieldValue.delete(),
        acceptedIp: FieldValue.delete(),
        acceptedUa: FieldValue.delete(),
      });
    }
    tx.update(qRef, { estimateStatus: back, acceptedAt: FieldValue.delete(), updatedAt: now });

    if (leadRef && leadSnap?.exists) {
      const lead = leadSnap.data() as Lead;
      const total = p?.totals.total ?? quote.quotedPrice ?? null;
      const act: LeadActivity = {
        ts: now,
        type: "quote",
        text: `Acceptance of quote v${quote.version || 1} undone by ${caller.email || "admin"} (it was a test or a slip)`,
      };
      // Only touch a sale amount we set: this quote's total, or the sum of
      // accepted quotes. One typed by hand is left alone.
      const ours = [allAccepted.toFixed(2), ...(total !== null ? [total.toFixed(2)] : [])];
      const resetSale = !!lead.saleAmount && ours.includes(String(lead.saleAmount));
      tx.update(leadRef, {
        ...(lead.stage === "won" && othersAccepted <= 0 ? { stage: "quoted" } : {}),
        ...(resetSale
          ? {
              saleAmount: othersAccepted > 0 ? othersAccepted.toFixed(2) : "",
              saleAmountNum: othersAccepted > 0 ? Math.round(othersAccepted * 100) / 100 : null,
            }
          : {}),
        nextAction: "Follow up on quote",
        nextActionAt: todayISO(),
        quote: { ...(lead.quote || {}), status: back },
        activity: [...(lead.activity || []), act],
        touched: true,
        updatedAt: now,
      });
    }
  });

  return { ok: true };
}

export interface QuoteContactInput {
  name: string;
  phone: string;
  email: string;
  address: string;
}

/**
 * Fix the customer's name or contact details on a quote. The linked lead
 * follows for any field that still matched the quote's old value, so the two
 * stay in step without overwriting something typed on the lead on purpose.
 * Proposals already sent are frozen snapshots and are left alone; re-send to
 * put the corrected details in front of the customer.
 */
export async function updateQuoteContact(quoteId: string, input: QuoteContactInput, authToken: string): Promise<{ ok: true }> {
  await verifyServerActionCaller(authToken);
  const clean = {
    name: input.name.trim().slice(0, 200),
    phone: input.phone.trim().slice(0, 40),
    email: input.email.trim().toLowerCase().slice(0, 200),
    address: input.address.trim().slice(0, 400),
  };
  if (!clean.name) throw new Error("The customer needs a name.");
  const store = db();
  const qRef = store.collection("quoteRequests").doc(quoteId);
  const now = new Date().toISOString();

  await store.runTransaction(async (tx) => {
    const qSnap = await tx.get(qRef);
    if (!qSnap.exists) throw new Error("Quote not found");
    const quote = qSnap.data() as Omit<QuoteRequest, "id">;
    const leadRef = quote.leadId ? store.collection("leads").doc(quote.leadId) : null;
    const leadSnap = leadRef ? await tx.get(leadRef) : null;
    // Name and address print on the proposal: a change there means a sent
    // quote is out of date. Email and phone don't show on it.
    const shown = clean.name !== (quote.name || "").trim() || clean.address !== (quote.address || "").trim();
    tx.update(qRef, { ...clean, updatedAt: now, ...(shown ? { contentChangedAt: now } : {}) });
    if (leadRef && leadSnap?.exists) {
      const lead = leadSnap.data() as Lead;
      const patch: Record<string, string> = {};
      for (const k of ["name", "phone", "email", "address"] as const) {
        const old = (quote[k] || "").trim();
        if (clean[k] !== old && ((lead[k] || "").trim() === old || !lead[k])) patch[k] = clean[k];
      }
      if (Object.keys(patch).length) tx.update(leadRef, { ...patch, touched: true, updatedAt: now });
    }
  });
  return { ok: true };
}

/**
 * The linked lead's current contact details. The quote copies them once
 * when it is made; a fix made later on the lead card only lives on the lead,
 * so the send panel asks for them here.
 */
export async function getLeadContact(
  leadId: string,
  authToken: string
): Promise<{ name: string; email: string; phone: string } | null> {
  await verifyServerActionCaller(authToken);
  if (!leadId) return null;
  const snap = await db().collection("leads").doc(leadId).get();
  if (!snap.exists) return null;
  const lead = snap.data() as Lead;
  return { name: lead.name || "", email: (lead.email || "").trim().toLowerCase(), phone: lead.phone || "" };
}

export interface QuoteWorkInput {
  mapAnnotation: MapAnnotation | null;
  quotedPrice: number | null;
  quoteLines: QuoteLine[] | null;
  scopeText: string;
}

/**
 * Save the workbench: drawing, price, lines and scope. Writes nothing when
 * nothing changed, so pressing Save twice doesn't make a sent quote look
 * edited. contentChangedAt moves only when something the customer sees
 * changed; the send panel compares it with sentAt to offer a revision.
 */
export async function saveQuoteWork(
  quoteId: string,
  input: QuoteWorkInput,
  authToken: string
): Promise<{ wrote: boolean; changed: boolean }> {
  await verifyServerActionCaller(authToken);
  const store = db();
  const qRef = store.collection("quoteRequests").doc(quoteId);
  const scopeText = (input.scopeText || "").trim().slice(0, 4000);
  const quotedPrice =
    typeof input.quotedPrice === "number" && Number.isFinite(input.quotedPrice) && input.quotedPrice >= 0
      ? Math.round(input.quotedPrice * 100) / 100
      : null;
  // Round-trip through JSON: drops undefined fields Firestore would reject.
  const plain = <T,>(v: T): T => (v == null ? v : (JSON.parse(JSON.stringify(v)) as T));
  const quoteLines = input.quoteLines && input.quoteLines.length ? plain(input.quoteLines.slice(0, 200)) : null;
  const mapAnnotation = plain(input.mapAnnotation ?? null);
  const now = new Date().toISOString();

  return store.runTransaction(async (tx) => {
    const snap = await tx.get(qRef);
    if (!snap.exists) throw new Error("Quote not found");
    const quote = snap.data() as Omit<QuoteRequest, "id">;
    const next = { mapAnnotation, quotedPrice, quoteLines, scopeText };
    const changed = customerContentKey(next) !== customerContentKey(quote);
    // Everything we'd write, except the viewport, which moves on every pan.
    const full = (q: { mapAnnotation?: MapAnnotation | null; quotedPrice?: number | null; quoteLines?: QuoteLine[] | null; scopeText?: string }) =>
      stableStringify([
        q.mapAnnotation ? { ...q.mapAnnotation, center: null, zoom: null } : null,
        q.quotedPrice ?? null,
        q.quoteLines ?? null,
        (q.scopeText || "").trim(),
      ]);
    const wantsStatus = quotedPrice !== null && quote.status === "new";
    if (!wantsStatus && full(next) === full(quote)) {
      return { wrote: false, changed: false };
    }
    tx.update(qRef, {
      ...next,
      ...(wantsStatus ? { status: "quoted" } : {}),
      ...(changed ? { contentChangedAt: now } : {}),
      updatedAt: now,
    });
    return { wrote: true, changed };
  });
}

/**
 * Ask Resend what happened to the last quote email: delivered, bounced,
 * marked as spam, opened... so "did he get it?" has a real answer.
 */
export async function checkEmailDelivery(
  quoteId: string,
  authToken: string
): Promise<{ status: string; detail: string }> {
  await verifyServerActionCaller(authToken);
  const store = db();
  const qSnap = await store.collection("quoteRequests").doc(quoteId).get();
  const last = qSnap.get("lastEmail") as { id?: string; to?: string; error?: string } | undefined;
  if (!last) return { status: "none", detail: "No email has been recorded for this quote yet." };
  if (last.error) return { status: "failed", detail: `The send itself failed: ${last.error}` };
  if (!last.id) return { status: "unknown", detail: "No tracking id was saved for the last email." };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { status: "unknown", detail: "Email isn't set up on the server." };
  const res = await fetch(`https://api.resend.com/emails/${encodeURIComponent(last.id)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!res.ok) return { status: "unknown", detail: `Couldn't reach the mail service (${res.status}).` };
  const j = (await res.json().catch(() => ({}))) as { last_event?: string; to?: string[] };
  const ev = (j.last_event || "unknown").toLowerCase();
  const plain: Record<string, string> = {
    delivered: `Delivered to ${last.to}. If they can't find it, it's in their spam or junk folder.`,
    opened: `${last.to} opened the email.`,
    clicked: `${last.to} clicked the quote link.`,
    bounced: `Bounced. ${last.to} is not a working address. Get the right email and send it again.`,
    complained: `${last.to} marked it as spam.`,
    suppressed: `Not sent. ${last.to} is on the mail service's block list because an earlier email to it bounced or was marked as spam. Check the address with the customer. If it's right, remove it from Suppressions in the Resend dashboard, then Send again.`,
    delivery_delayed: `Delivery to ${last.to} is delayed. The receiving server is slow or deferring it.`,
    sent: `Sent, waiting on ${last.to}'s mail server to accept it.`,
    queued: "Queued to send.",
    scheduled: "Scheduled to send.",
  };
  return { status: ev, detail: plain[ev] || `Mail service status: ${ev}.` };
}
