"use server";

import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyOwnerCaller } from "@/lib/server-action-auth";
import type { AuditEntry } from "@/services/audit";

/**
 * Admin -> Change log (owner only): the newest entries first, optionally
 * only one collection or one person. Filtering happens on the newest
 * `scan` entries, so it needs no composite index.
 */
export async function listAuditLog(
  authToken: string,
  filter: { col?: string; actor?: string; limit?: number } = {}
): Promise<AuditEntry[]> {
  await verifyOwnerCaller(authToken);
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500);
  const scan = filter.col || filter.actor ? 2000 : limit;
  const snap = await getFirestore(initializeAdminApp())
    .collection("auditLog")
    .orderBy("at", "desc")
    .limit(scan)
    .get();
  const actor = (filter.actor || "").trim().toLowerCase();
  const out: AuditEntry[] = [];
  for (const d of snap.docs) {
    const e = { id: d.id, ...(d.data() as Omit<AuditEntry, "id">) };
    if (filter.col && e.target?.col !== filter.col) continue;
    if (actor && !(e.actor?.email || "").includes(actor) && e.actor?.uid !== actor) continue;
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}
