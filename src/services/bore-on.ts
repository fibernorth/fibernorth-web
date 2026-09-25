// Server side of the Bore-ON link: read a design back and apply it to the
// quote. Shared by the signed callback (Bore-ON tells us) and the pull route
// (the estimator asks). Admin SDK only; every write is awaited.

import type { Firestore } from "firebase-admin/firestore";
import { quoteLinesFromReadback, repriceNote } from "@/lib/bore-on/reprice";
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
  const qRef = db.collection("quoteRequests").doc(quoteId);

  // The readback can take many seconds to arrive (pull-all runs for
  // minutes), so the quote passed in may be stale. Re-read it and apply the
  // re-price in a transaction, so a line the estimator saved meanwhile is
  // kept instead of being written over.
  const { texts, total, repriced, leadId, boreOnUrl } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(qRef);
    const fresh = snap.exists ? (snap.data() as Omit<QuoteRequest, "id">) : quote;
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
    const reprice = fresh.estimateStatus === "accepted" ? null : quoteLinesFromReadback(result, fresh.quoteLines);
    let total: number | null = null;
    if (reprice) {
      total = computeLineTotals(reprice.lines).total;
      const linesChanged = stableStringify(reprice.lines) !== stableStringify(fresh.quoteLines ?? []);
      if (linesChanged || fresh.quotedPrice !== total) {
        patch.quoteLines = reprice.lines;
        patch.quotedPrice = total;
        patch.boreOnRepricedAt = now;
        // The customer's price changed: a sent quote now needs a revision.
        patch.contentChangedAt = now;
        if (fresh.status === "new") patch.status = "quoted";
      }
      texts.push(repriceNote(reprice, total));
      if (reprice.uncovered.length) texts.push(`Not priced by Bore-ON: ${reprice.uncovered.join(", ")}`);
    } else if (fresh.estimateStatus === "accepted") {
      texts.push("Quote already accepted, price left alone");
    }
    if (snap.exists) tx.update(qRef, patch);
    return {
      texts,
      total,
      repriced: Boolean(reprice),
      leadId: fresh.leadId || "",
      boreOnUrl: String(patch.boreOnUrl || ""),
    };
  });

  try {
    const leadSnap = leadId
      ? await db.collection("leads").doc(leadId).get()
      : (await db.collection("leads").where("quoteId", "==", quoteId).limit(1).get()).docs[0];
    if (leadSnap?.exists) {
      const activity = (leadSnap.data()?.activity as LeadActivity[]) || [];
      const entry: LeadActivity = { ts: now, type: "quote", text: texts.join(". ") };
      await leadSnap.ref.update({ boreOnUrl, activity: [...activity, entry], updatedAt: now });
    }
  } catch (err) {
    console.error("Lead Bore-ON mirror failed:", err);
  }

  return { repriced, total };
}
