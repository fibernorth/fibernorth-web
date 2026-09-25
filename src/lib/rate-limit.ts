import { createHash } from "node:crypto";

// Fixed-window rate limiter shared across server instances (Firestore
// counter docs), so limits survive cold starts and scale-out, unlike the old
// per-instance Maps. Server-only (Admin SDK).
//
// Docs live in `rateLimits/{bucket}_{hash(key)}_{windowStart}` with an
// `expireAt` timestamp. firestore.rules has no match for rateLimits, so no
// client can read or write them. Optional: add a TTL policy on
// rateLimits.expireAt in the Firebase console so old windows get deleted.

export interface RateLimitOptions {
  /** Logical limiter name, e.g. "quote-submit". */
  bucket: string;
  /** Who is being limited: client IP, admin UID, ... */
  key: string;
  /** Allowed hits per window. */
  limit: number;
  windowMs: number;
  /**
   * What to do if the store errors: true (default) lets the request through
   * so a Firestore hiccup never drops a customer's quote; false blocks.
   */
  failOpen?: boolean;
}

export interface RateLimitResult {
  limited: boolean;
  count: number;
  remaining: number;
  resetAt: number;
}

export interface RateLimitStore {
  /** Atomically add one hit to the doc and return the new count. */
  hit(docId: string, expireAt: Date): Promise<number>;
}

export function rateLimitDocId(bucket: string, key: string, windowStart: number): string {
  const safeBucket = bucket.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 60);
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 32);
  return `${safeBucket}_${hash}_${windowStart}`;
}

export function windowStartFor(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

export async function checkRateLimit(
  opts: RateLimitOptions,
  store: RateLimitStore,
  now: number = Date.now()
): Promise<RateLimitResult> {
  const start = windowStartFor(now, opts.windowMs);
  const resetAt = start + opts.windowMs;
  try {
    const count = await store.hit(
      rateLimitDocId(opts.bucket, opts.key, start),
      new Date(resetAt + opts.windowMs)
    );
    return {
      limited: count > opts.limit,
      count,
      remaining: Math.max(0, opts.limit - count),
      resetAt,
    };
  } catch (err) {
    console.error(`Rate limiter (${opts.bucket}) failed:`, err);
    const failOpen = opts.failOpen ?? true;
    return { limited: !failOpen, count: 0, remaining: failOpen ? opts.limit : 0, resetAt };
  }
}

let firestoreStore: RateLimitStore | null = null;

async function getFirestoreStore(): Promise<RateLimitStore> {
  if (firestoreStore) return firestoreStore;
  const [{ getFirestore, FieldValue, Timestamp }, { initializeAdminApp }] = await Promise.all([
    import("firebase-admin/firestore"),
    import("@/services/firebase-admin"),
  ]);
  const db = getFirestore(initializeAdminApp());
  firestoreStore = {
    async hit(docId, expireAt) {
      const ref = db.collection("rateLimits").doc(docId);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const next = ((snap.get("count") as number | undefined) ?? 0) + 1;
        if (snap.exists) {
          tx.update(ref, { count: FieldValue.increment(1) });
        } else {
          tx.set(ref, { count: 1, expireAt: Timestamp.fromDate(expireAt) });
        }
        return next;
      });
    },
  };
  return firestoreStore;
}

/** Shared (Firestore-backed) rate limit. */
export async function rateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  let store: RateLimitStore;
  try {
    store = await getFirestoreStore();
  } catch (err) {
    console.error("Rate limiter store unavailable:", err);
    const failOpen = opts.failOpen ?? true;
    return { limited: !failOpen, count: 0, remaining: 0, resetAt: Date.now() + opts.windowMs };
  }
  return checkRateLimit(opts, store);
}
