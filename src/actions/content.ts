"use server";

import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { verifyServerActionCaller } from "@/lib/server-action-auth";
import { PAGE_CONTENT_FIELDS, STALE_MESSAGE } from "@/lib/crud-schemas";
import { diffFields, writeAudit } from "@/services/audit";

/**
 * Save the Page content editor. Only that page's own text fields, capped.
 * `baseUpdatedAt` is the page's updatedAt when the editor loaded it ("" when
 * it didn't exist yet); a save over a newer version is refused.
 */
export async function updatePageContent(
  pageId: string,
  data: Record<string, unknown>,
  authToken: string,
  baseUpdatedAt?: string | null
): Promise<{ ok: true; updatedAt?: string } | { ok: false; error: string }> {
  let caller;
  try {
    caller = await verifyServerActionCaller(authToken);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Not authorized" };
  }
  const allowed = PAGE_CONTENT_FIELDS[pageId];
  if (!allowed) return { ok: false, error: "Unknown page" };
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    if (k === "updatedAt" || k === "id") continue;
    if (!allowed.includes(k)) return { ok: false, error: `Unknown field: ${k}` };
    if (typeof v !== "string") return { ok: false, error: `${k} must be text` };
    if (v.length > 20000) return { ok: false, error: `${k} is too long` };
    clean[k] = v;
  }
  if (!Object.keys(clean).length) return { ok: true };
  const db = getFirestore(initializeAdminApp());
  const ref = db.collection("siteContent").doc(pageId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = (snap.data() ?? {}) as Record<string, unknown>;
    if (baseUpdatedAt !== undefined && String(stored.updatedAt ?? "") !== String(baseUpdatedAt ?? "")) {
      return { ok: false as const, error: STALE_MESSAGE };
    }
    const diff = diffFields(stored, clean);
    if (!diff.changed.length) return { ok: true as const, updatedAt: String(stored.updatedAt ?? "") };
    const updatedAt = new Date().toISOString();
    tx.set(ref, { ...clean, updatedAt }, { merge: true });
    await writeAudit(
      { actor: caller, action: "content.update", target: { col: "siteContent", id: pageId }, before: diff.before, after: diff.after },
      { db, writer: tx }
    );
    return { ok: true as const, updatedAt };
  });
}

// (getPageContent was removed: it was an exported server action with no auth
// check and no callers. Read public content with the client hooks instead.)
