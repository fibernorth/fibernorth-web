// "Pull all from Bore-ON", preview and apply. Admin SDK only.

import type { Firestore } from "firebase-admin/firestore";
import {
  applyBoreOnReadback,
  fetchBoreOnReadback,
  repricePlan,
  type BoreOnSecrets,
} from "@/services/bore-on";
import type { QuoteRequest } from "@/lib/types";

export const MAX_QUOTES = 200;
const AT_A_TIME = 3;

export interface RepriceRow {
  quoteId: string;
  name: string;
  oldTotal: number | null;
  newTotal: number | null;
}

export interface PullAllResult {
  dryRun: boolean;
  total: number;
  /** Designs that would be / were read back and applied. */
  pulled: number;
  /** Quotes whose price would change / changed, old → new. */
  repricing: RepriceRow[];
  unchanged: number;
  /** Price changes not applied because they weren't in the preview at that total. */
  held: RepriceRow[];
  skipped: Array<{ quoteId: string; name: string; reason: string }>;
  /** Kept for older callers: how many quotes were re-priced. */
  repriced: number;
}

/**
 * `apply` null = preview (nothing written). With `apply.approved` (quoteId ->
 * the new total Bill saw), a price change goes through only when it matches.
 */
export async function pullAllBoreOn(
  db: Firestore,
  secrets: BoreOnSecrets,
  apply: { approved: Record<string, number | null> } | null
): Promise<PullAllResult> {
  const snap = await db.collection("quoteRequests").where("boreOnDesignId", ">", "").limit(MAX_QUOTES).get();
  const quotes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<QuoteRequest, "id">) }));

  const out: PullAllResult = {
    dryRun: !apply,
    total: quotes.length,
    pulled: 0,
    repricing: [],
    unchanged: 0,
    held: [],
    skipped: [],
    repriced: 0,
  };
  const nameOf = (q: QuoteRequest) => q.name || q.address || q.id;

  const one = async (q: QuoteRequest) => {
    const readback = await fetchBoreOnReadback(secrets, q.boreOnDesignId!);
    if (!readback) {
      out.skipped.push({ quoteId: q.id, name: nameOf(q), reason: "could not read the design" });
      return;
    }
    if (q.boreOnResult && readback.updatedAt && readback.updatedAt === q.boreOnUpdatedAt) {
      out.unchanged += 1;
      return;
    }
    if (!apply) {
      const plan = repricePlan(q, readback.result);
      out.pulled += 1;
      if (plan.changes) out.repricing.push({ quoteId: q.id, name: nameOf(q), oldTotal: plan.oldTotal, newTotal: plan.total });
      return;
    }
    const { id, ...rest } = q;
    const r = await applyBoreOnReadback(db, id, rest, readback, { url: readback.url }, {
      approve: (plan) => Object.prototype.hasOwnProperty.call(apply.approved, id) && apply.approved[id] === plan.total,
    });
    const row = { quoteId: id, name: nameOf(q), oldTotal: r.oldTotal ?? null, newTotal: r.total };
    if (r.held) {
      out.held.push(row);
      return;
    }
    out.pulled += 1;
    if (r.changed) out.repricing.push(row);
  };

  for (let i = 0; i < quotes.length; i += AT_A_TIME) {
    await Promise.all(quotes.slice(i, i + AT_A_TIME).map(one));
  }
  out.repriced = out.repricing.length;
  return out;
}
