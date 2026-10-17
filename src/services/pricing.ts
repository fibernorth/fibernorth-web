// The owner's price rules and price list (src/lib/quote-rules.ts). Stored in
// Firestore pricingSettings/current: internal numbers, so not in the
// world-readable siteSettings. Server only (no client rule allows it); read
// through src/actions/pricing.ts.

import type { Firestore } from "firebase-admin/firestore";
import { cleanPricing, type PricingSettings } from "@/lib/quote-rules";

export const PRICING_DOC = { col: "pricingSettings", id: "current" } as const;

/** The saved settings, with defaults for anything never set. */
export async function loadPricing(db: Firestore): Promise<PricingSettings> {
  try {
    const snap = await db.collection(PRICING_DOC.col).doc(PRICING_DOC.id).get();
    return cleanPricing(snap.exists ? snap.data() : undefined);
  } catch (err) {
    console.error("Pricing settings read failed, using defaults:", err);
    return cleanPricing(undefined);
  }
}
