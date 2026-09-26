"use server";

import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyOwnerCaller } from "@/lib/server-action-auth";
import { docLabel, purgeTrash, restoreFromTrash, type TrashDoc } from "@/services/trash";

export interface TrashItem {
  trashId: string;
  col: string;
  id: string;
  label: string;
  deletedBy: string;
  deletedAt: string;
  note: string;
}

type Result = { ok: true } | { ok: false; error: string };

async function owner(authToken: string) {
  try {
    return await verifyOwnerCaller(authToken);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorized" };
  }
}

/** Admin -> Trash (owner only), newest first. */
export async function listTrash(authToken: string): Promise<TrashItem[]> {
  await verifyOwnerCaller(authToken);
  const snap = await getFirestore(initializeAdminApp()).collection("trash").get();
  return snap.docs
    .map((d) => {
      const t = d.data() as TrashDoc;
      return {
        trashId: d.id,
        col: String(t.col || ""),
        id: String(t.id || ""),
        label: docLabel(t.data) || String(t.id || ""),
        deletedBy: String(t.deletedBy || ""),
        deletedAt: String(t.deletedAt || ""),
        note: String(t.note || ""),
      };
    })
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/** Put it back (refused when something with that id exists again). */
export async function restoreTrashItem(trashId: string, authToken: string): Promise<Result> {
  const who = await owner(authToken);
  if ("error" in who) return { ok: false, error: who.error };
  if (!trashId || trashId.includes("/")) return { ok: false, error: "Bad id" };
  const r = await restoreFromTrash(getFirestore(initializeAdminApp()), trashId, who);
  return r.ok ? { ok: true } : r;
}

/** Delete for good. The page asks to confirm first. */
export async function purgeTrashItem(trashId: string, authToken: string): Promise<Result> {
  const who = await owner(authToken);
  if ("error" in who) return { ok: false, error: who.error };
  if (!trashId || trashId.includes("/")) return { ok: false, error: "Bad id" };
  const gone = await purgeTrash(getFirestore(initializeAdminApp()), trashId, who);
  return gone ? { ok: true } : { ok: false, error: "That item isn't in the trash any more." };
}
