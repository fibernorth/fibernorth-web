import { createHash } from "crypto";

// Bids found by Claude's daily bid scan, posted to /api/bids/import and
// shown on the Bid Board. The scan owns only the descriptive fields below.
// Bill's own fields (status, our number, role) are never touched, and a
// descriptive field Bill has edited since the scan wrote it is left alone.

export const FEED_FIELDS = ["title", "agency", "county", "dueDate", "docsUrl", "notes", "source"] as const;
export type FeedField = (typeof FEED_FIELDS)[number];
export type FeedValues = Record<FeedField, string>;

export interface FeedBid extends FeedValues {
  /** Stable id for the opportunity (owner + project), chosen by the scan. */
  key: string;
  role: "prime" | "sub";
}

/** Firestore doc id for a feed bid: stable for its key. */
export function feedDocId(key: string): string {
  const norm = key.trim().toLowerCase().replace(/\s+/g, " ");
  return `feed_${createHash("sha256").update(norm).digest("hex").slice(0, 24)}`;
}

export function feedValues(b: Partial<Record<FeedField, unknown>>): FeedValues {
  const out = {} as FeedValues;
  for (const f of FEED_FIELDS) out[f] = typeof b[f] === "string" ? (b[f] as string).trim() : "";
  return out;
}

export type FeedPlan =
  | { kind: "create"; doc: Record<string, unknown> }
  | { kind: "update"; patch: Record<string, unknown>; changed: FeedField[] }
  | { kind: "skip"; reason: "unchanged" | "deleted" | "edited" };

/**
 * What to do with one incoming bid.
 * - No doc and never seen: create it as "tracking".
 * - No doc but seen before: Bill deleted it, so leave it deleted.
 * - Doc exists: update a field only if it still shows what the scan last
 *   wrote (`feed` snapshot) and the new value differs.
 */
export function planFeedBid(
  incoming: FeedBid,
  existing: Record<string, unknown> | null,
  seenBefore: boolean,
  now: string
): FeedPlan {
  const next = feedValues(incoming);
  if (!existing) {
    if (seenBefore) return { kind: "skip", reason: "deleted" };
    return {
      kind: "create",
      doc: {
        ...next,
        role: incoming.role,
        status: "tracking",
        amount: "",
        origin: "bid-scan",
        feedKey: incoming.key,
        feed: next,
        createdAt: now,
        updatedAt: now,
      },
    };
  }
  const last = feedValues((existing.feed as Record<string, unknown>) || {});
  const cur = feedValues(existing as Record<string, unknown>);
  const patch: Record<string, unknown> = {};
  const changed: FeedField[] = [];
  let edited = false;
  for (const f of FEED_FIELDS) {
    if (next[f] === last[f]) continue; // the scan has nothing new here
    if (!next[f]) continue; // never blank out a field
    if (cur[f] !== last[f]) {
      edited = true; // Bill changed it: his value wins
      continue;
    }
    patch[f] = next[f];
    changed.push(f);
  }
  if (!changed.length) return { kind: "skip", reason: edited ? "edited" : "unchanged" };
  patch.feed = { ...last, ...Object.fromEntries(changed.map((f) => [f, next[f]])) };
  patch.updatedAt = now;
  return { kind: "update", patch, changed };
}
