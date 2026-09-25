// A small local outbox for lead saves made with no signal. Saves that fail
// because the phone is offline are kept in localStorage and sent again when
// the connection comes back. Storage can be missing or throw (private mode,
// blocked site data), so every access is wrapped and failure just means
// "nothing queued".

import type { LeadActivity } from "@/lib/leads";

export interface OutboxItem {
  id: string;
  leadId: string;
  leadName?: string;
  patch: Record<string, unknown>;
  activity: LeadActivity | null;
  queuedAt: string;
}

export const OUTBOX_KEY = "fn.leadOutbox.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readOutbox(s: StorageLike | null = storage()): OutboxItem[] {
  if (!s) return [];
  try {
    const raw = s.getItem(OUTBOX_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? (parsed.filter((x) => x && typeof x === "object" && typeof (x as OutboxItem).leadId === "string") as OutboxItem[])
      : [];
  } catch {
    return [];
  }
}

function write(items: OutboxItem[], s: StorageLike | null): boolean {
  if (!s) return false;
  try {
    if (items.length === 0) s.removeItem(OUTBOX_KEY);
    else s.setItem(OUTBOX_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

/** Add a save to the outbox. Returns false when it could not be stored. */
export function enqueueSave(
  item: Omit<OutboxItem, "id" | "queuedAt">,
  s: StorageLike | null = storage(),
  now: Date = new Date()
): boolean {
  const items = readOutbox(s);
  items.push({ ...item, id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`, queuedAt: now.toISOString() });
  return write(items, s);
}

export function removeFromOutbox(id: string, s: StorageLike | null = storage()): void {
  write(
    readOutbox(s).filter((i) => i.id !== id),
    s
  );
}

/** True for errors that mean "no connection" rather than "the server said no". */
export function isNetworkError(e: unknown, online: boolean = typeof navigator === "undefined" ? true : navigator.onLine): boolean {
  if (!online) return true;
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e ?? "");
  return /failed to fetch|load failed|networkerror|network request failed|network error|fetch failed|connection/i.test(msg);
}

/**
 * Send queued saves in order. Stops at the first network failure (still
 * offline). A save the server refuses is dropped and reported.
 */
export async function flushOutbox(
  send: (item: OutboxItem) => Promise<{ ok: boolean; error?: string }>,
  s: StorageLike | null = storage()
): Promise<{ sent: number; dropped: Array<{ item: OutboxItem; error: string }>; left: number }> {
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
  return { sent, dropped, left: readOutbox(s).length };
}
