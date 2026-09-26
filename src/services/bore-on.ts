// Server side of the Bore-ON link: read a design back and apply it to the
// quote. Shared by the signed callback (Bore-ON tells us) and the pull route
// (the estimator asks). Admin SDK only; every write is awaited.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { quoteLinesFromReadback, repriceNote, type Reprice } from "@/lib/bore-on/reprice";
import type { BoreOnEvent, BoreOnReadback } from "@/lib/bore-on/types";
import { computeLineTotals, stableStringify } from "@/lib/proposal";
import type { LeadActivity } from "@/lib/leads";
import type { QuoteRequest } from "@/lib/types";

export interface BoreOnSecrets {
  baseUrl?: string;
  apiKey?: string;
  webhookSecret?: string;
}

export async function loadBoreOnSecrets(db: Firestore): Promise<BoreOnSecrets> {
  const snap = await db.collection("integrationSecrets").doc("boreOn").get();
  return (snap.data() as BoreOnSecrets | undefined) ?? {};
}

/** GET the design from Bore-ON. Null when it cannot be read (logged). */
export async function fetchBoreOnReadback(secrets: BoreOnSecrets, designId: string): Promise<BoreOnReadback | null> {
  if (!secrets.baseUrl || !secrets.apiKey) return null;
  const base = secrets.baseUrl.replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/api/v1/designs/${encodeURIComponent(designId)}`, {
      headers: { Authorization: `Bearer ${secrets.apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.error("Bore-ON readback failed:", res.status);
      return null;
    }
    const body = (await res.json()) as BoreOnReadback;
    return body?.result ? body : null;
  } catch (err) {
    console.error("Bore-ON readback failed:", err);
    return null;
  }
}

const EVENT_TEXT: Record<BoreOnEvent, string> = {
  "design.designed": "Bore-ON: design drawn up, ready for review",
  "design.approved": "Bore-ON: design approved",
  "design.updated": "Bore-ON: design changed",
};


/** What a readback would do to the quote's price. Pure. */
export interface RepricePlan {
  reprice: Reprice | null;
  /** New total, when Bore-ON prices the quote. */
  total: number | null;
  /** True when the lines or the total would actually change. */
  changes: boolean;
  /** The quote's total before (quotedPrice, or its lines' total). */
  oldTotal: number | null;
}

export function repricePlan(fresh: Partial<QuoteRequest>, result: BoreOnReadback["result"]): RepricePlan {
  const oldTotal =
    typeof fresh.quotedPrice === "number"
      ? fresh.quotedPrice
      : fresh.quoteLines?.length
        ? computeLineTotals(fresh.quoteLines).total
        : null;
  const reprice = fresh.estimateStatus === "accepted" ? null : quoteLinesFromReadback(result, fresh.quoteLines);
  if (!reprice) return { reprice: null, total: null, changes: false, oldTotal };
  const total = computeLineTotals(reprice.lines).total;
  const linesChanged = stableStringify(reprice.lines) !== stableStringify(fresh.quoteLines ?? []);
  return { reprice, total, changes: linesChanged || fresh.quotedPrice !== total, oldTotal };
}

const money = (n: number | null | undefined) =>
  typeof n === "number" ? n.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "no price";

/**
 * Write the readback onto the quote, re-price it unless the customer already
 * accepted (an accepted quote is a contract; sendProposal refuses to change
 * it too), and put a line in the lead's history.
 *
 * A re-price keeps what it replaced (previousQuoteLines / previousTotal /
 * previousRepricedAt) so "Put back previous Bore-ON prices" can swap it back.
 * `approve`, when given, is asked before a price change: pull-all passes the
 * totals Bill confirmed in the preview, and a quote whose new total no longer
 * matches is left untouched (`held: true`).
 */
