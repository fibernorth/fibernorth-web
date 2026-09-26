import { describe, expect, it } from "vitest";
import {
  ARCHIVE_CHUNK_BYTES,
  HISTORY_KEEP_BYTES,
  HISTORY_KEEP_ENTRIES,
  HISTORY_MAX_ENTRIES,
  historyTooBig,
  jsonBytes,
  planHistoryArchive,
} from "./history-size";

const entry = (i: number, text = "Called, left VM") => ({
  ts: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
  type: "note",
  text,
});
const many = (n: number, text?: string) => Array.from({ length: n }, (_, i) => entry(i, text));

describe("historyTooBig", () => {
  it("is false for normal histories", () => {
    expect(historyTooBig([])).toBe(false);
    expect(historyTooBig(undefined)).toBe(false);
    expect(historyTooBig(many(200))).toBe(false);
  });

  it("trips on entry count", () => {
    expect(historyTooBig(many(HISTORY_MAX_ENTRIES))).toBe(false);
    expect(historyTooBig(many(HISTORY_MAX_ENTRIES + 1))).toBe(true);
    expect(historyTooBig(many(HISTORY_MAX_ENTRIES), [entry(9999)])).toBe(true);
  });

  it("trips on size well before the 1 MiB document limit", () => {
    const big = many(300, "x".repeat(2500)); // ~780KB
    expect(historyTooBig(big)).toBe(true);
    expect(historyTooBig(many(100, "x".repeat(2500)))).toBe(false);
  });

  it("counts multi-byte characters as bytes", () => {
    const emoji = many(80, "\u{1F600}".repeat(2500)); // 4 bytes each: ~800KB
    expect(historyTooBig(emoji)).toBe(true);
  });
});

describe("planHistoryArchive", () => {
  it("keeps the newest entries and archives the oldest, losing nothing", () => {
    const list = many(HISTORY_MAX_ENTRIES + 200);
    const { keep, chunks } = planHistoryArchive(list);
    expect(keep).toHaveLength(HISTORY_KEEP_ENTRIES);
    expect(keep[keep.length - 1]).toEqual(list[list.length - 1]);
    const archived = chunks.flat();
    expect(archived.length + keep.length).toBe(list.length);
    expect([...archived, ...keep]).toEqual(list);
    expect(historyTooBig(keep)).toBe(false);
  });

  it("orders by timestamp even when the array is out of order", () => {
    const list = many(HISTORY_MAX_ENTRIES + 10).reverse();
    const { keep, chunks } = planHistoryArchive(list);
    const all = [...chunks.flat(), ...keep];
    for (let i = 1; i < all.length; i++) expect(all[i].ts >= all[i - 1].ts).toBe(true);
  });

  it("keeps kept history and each archive chunk under their byte budgets", () => {
    const list = many(400, "y".repeat(2500));
    const { keep, chunks } = planHistoryArchive(list);
    expect(jsonBytes(keep)).toBeLessThanOrEqual(HISTORY_KEEP_BYTES);
    expect(chunks.length).toBeGreaterThan(0);
    for (const c of chunks) expect(jsonBytes(c)).toBeLessThanOrEqual(ARCHIVE_CHUNK_BYTES);
    expect(chunks.flat().length + keep.length).toBe(400);
  });

  it("always keeps at least the newest entry, even if it alone is huge", () => {
    const list = [entry(0), entry(1, "z".repeat(HISTORY_KEEP_BYTES + 10))];
    const { keep, chunks } = planHistoryArchive(list);
    expect(keep).toEqual([list[1]]);
    expect(chunks).toEqual([[list[0]]]);
  });

  it("is a no-op split for a small history", () => {
    const list = many(5);
    expect(planHistoryArchive(list)).toEqual({ keep: list, chunks: [] });
  });
});
