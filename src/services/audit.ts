// Server-side change log (auditLog/{auto}). Who changed what, when, and the
// before -> after of the fields that changed. Written only by the Admin SDK
// (firestore.rules: owners may read, nobody may write); shown to owners on
// Admin -> Change log.
//
// Pass `writer` (a transaction or batch) to record the entry in the same
// commit as the change it describes; otherwise it is written on its own and
// awaited (serverless: nothing may be left in flight after the response).

import { getFirestore, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";

export interface AuditActor {
  uid: string;
  email?: string | null;
}

export interface AuditInput {
  actor: AuditActor;
  /** e.g. "crud.update", "user.create", "quote.delete", "trash.restore" */
  action: string;
  target: { col: string; id: string };
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** One short line of context, e.g. "3 proposal links voided". */
  note?: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: { uid: string; email: string };
  action: string;
  target: { col: string; id: string };
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  note?: string;
}

/** Anything with set(ref, data): a Transaction or a WriteBatch. */
export interface AuditWriter {
  set(ref: DocumentReference, data: Record<string, unknown>): unknown;
}

const MAX_STRING = 500;
const MAX_ITEMS = 50;

/** A Firestore-safe, size-capped copy of a value for the log. */
export function auditValue(v: unknown, depth = 0): unknown {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v.length > MAX_STRING ? `${v.slice(0, MAX_STRING)}… (${v.length} chars)` : v;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString();
  if (depth >= 4) return "(nested)";
  if (Array.isArray(v)) {
    const items = v.slice(0, MAX_ITEMS).map((x) => auditValue(x, depth + 1));
    return v.length > MAX_ITEMS ? [...items, `… ${v.length - MAX_ITEMS} more`] : items;
  }
  if (typeof v === "object") {
    const proto = Object.getPrototypeOf(v);
    // FieldValue sentinels (arrayUnion, delete...) and other class instances.
    if (proto !== Object.prototype && proto !== null) return "(computed on save)";
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (x === undefined) continue;
      out[k] = auditValue(x, depth + 1);
    }
    return out;
  }
  return String(v);
}

function auditObject(o: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!o) return null;
  return auditValue(o) as Record<string, unknown>;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The fields that differ, as { before, after } holding only those keys.
 * `keys` limits the comparison (default: every key in `after`, the patch).
 */
export function diffFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  keys?: string[]
): { before: Record<string, unknown>; after: Record<string, unknown>; changed: string[] } {
  const b = before ?? {};
  const a = after ?? {};
  const ks = keys ?? Object.keys(a);
  const out = { before: {} as Record<string, unknown>, after: {} as Record<string, unknown>, changed: [] as string[] };
  for (const k of ks) {
    if (k === "updatedAt" || k === "createdAt") continue;
    if (same(b[k], a[k])) continue;
    out.before[k] = b[k] ?? null;
    out.after[k] = a[k] ?? null;
    out.changed.push(k);
  }
  return out;
}

/**
 * Replace secret values with "(set)" / "(blank)" so the log says a key
 * changed without ever holding it. Keys in `visible` are kept as-is.
 */
export function maskSecrets(o: Record<string, unknown>, visible: ReadonlySet<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (visible.has(k)) out[k] = v;
    else out[k] = v === null || v === undefined || v === "" ? "(blank)" : "(set)";
  }
  return out;
}

export function auditRecord(input: AuditInput, at = new Date().toISOString()): Omit<AuditEntry, "id"> {
  return {
    at,
    actor: { uid: input.actor.uid, email: (input.actor.email || "").toLowerCase() },
    action: input.action,
    target: { col: input.target.col, id: input.target.id },
    before: auditObject(input.before),
    after: auditObject(input.after),
    ...(input.note ? { note: input.note.slice(0, 500) } : {}),
  };
}

export async function writeAudit(
  input: AuditInput,
  opts: { db?: Firestore; writer?: AuditWriter } = {}
): Promise<void> {
  const db = opts.db ?? getFirestore(initializeAdminApp());
  const ref = db.collection("auditLog").doc();
  const doc = auditRecord(input);
  if (opts.writer) {
    opts.writer.set(ref, doc);
    return;
  }
  await ref.set(doc);
}
