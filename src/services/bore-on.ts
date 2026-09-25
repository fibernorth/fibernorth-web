// Server side of the Bore-ON link: read a design back and apply it to the
// quote. Shared by the signed callback (Bore-ON tells us) and the pull route
// (the estimator asks). Admin SDK only; every write is awaited.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { quoteLinesFromReadback, repriceNote } from "@/lib/bore-on/reprice";
import type { BoreOnEvent, BoreOnReadback } from "@/lib/bore-on/types";
import { computeLineTotals } from "@/lib/proposal";
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

/**
 * Write the readback onto the quote, re-price it unless the customer already
 * accepted (an accepted quote is a contract; sendProposal refuses to change
 * it too), and put a line in the lead's history.
 */
export async function applyBoreOnReadback(
  db: Firestore,
  quoteId: string,
  quote: Omit<QuoteRequest, "id">,
  readback: BoreOnReadback,
  meta: { event?: BoreOnEvent; deliveryId?: string; url?: string; updatedAt?: string }
): Promise<{ repriced: boolean; total: number | null }> {
  const now = new Date().toISOString();
  const result = readback.result;
  const patch: Record<string, unknown> = {
    boreOnDesignId: readback.designId,
    boreOnUrl: meta.url || readback.url || quote.boreOnUrl || "",
    boreOnStatus: readback.status,
    boreOnUpdatedAt: meta.updatedAt || readback.updatedAt || now,
    boreOnResult: result,
    boreOnPlanImageUrl: result.planImageUrl ?? null,
    updatedAt: now,
    ...(meta.event ? { boreOnEvent: meta.event } : {}),
    ...(meta.deliveryId ? { boreOnDeliveryId: meta.deliveryId } : {}),
  };

  const texts: string[] = [meta.event ? EVENT_TEXT[meta.event] : "Bore-ON: design pulled"];
  const reprice = quote.estimateStatus === "accepted" ? null : quoteLinesFromReadback(result, quote.quoteLines);
  let total: number | null = null;
  if (reprice) {
    total = computeLineTotals(reprice.lines).total;
    patch.quoteLines = reprice.lines;
    patch.quotedPrice = total;
    patch.boreOnRepricedAt = now;
    if (quote.status === "new") patch.status = "quoted";
    texts.push(repriceNote(reprice, total));
    if (reprice.uncovered.length) texts.push(`Not priced by Bore-ON: ${reprice.uncovered.join(", ")}`);
  } else if (quote.estimateStatus === "accepted") {
    texts.push("Quote already accepted, price left alone");
  }
  await db.collection("quoteRequests").doc(quoteId).update(patch);

  try {
    const leadId = quote.leadId || "";
    const leadSnap = leadId
      ? await db.collection("leads").doc(leadId).get()
      : (await db.collection("leads").where("quoteId", "==", quoteId).limit(1).get()).docs[0];
    if (leadSnap?.exists) {
      const entry: LeadActivity = { ts: now, type: "quote", text: texts.join(". ") };
      // Append, don't rewrite the history (another writer may be mid-save).
      await leadSnap.ref.update({ boreOnUrl: patch.boreOnUrl, activity: FieldValue.arrayUnion(entry), updatedAt: now });
    }
  } catch (err) {
    console.error("Lead Bore-ON mirror failed:", err);
  }

  return { repriced: Boolean(reprice), total };
}
