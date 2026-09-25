"use server";

import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyServerActionCaller } from "@/lib/server-action-auth";
import { cleanSpend, type MonthSpend } from "@/lib/sales-metrics";

// Monthly marketing spend for the dashboard's cost-per-won-job table.
// marketingSpend/{YYYY-MM} = { "meta-ads": 600, "google-ads": 200, ..., updatedAt, updatedBy }.
// Read and written through the Admin SDK so the dashboard works before the
// new firestore.rules entry is published.

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function getMarketingSpend(authToken: string): Promise<Record<string, MonthSpend>> {
  await verifyServerActionCaller(authToken);
  const snap = await getFirestore(initializeAdminApp()).collection("marketingSpend").get();
  const out: Record<string, MonthSpend> = {};
  for (const d of snap.docs) {
    if (!MONTH_RE.test(d.id)) continue;
    const data = d.data();
    const month: MonthSpend = {};
    for (const [k, v] of Object.entries(data)) if (typeof v === "number") month[k] = v;
    out[d.id] = month;
  }
  return out;
}

export async function saveMarketingSpend(
  month: string,
  amounts: Record<string, unknown>,
  authToken: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const caller = await verifyServerActionCaller(authToken);
  if (!MONTH_RE.test(month)) return { ok: false, error: "Pick a month." };
  await getFirestore(initializeAdminApp())
    .collection("marketingSpend")
    .doc(month)
    .set({ ...cleanSpend(amounts), updatedAt: new Date().toISOString(), updatedBy: caller.email || caller.uid });
  return { ok: true };
}
