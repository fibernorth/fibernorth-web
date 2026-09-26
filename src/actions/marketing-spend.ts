"use server";

import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyServerActionCaller } from "@/lib/server-action-auth";
import { cleanSpend, type MonthSpend } from "@/lib/sales-metrics";
import { diffFields, writeAudit } from "@/services/audit";

// Monthly marketing spend for the dashboard's cost-per-won-job table.
// marketingSpend/{YYYY-MM} = { "meta-ads": 600, "google-ads": 200, ..., updatedAt, updatedBy }.
// Read and written through the Admin SDK so the dashboard works before the
// new firestore.rules entry is published.

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function getMarketingSpend(authToken: string): Promise<Record<string, MonthSpend>> {
  return (await loadMarketingSpend(authToken)).spend;
}

/**
 * The spend per month plus each month's updatedAt ("stamp"), which the edit
 * form sends back as its base so a stale save is refused.
 */
export async function loadMarketingSpend(
  authToken: string
): Promise<{ spend: Record<string, MonthSpend>; stamps: Record<string, string> }> {
  await verifyServerActionCaller(authToken);
  const snap = await getFirestore(initializeAdminApp()).collection("marketingSpend").get();
  const spend: Record<string, MonthSpend> = {};
  const stamps: Record<string, string> = {};
  for (const d of snap.docs) {
    if (!MONTH_RE.test(d.id)) continue;
    const data = d.data();
    const month: MonthSpend = {};
    for (const [k, v] of Object.entries(data)) if (typeof v === "number") month[k] = v;
    spend[d.id] = month;
    stamps[d.id] = typeof data.updatedAt === "string" ? data.updatedAt : "";
  }
  return { spend, stamps };
}

/**
 * Save one month. `baseUpdatedAt` is that month's updatedAt when the form
 * was filled ("" for a month not saved before); when it no longer matches,
 * someone else saved in between and nothing is written. Logged before -> after.
 */
export async function saveMarketingSpend(
  month: string,
  amounts: Record<string, unknown>,
  authToken: string,
  baseUpdatedAt?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const caller = await verifyServerActionCaller(authToken);
  if (!MONTH_RE.test(month)) return { ok: false, error: "Pick a month." };
  const db = getFirestore(initializeAdminApp());
  const ref = db.collection("marketingSpend").doc(month);
  const next = cleanSpend(amounts) as Record<string, number>;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = (snap.data() ?? {}) as Record<string, unknown>;
    if (baseUpdatedAt !== undefined && String(stored.updatedAt ?? "") !== String(baseUpdatedAt ?? "")) {
      const who = typeof stored.updatedBy === "string" && stored.updatedBy ? ` by ${stored.updatedBy}` : "";
      return { ok: false as const, error: `Not saved: ${month} was changed${who} since you opened it. Reload.` };
    }
    const diff = diffFields(stored, next);
    if (!diff.changed.length) return { ok: true as const };
    tx.set(ref, { ...next, updatedAt: new Date().toISOString(), updatedBy: caller.email || caller.uid });
    await writeAudit(
      { actor: caller, action: "spend.update", target: { col: "marketingSpend", id: month }, before: diff.before, after: diff.after },
      { db, writer: tx }
    );
    return { ok: true as const };
  });
}
