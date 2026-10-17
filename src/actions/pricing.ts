"use server";

import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyOwnerCaller, verifyServerActionCaller } from "@/lib/server-action-auth";
import { cleanPricing, type PricingSettings } from "@/lib/quote-rules";
import { loadPricing, PRICING_DOC } from "@/services/pricing";
import { diffFields, writeAudit } from "@/services/audit";

const msg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** The price rules and price list, for the quote builder and /admin/pricing. Any admin. */
export async function getPricing(authToken: string): Promise<PricingSettings> {
  await verifyServerActionCaller(authToken);
  return loadPricing(getFirestore(initializeAdminApp()));
}

/**
 * Save the price rules and price list. Owner only. `baseUpdatedAt` is the
 * updatedAt the screen loaded; when someone saved since, nothing is written.
 */
export async function savePricing(
  input: { rules: unknown; items: unknown; baseUpdatedAt?: string },
  authToken: string
): Promise<{ ok: true; settings: PricingSettings } | { ok: false; error: string }> {
  let who;
  try {
    who = await verifyOwnerCaller(authToken);
  } catch (e) {
    return { ok: false, error: msg(e, "Not authorized") };
  }
  const clean = cleanPricing({ rules: input.rules, items: input.items });
  const db = getFirestore(initializeAdminApp());
  const ref = db.collection(PRICING_DOC.col).doc(PRICING_DOC.id);
  const now = new Date().toISOString();
  const by = (who.email || who.uid).toLowerCase();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = cleanPricing(snap.exists ? snap.data() : undefined);
    if ((input.baseUpdatedAt ?? "") !== (stored.updatedAt ?? "")) {
      return { ok: false as const, error: "Someone else saved the price list since you opened it. Reload, then make your change again." };
    }
    const next = { rules: clean.rules, items: clean.items };
    const diff = diffFields(
      { rules: stored.rules, items: stored.items } as Record<string, unknown>,
      next as unknown as Record<string, unknown>
    );
    if (!diff.changed.length) return { ok: true as const, settings: stored };
    const doc: PricingSettings = { ...next, updatedAt: now, updatedBy: by };
    tx.set(ref, doc);
    await writeAudit(
      { actor: who, action: "pricing.update", target: { col: PRICING_DOC.col, id: PRICING_DOC.id }, before: diff.before, after: diff.after },
      { db, writer: tx }
    );
    return { ok: true as const, settings: doc };
  });
}
