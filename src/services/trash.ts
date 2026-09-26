// Soft delete. A deleted document is copied to trash/{col}__{id} (with who
// deleted it and when) and removed, in one commit, so an owner can restore
// it from Admin -> Trash. Server-only: firestore.rules deny browsers both
// the trash collection and deletes on the collections that use it.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { readLeadQuotes, leadQuoteFields, leadQuotePatch } from "@/lib/proposal-server";
import { todayISO, type Lead, type LeadActivity } from "@/lib/leads";
import type { QuoteRequest } from "@/lib/types";
import { writeAudit, type AuditActor } from "@/services/audit";

export interface TrashDoc {
  col: string;
  id: string;
  data: Record<string, unknown>;
  deletedBy: string;
  deletedByUid: string;
  deletedAt: string;
  /** Short line shown in the Trash list, e.g. "2 proposal links were voided". */
  note?: string;
}

export const trashId = (col: string, id: string) => `${col}__${id}`;

export function trashRecord(
  col: string,
  id: string,
  data: Record<string, unknown>,
  actor: AuditActor,
  at: string,
  note?: string
): TrashDoc {
  return {
    col,
    id,
    data,
    deletedBy: (actor.email || actor.uid || "").toLowerCase(),
    deletedByUid: actor.uid,
    deletedAt: at,
    ...(note ? { note } : {}),
  };
}

/** A short label for a document in the Trash and Change log lists. */
export function docLabel(data: Record<string, unknown> | null | undefined): string {
  if (!data) return "";
  for (const k of ["title", "name", "address", "email", "slug"]) {
    const v = data[k];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 120);
  }
  return "";
}

/**
 * Move one document to the trash (copy + delete + change-log entry, one
 * batch). Returns false when the document doesn't exist.
 */
export async function softDelete(
  db: Firestore,
  col: string,
  id: string,
  actor: AuditActor,
  opts: { action?: string; note?: string } = {}
): Promise<boolean> {
  const ref = db.collection(col).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const batch = db.batch();
  batch.set(db.collection("trash").doc(trashId(col, id)), trashRecord(col, id, data, actor, now, opts.note) as unknown as Record<string, unknown>);
  batch.delete(ref);
  await writeAudit(
    { actor, action: opts.action ?? `${col}.delete`, target: { col, id }, before: data, after: null, note: opts.note },
    { db, writer: batch }
  );
  await batch.commit();
  return true;
}

export type RestoreResult = { ok: true; col: string; id: string } | { ok: false; error: string };

/**
 * Put a trashed document back under its old id. Refused when a document with
 * that id exists again. A restored quote is relinked to its lead (the lead's
 * quote badge and count are worked out again) and comes back as a draft: the
 * links sent from it stay void, so it has to be sent again.
 */
export async function restoreFromTrash(db: Firestore, trashDocId: string, actor: AuditActor): Promise<RestoreResult> {
  const tRef = db.collection("trash").doc(trashDocId);
  const now = new Date().toISOString();
  return db.runTransaction(async (tx) => {
    // ---- reads ----
    const tSnap = await tx.get(tRef);
    if (!tSnap.exists) return { ok: false, error: "That item isn't in the trash any more." } as RestoreResult;
    const t = tSnap.data() as TrashDoc;
    if (!t.col || !t.id || t.col.includes("/") || t.id.includes("/")) {
      return { ok: false, error: "That trash entry is damaged." } as RestoreResult;
    }
    const ref = db.collection(t.col).doc(t.id);
    const existing = await tx.get(ref);
    if (existing.exists) {
      return {
        ok: false,
        error: "Something with that id exists again, so nothing was restored. Delete or rename it first.",
      } as RestoreResult;
    }
    let data: Record<string, unknown> = { ...t.data };
    let leadWrite: (() => void) | null = null;
    if (t.col === "quoteRequests") {
      const q = data as Partial<QuoteRequest>;
      if (q.proposalId) {
        // Its links were voided on delete and stay void.
        const { proposalId, ...rest } = data;
        data = { ...rest, voidedProposalId: proposalId, estimateStatus: "draft" };
      } else if (q.estimateStatus && q.estimateStatus !== "draft") {
        data = { ...data, estimateStatus: "draft" };
      }
      data.restoredAt = now;
      const leadId = typeof q.leadId === "string" ? q.leadId : "";
      if (leadId && !leadId.includes("/")) {
        const leadRef = db.collection("leads").doc(leadId);
        const leadSnap = await tx.get(leadRef);
        if (leadSnap.exists) {
          const lead = leadSnap.data() as Lead;
          const quotes = await readLeadQuotes(tx, db, leadId, lead.quoteId);
          const restored = { id: t.id, ...(data as Omit<QuoteRequest, "id">) };
          const where = q.address ? ` for ${q.address}` : "";
          const act: LeadActivity = {
            ts: now,
            type: "system",
            text: `Quote${where} restored from the trash by ${actor.email || "an owner"} (as a draft; its old links stay void)`,
            ...(actor.email ? { by: actor.email.toLowerCase() } : {}),
          };
          leadWrite = () =>
            tx.update(leadRef, {
              ...leadQuotePatch(leadQuoteFields(quotes, { [t.id]: restored }, todayISO())),
              activity: FieldValue.arrayUnion(act),
              updatedAt: now,
            });
        }
      }
    }
    // ---- writes ----
    tx.set(ref, data);
    tx.delete(tRef);
    if (leadWrite) leadWrite();
    await writeAudit(
      {
        actor,
        action: "trash.restore",
        target: { col: t.col, id: t.id },
        before: null,
        after: data,
        note: `deleted by ${t.deletedBy} ${t.deletedAt}`,
      },
      { db, writer: tx }
    );
    return { ok: true, col: t.col, id: t.id } as RestoreResult;
  });
}

/** Delete a trash entry for good (owner, after a confirm). */
export async function purgeTrash(db: Firestore, trashDocId: string, actor: AuditActor): Promise<boolean> {
  const tRef = db.collection("trash").doc(trashDocId);
  const snap = await tRef.get();
  if (!snap.exists) return false;
  const t = snap.data() as TrashDoc;
  const batch = db.batch();
  batch.delete(tRef);
  await writeAudit(
    {
      actor,
      action: "trash.purge",
      target: { col: t.col, id: t.id },
      before: { label: docLabel(t.data), deletedBy: t.deletedBy, deletedAt: t.deletedAt },
      after: null,
    },
    { db, writer: batch }
  );
  await batch.commit();
  return true;
}
