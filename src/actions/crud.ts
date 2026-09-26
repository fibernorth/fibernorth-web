"use server";

import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { verifyOwnerCaller, verifyServerActionCaller, type ServerActionCaller } from "@/lib/server-action-auth";
import { STALE_MESSAGE, validateCrudData } from "@/lib/crud-schemas";
import { SETTINGS_FIELDS, OWNER_SETTINGS_FIELDS, INTEGRATION_FIELDS, INTEGRATION_VISIBLE_FIELDS } from "@/lib/settings-fields";
import { diffFields, maskSecrets, writeAudit } from "@/services/audit";
import { docLabel, softDelete } from "@/services/trash";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function msg(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

async function caller(authToken: string, owner = false): Promise<ServerActionCaller | { error: string }> {
  try {
    return owner ? await verifyOwnerCaller(authToken) : await verifyServerActionCaller(authToken);
  } catch (e) {
    return { error: msg(e, "Not authorized") };
  }
}

const badId = (id: string) => !id || typeof id !== "string" || id.includes("/") || id.length > 200;

export async function createDocument(
  collectionName: string,
  data: Record<string, unknown>,
  authToken: string
): Promise<ActionResult<{ id: string }>> {
  const who = await caller(authToken);
  if ("error" in who) return { ok: false, error: who.error };
  const check = validateCrudData(collectionName, data, "create");
  if (!check.ok) return check;
  const db = getFirestore(initializeAdminApp());
  const now = new Date().toISOString();
  const ref = db.collection(collectionName).doc();
  const batch = db.batch();
  batch.set(ref, { ...check.data, createdAt: now, updatedAt: now });
  await writeAudit(
    { actor: who, action: "crud.create", target: { col: collectionName, id: ref.id }, before: null, after: check.data },
    { db, writer: batch }
  );
  await batch.commit();
  return { ok: true, id: ref.id };
}

/**
 * Save changed fields of a CMS entry. `opts.baseUpdatedAt` is the entry's
 * updatedAt when the form was opened: a save over a newer version is refused
 * (STALE_MESSAGE) instead of silently reverting someone else's edit.
 */
export async function updateDocument(
  collectionName: string,
  docId: string,
  data: Record<string, unknown>,
  authToken: string,
  opts: { baseUpdatedAt?: string | null } = {}
): Promise<ActionResult> {
  const who = await caller(authToken);
  if ("error" in who) return { ok: false, error: who.error };
  if (badId(docId)) return { ok: false, error: "Bad id" };
  const check = validateCrudData(collectionName, data, "update");
  if (!check.ok) return check;
  const db = getFirestore(initializeAdminApp());
  const ref = db.collection(collectionName).doc(docId);
  const now = new Date().toISOString();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false as const, error: "That entry was deleted. Reload." };
    const stored = (snap.data() ?? {}) as Record<string, unknown>;
    if (opts.baseUpdatedAt !== undefined && String(stored.updatedAt ?? "") !== String(opts.baseUpdatedAt ?? "")) {
      return { ok: false as const, error: STALE_MESSAGE };
    }
    const diff = diffFields(stored, check.data);
    if (!diff.changed.length) return { ok: true as const };
    tx.update(ref, { ...check.data, updatedAt: now });
    await writeAudit(
      {
        actor: who,
        action: "crud.update",
        target: { col: collectionName, id: docId },
        before: diff.before,
        after: diff.after,
        note: docLabel(stored) || undefined,
      },
      { db, writer: tx }
    );
    return { ok: true as const };
  });
}

/** Owner only. Moves the entry to the trash (Admin -> Trash restores it). */
export async function deleteDocument(collectionName: string, docId: string, authToken: string): Promise<ActionResult> {
  const who = await caller(authToken, true);
  if ("error" in who) return { ok: false, error: who.error };
  if (badId(docId)) return { ok: false, error: "Bad id" };
  // Only collections the CMS edits; not siteSettings / siteContent.
  const check = validateCrudData(collectionName, {}, "update");
  if (!check.ok) return check;
  const db = getFirestore(initializeAdminApp());
  const moved = await softDelete(db, collectionName, docId, who, { action: "crud.delete" });
  return moved ? { ok: true } : { ok: false, error: "Already deleted." };
}

