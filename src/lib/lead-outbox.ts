// A small local outbox for lead saves made with no signal. Saves that fail
// because the phone is offline are kept in localStorage and sent again when
// the connection comes back. Storage can be missing or throw (private mode,
// blocked site data), so every access is wrapped and failure just means
// "nothing queued".
//
// Two guards against a stale save landing on a lead that has moved on:
// - `base`: the value each changed field had on the card when the save was
//   made. It rides to the server with the patch (as `patch.base`, like
//   `expectStage`), so the server can refuse a field someone else changed
//   meanwhile.
// - Age: a save still queued after a day is not sent at all. It moves to an
//   "expired" list the Leads page shows until Bill dismisses it, so he can
//   re-enter what still matters.

import type { LeadActivity } from "@/lib/leads";

export interface OutboxItem {
  id: string;
  leadId: string;
  leadName?: string;
  patch: Record<string, unknown>;
  /** Field -> value the card showed when the save was made (null = blank). */
  base?: Record<string, unknown>;
  activity: LeadActivity | null;
  queuedAt: string;
}

export const OUTBOX_KEY = "fn.leadOutbox.v1";
export const OUTBOX_EXPIRED_KEY = "fn.leadOutbox.expired.v1";
/** Saves older than this are not sent. */
export const OUTBOX_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Keys in a patch that steer the save rather than set a field. */
const CONTROL_KEYS = new Set(["expectStage", "reopen", "base"]);

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readList(key: string, s: StorageLike | null): OutboxItem[] {
  if (!s) return [];
  try {
    const raw = s.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? (parsed.filter((x) => x && typeof x === "object" && typeof (x as OutboxItem).leadId === "string") as OutboxItem[])
      : [];
  } catch {
    return [];
  }
}

function writeList(key: string, items: OutboxItem[], s: StorageLike | null): boolean {
  if (!s) return false;
  try {
    if (items.length === 0) s.removeItem(key);
    else s.setItem(key, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function readOutbox(s: StorageLike | null = storage()): OutboxItem[] {
  return readList(OUTBOX_KEY, s);
}

/** Saves that were too old to send, kept until Bill dismisses the notice. */
export function readExpired(s: StorageLike | null = storage()): OutboxItem[] {
  return readList(OUTBOX_EXPIRED_KEY, s);
}

export function clearExpired(s: StorageLike | null = storage()): void {
  writeList(OUTBOX_EXPIRED_KEY, [], s);
}

/**
 * The value each field in the patch had on the lead the card showed, in
 * the shape the server's stale-save check takes (`{ base: { field: value } }`).
 * Missing values are null.
 */
export function baseValuesFor(lead: object, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const l = lead as Record<string, unknown>;
  for (const k of Object.keys(patch)) {
    if (CONTROL_KEYS.has(k)) continue;
    const v = l[k];
    out[k] = v === undefined ? null : v;
  }
  return out;
}

/** The patch sent for a queued item: the fields, plus `base` when captured. */
export function patchToSend(item: Pick<OutboxItem, "patch" | "base">): Record<string, unknown> {
  return item.base ? { ...item.patch, base: item.base } : item.patch;
}

/** Add a save to the outbox. Returns false when it could not be stored. */
export function enqueueSave(
  item: Omit<OutboxItem, "id" | "queuedAt">,
  s: StorageLike | null = storage(),
  now: Date = new Date()
): boolean {
  const items = readOutbox(s);
  items.push({ ...item, id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`, queuedAt: now.toISOString() });
  return writeList(OUTBOX_KEY, items, s);
}

export function removeFromOutbox(id: string, s: StorageLike | null = storage()): void {
  writeList(
    OUTBOX_KEY,
    readOutbox(s).filter((i) => i.id !== id),
    s
  );
}

/** True when a queued save is too old to send. An unreadable date counts as old. */
export function isExpired(item: Pick<OutboxItem, "queuedAt">, now: Date = new Date()): boolean {
  const t = Date.parse(item.queuedAt);
  return !Number.isFinite(t) || now.getTime() - t > OUTBOX_MAX_AGE_MS;
}

/** Move saves older than a day from the outbox to the expired list. Returns the ones moved. */
export function expireOld(s: StorageLike | null = storage(), now: Date = new Date()): OutboxItem[] {
  const items = readOutbox(s);
  const old = items.filter((i) => isExpired(i, now));
  if (old.length === 0) return [];
  writeList(OUTBOX_EXPIRED_KEY, [...readExpired(s), ...old], s);
  writeList(
    OUTBOX_KEY,
    items.filter((i) => !isExpired(i, now)),
    s
  );
  return old;
}

/** One line for the notice: who, when it was made, and what it changed. */
export function describeOutboxItem(item: OutboxItem): string {
  const when = new Date(item.queuedAt);
  const at = Number.isFinite(when.getTime())
    ? when.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "unknown time";
  const fields = Object.keys(item.patch).filter((k) => !CONTROL_KEYS.has(k));
  const parts: string[] = [];
  if (item.activity?.text) parts.push(`"${item.activity.text.slice(0, 120)}"`);
  if (fields.length) {
    parts.push(
      fields
        .map((k) => {
          const v = item.patch[k];
          const shown = typeof v === "string" || typeof v === "number" ? String(v).slice(0, 60) : "";
          return shown ? `${k}: ${shown}` : k;
        })
        .join(", ")
    );
  }
  return `${item.leadName || "A lead"} (${at}): ${parts.join("; ") || "a change"}`;
}

/** True for errors that mean "no connection" rather than "the server said no". */
export function isNetworkError(e: unknown, online: boolean = typeof navigator === "undefined" ? true : navigator.onLine): boolean {
  if (!online) return true;
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e ?? "");
  return /failed to fetch|load failed|networkerror|network request failed|network error|fetch failed|connection/i.test(msg);
}

/**
 * Send queued saves in order. Saves older than a day are not sent: they move
 * to the expired list and come back in `expired`. Stops at the first network
 * failure (still offline). A save the server refuses is dropped and reported.
 */
export async function flushOutbox(
  send: (item: OutboxItem) => Promise<{ ok: boolean; error?: string }>,
  s: StorageLike | null = storage(),
  now: Date = new Date()
): Promise<{ sent: number; dropped: Array<{ item: OutboxItem; error: string }>; left: number; expired: OutboxItem[] }> {
  const expired = expireOld(s, now);
  let sent = 0;
  const dropped: Array<{ item: OutboxItem; error: string }> = [];
  for (const item of readOutbox(s)) {
    try {
      const r = await send(item);
      removeFromOutbox(item.id, s);
      if (r.ok) sent += 1;
      else dropped.push({ item, error: r.error || "Couldn't save" });
    } catch (e) {
      if (isNetworkError(e)) break;
      removeFromOutbox(item.id, s);
      dropped.push({ item, error: e instanceof Error ? e.message : "Couldn't save" });
    }
  }
  return { sent, dropped, left: readOutbox(s).length, expired };
}
