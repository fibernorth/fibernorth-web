// Lead history (`activity`) is an array on the lead document, and a Firestore
// document is capped at 1 MiB. Once it grows past a safe budget, every save
// of that lead would start failing. These helpers detect that early and plan
// a move of the OLDEST entries into leads/{id}/historyArchive/{docId}, so
// the lead doc keeps the recent history the card shows.
//
// Pure: no Firestore here. The caller (saveLeadServer / arrayUnion writers)
// runs the plan inside its transaction.

/** Entry count past which the history is archived. */
export const HISTORY_MAX_ENTRIES = 1500;
/** Serialized size (UTF-8 bytes of JSON) past which the history is archived. */
export const HISTORY_MAX_BYTES = 700 * 1024;
/** How many newest entries stay on the lead after archiving. */
export const HISTORY_KEEP_ENTRIES = 1000;
/** Target size of the kept history after archiving. */
export const HISTORY_KEEP_BYTES = 400 * 1024;
/** Max size of one historyArchive doc (well under the 1 MiB doc limit). */
export const ARCHIVE_CHUNK_BYTES = 500 * 1024;

const encoder = new TextEncoder();

export function jsonBytes(value: unknown): number {
  return encoder.encode(JSON.stringify(value ?? null)).length;
}

/**
 * True when the lead's history should be archived before (or as part of)
 * the next save. `extra` is what the save is about to append, so a guard can
 * run before the write rather than after it fails.
 */
export function historyTooBig(activity: readonly unknown[] | null | undefined, extra: readonly unknown[] = []): boolean {
  const list = activity || [];
  const count = list.length + extra.length;
  if (count > HISTORY_MAX_ENTRIES) return true;
  return jsonBytes(list) + (extra.length ? jsonBytes(extra) : 0) > HISTORY_MAX_BYTES;
}

export interface HistoryArchivePlan<T> {
  /** Newest entries, oldest first, to write back as `activity`. */
  keep: T[];
  /** Oldest entries split into docs for leads/{id}/historyArchive, oldest first. */
  chunks: T[][];
}

function tsOf(entry: unknown): string {
  const ts = (entry as { ts?: unknown } | null)?.ts;
  return typeof ts === "string" ? ts : "";
}

/**
 * Split a history into what stays on the lead and what moves to the archive.
 * Entries are ordered by `ts` (stable, so equal/missing timestamps keep their
 * original order). Keeps at most HISTORY_KEEP_ENTRIES newest entries and at
 * most HISTORY_KEEP_BYTES of them (always at least the newest one), and
 * chunks the rest into docs under ARCHIVE_CHUNK_BYTES each.
 */
export function planHistoryArchive<T>(activity: readonly T[]): HistoryArchivePlan<T> {
  const sorted = activity
    .map((entry, i) => ({ entry, i }))
    .sort((a, b) => (tsOf(a.entry) < tsOf(b.entry) ? -1 : tsOf(a.entry) > tsOf(b.entry) ? 1 : a.i - b.i))
    .map((x) => x.entry);

  // Walk back from the newest, keeping while within both budgets.
  let bytes = 2; // "[]"
  let start = sorted.length;
  while (start > 0) {
    const size = jsonBytes(sorted[start - 1]) + 1; // + comma
    const kept = sorted.length - start;
    if (kept >= HISTORY_KEEP_ENTRIES) break;
    if (kept > 0 && bytes + size > HISTORY_KEEP_BYTES) break;
    bytes += size;
    start -= 1;
  }
  const keep = sorted.slice(start);
  const old = sorted.slice(0, start);

  const chunks: T[][] = [];
  let chunk: T[] = [];
  let chunkBytes = 2;
  for (const entry of old) {
    const size = jsonBytes(entry) + 1;
    if (chunk.length && chunkBytes + size > ARCHIVE_CHUNK_BYTES) {
      chunks.push(chunk);
      chunk = [];
      chunkBytes = 2;
    }
    chunk.push(entry);
    chunkBytes += size;
  }
  if (chunk.length) chunks.push(chunk);
  return { keep, chunks };
}