/**
 * Site settings (siteSettings/general, world-readable). Only the Settings
 * screen's fields; notification recipients and the Slack webhook are
 * owner-only. Every change is logged before -> after.
 */
export async function updateSettings(
  settingsId: string,
  data: Record<string, unknown>,
  authToken: string
): Promise<ActionResult> {
  const who = await caller(authToken);
  if ("error" in who) return { ok: false, error: who.error };
  if (settingsId !== "general") return { ok: false, error: "Unknown settings" };
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    if (k === "updatedAt") continue;
    if (!SETTINGS_FIELDS.has(k)) return { ok: false, error: `Unknown setting: ${k}` };
    if (typeof v !== "string") return { ok: false, error: `${k} must be text` };
    if (v.length > 2000) return { ok: false, error: `${k} is too long` };
    if (OWNER_SETTINGS_FIELDS.has(k) && !who.owner) {
      return { ok: false, error: "Only an owner (Bill) can change where notifications go." };
    }
    clean[k] = v;
  }
  if (!Object.keys(clean).length) return { ok: true };
  const db = getFirestore(initializeAdminApp());
  const ref = db.collection("siteSettings").doc(settingsId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = (snap.data() ?? {}) as Record<string, unknown>;
    const diff = diffFields(stored, clean);
    if (!diff.changed.length) return;
    tx.set(ref, { ...clean, updatedAt: new Date().toISOString() }, { merge: true });
    await writeAudit(
      { actor: who, action: "settings.update", target: { col: "siteSettings", id: settingsId }, before: diff.before, after: diff.after },
      { db, writer: tx }
    );
  });
  return { ok: true };
}

// Integration credentials live outside siteSettings because siteSettings is
// world-readable by design (public site content). integrationSecrets is
// server-only in firestore.rules. Owner only; the change log records which
// fields changed, never a secret's value.
export async function updateIntegrationSecret(
  secretId: string,
  data: Record<string, unknown>,
  authToken: string
): Promise<ActionResult> {
  const who = await caller(authToken, true);
  if ("error" in who) return { ok: false, error: who.error };
  const allowed = INTEGRATION_FIELDS[secretId];
  if (!allowed) return { ok: false, error: "Unknown integration" };
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    if (!allowed.has(k)) return { ok: false, error: `Unknown field: ${k}` };
    if (typeof v === "boolean") clean[k] = v;
    else if (typeof v === "string" && v.length <= 4000) clean[k] = v;
    else return { ok: false, error: `${k} isn't valid` };
  }
  if (typeof clean.baseUrl === "string" && clean.baseUrl && !/^https:\/\/[^\s/]+/.test(clean.baseUrl)) {
    return { ok: false, error: "The base URL must start with https://" };
  }
  if (!Object.keys(clean).length) return { ok: true };
  const db = getFirestore(initializeAdminApp());
  const ref = db.collection("integrationSecrets").doc(secretId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = (snap.data() ?? {}) as Record<string, unknown>;
    const diff = diffFields(stored, clean);
    if (!diff.changed.length) return;
    tx.set(ref, { ...clean, updatedAt: new Date().toISOString() }, { merge: true });
    await writeAudit(
      {
        actor: who,
        action: "secret.update",
        target: { col: "integrationSecrets", id: secretId },
        before: maskSecrets(diff.before, INTEGRATION_VISIBLE_FIELDS),
        after: maskSecrets(diff.after, INTEGRATION_VISIBLE_FIELDS),
        note: `changed: ${diff.changed.join(", ")}`,
      },
      { db, writer: tx }
    );
  });
  return { ok: true };
}
