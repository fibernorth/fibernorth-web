"use server";

import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyServerActionCaller } from "@/lib/server-action-auth";
import { writeAudit } from "@/services/audit";

// Notices that didn't get through (notices/{id}, written by
// src/services/notice-delivery.ts): the red banner on the dashboard and
// the leads page lists them until someone marks each one handled.

export interface FailedNotice {
  id: string;
  kind: string;
  summary: string;
  error: string;
  at: string;
  lead: string;
  application: string;
}

export async function listFailedNotices(authToken: string): Promise<FailedNotice[]> {
  await verifyServerActionCaller(authToken);
  const snap = await getFirestore(initializeAdminApp()).collection("notices").where("open", "==", true).limit(100).get();
  return snap.docs
    .map((d) => {
      const n = d.data();
      return {
        id: d.id,
        kind: String(n.kind || ""),
        summary: String(n.summary || ""),
        error: String(n.error || ""),
        at: String(n.at || ""),
        lead: String(n.lead || ""),
        application: String(n.application || ""),
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

export async function markNoticeHandled(id: string, authToken: string): Promise<{ ok: true }> {
  const caller = await verifyServerActionCaller(authToken);
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new Error("Bad notice id");
  const store = getFirestore(initializeAdminApp());
  const ref = store.collection("notices").doc(id);
  const now = new Date().toISOString();
  const by = (caller.email || caller.uid).toLowerCase();
  await store.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("open") !== true) return;
    tx.update(ref, { open: false, handledAt: now, handledBy: by });
    await writeAudit(
      {
        actor: caller,
        action: "notice.handled",
        target: { col: "notices", id },
        before: { open: true },
        after: { open: false },
        note: String(snap.get("summary") || "").slice(0, 200),
      },
      { db: store, writer: tx }
    );
  });
  return { ok: true };
}