export async function applyBoreOnReadback(
  db: Firestore,
  quoteId: string,
  quote: Omit<QuoteRequest, "id">,
  readback: BoreOnReadback,
  meta: { event?: BoreOnEvent; deliveryId?: string; url?: string; updatedAt?: string },
  opts: { approve?: (plan: RepricePlan) => boolean } = {}
): Promise<{ repriced: boolean; changed?: boolean; total: number | null; oldTotal?: number | null; held?: boolean }> {
  const now = new Date().toISOString();
  const result = readback.result;
  const qRef = db.collection("quoteRequests").doc(quoteId);

  // The readback can take many seconds to arrive (pull-all runs for
  // minutes), so the quote passed in may be stale. Re-read it and apply the
  // re-price in a transaction, so a line the estimator saved meanwhile is
  // kept instead of being written over.
  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(qRef);
    const fresh = snap.exists ? (snap.data() as Omit<QuoteRequest, "id">) : quote;
    const plan = repricePlan(fresh, result);
    if (plan.changes && opts.approve && !opts.approve(plan)) {
      return { held: true as const, total: plan.total, oldTotal: plan.oldTotal };
    }
    const patch: Record<string, unknown> = {
      boreOnDesignId: readback.designId,
      boreOnUrl: meta.url || readback.url || fresh.boreOnUrl || "",
      boreOnStatus: readback.status,
      boreOnUpdatedAt: meta.updatedAt || readback.updatedAt || now,
      boreOnResult: result,
      boreOnPlanImageUrl: result.planImageUrl ?? null,
      updatedAt: now,
      ...(meta.event ? { boreOnEvent: meta.event } : {}),
      ...(meta.deliveryId ? { boreOnDeliveryId: meta.deliveryId } : {}),
    };

    const texts: string[] = [meta.event ? EVENT_TEXT[meta.event] : "Bore-ON: design pulled"];
    const { reprice, total } = plan;
    if (reprice && total !== null) {
      if (plan.changes) {
        patch.quoteLines = reprice.lines;
        patch.quotedPrice = total;
        patch.boreOnRepricedAt = now;
        // Kept for "Put back previous Bore-ON prices".
        patch.previousQuoteLines = fresh.quoteLines ?? [];
        patch.previousTotal = plan.oldTotal;
        patch.previousRepricedAt = now;
        // The customer's price changed: a sent quote now needs a revision.
        patch.contentChangedAt = now;
        if (fresh.status === "new") patch.status = "quoted";
      }
      texts.push(repriceNote(reprice, total, plan.changes ? plan.oldTotal : null));
      if (reprice.uncovered.length) texts.push(`Not priced by Bore-ON: ${reprice.uncovered.join(", ")}`);
    } else if (fresh.estimateStatus === "accepted") {
      texts.push("Quote already accepted, price left alone");
    }
    if (snap.exists) tx.update(qRef, patch);
    return {
      held: false as const,
      texts,
      total,
      oldTotal: plan.oldTotal,
      repriced: Boolean(reprice),
      changed: plan.changes,
      leadId: fresh.leadId || "",
      boreOnUrl: String(patch.boreOnUrl || ""),
    };
  });
  if (out.held) return { repriced: false, total: out.total, oldTotal: out.oldTotal, held: true };

  await mirrorToLead(db, quoteId, out.leadId, out.texts.join(". "), now, { boreOnUrl: out.boreOnUrl });
  return { repriced: out.repriced, changed: out.changed, total: out.total, oldTotal: out.oldTotal };
}

/** Put a line in the quote's lead's history (never fails the caller). */
async function mirrorToLead(
  db: Firestore,
  quoteId: string,
  leadId: string,
  text: string,
  now: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  try {
    const leadSnap = leadId
      ? await db.collection("leads").doc(leadId).get()
      : (await db.collection("leads").where("quoteId", "==", quoteId).limit(1).get()).docs[0];
    if (leadSnap?.exists) {
      // "system": a Bore-ON callback is not Bill touching the customer, so
      // it must not cover a follow-up step or become the sheet's notes.
      // TODO(by): add `by` to this LeadActivity once the field exists (the
      // put-back is a person; callbacks and pulls are Bore-ON).
      const entry: LeadActivity = { ts: now, type: "system", text };
      // Append, don't rewrite the history (another writer may be mid-save).
      await leadSnap.ref.update({ ...extra, activity: FieldValue.arrayUnion(entry), updatedAt: now });
    }
  } catch (err) {
    console.error("Lead Bore-ON mirror failed:", err);
  }
}

export class RestoreError extends Error {
  constructor(
    message: string,
    public status = 409
  ) {
    super(message);
  }
}

/**
 * "Put back previous Bore-ON prices": swap the quote's lines and total back
 * to what the last Bore-ON re-price replaced. Only while nothing has changed
 * the quote's content since that re-price (contentChangedAt still equals
 * previousRepricedAt) and the customer hasn't accepted.
 */
export async function restorePreviousBoreOnPrices(
  db: Firestore,
  quoteId: string
): Promise<{ total: number | null; was: number | null }> {
  const now = new Date().toISOString();
  const qRef = db.collection("quoteRequests").doc(quoteId);
  const r = await db.runTransaction(async (tx) => {
    const snap = await tx.get(qRef);
    if (!snap.exists) throw new RestoreError("Quote not found", 404);
    const q = snap.data() as Omit<QuoteRequest, "id">;
    if (!q.previousRepricedAt || !Array.isArray(q.previousQuoteLines)) {
      throw new RestoreError("There are no earlier Bore-ON prices to put back on this quote.");
    }
    if (q.estimateStatus === "accepted") {
      throw new RestoreError("The customer already accepted this quote, so its price stays.");
    }
    if ((q.contentChangedAt || "") !== q.previousRepricedAt) {
      throw new RestoreError(
        "The quote was edited after the Bore-ON re-price, so the old prices can't be put back automatically. Change the lines by hand."
      );
    }
    const lines = q.previousQuoteLines;
    const total =
      typeof q.previousTotal === "number" ? q.previousTotal : lines.length ? computeLineTotals(lines).total : null;
    tx.update(qRef, {
      quoteLines: lines,
      quotedPrice: total,
      contentChangedAt: now,
      updatedAt: now,
      // The workbench reloads its lines when this moves.
      boreOnRepricedAt: now,
      boreOnRestoredAt: now,
      previousQuoteLines: FieldValue.delete(),
      previousTotal: FieldValue.delete(),
      previousRepricedAt: FieldValue.delete(),
    });
    return { total, was: typeof q.quotedPrice === "number" ? q.quotedPrice : null, leadId: q.leadId || "" };
  });
  await mirrorToLead(db, quoteId, r.leadId, `Bore-ON prices put back: ${money(r.was)} → ${money(r.total)}`, now);
  return { total: r.total, was: r.was };
}
