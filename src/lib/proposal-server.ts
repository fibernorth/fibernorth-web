import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import type { Proposal, QuoteRequest } from "@/lib/types";
import { isPastExpiry, leadQuoteRollup, type QuoteBadge, type QuoteForRollup } from "@/lib/proposal";
import { getClientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";

// Server-only helpers for the public proposal routes. The token in the URL is
// the only credential, so every read goes through the Admin SDK and returns
// only the customer-safe snapshot.

export function db(): Firestore {
  return getFirestore(initializeAdminApp());
}

export function tokenOk(token: string): boolean {
  return /^[A-Za-z0-9_-]{24,64}$/.test(token);
}

export async function loadProposal(token: string): Promise<(Proposal & { token: string }) | null> {
  if (!tokenOk(token)) return null;
  const snap = await db().collection("proposals").doc(token).get();
  if (!snap.exists) return null;
  return { token, ...(snap.data() as Proposal) };
}

/**
 * A proposal the customer can no longer act on because its date passed.
 * Any status still waiting on a decision counts, declined included (a
 * customer may change their mind and accept, but only while it's good).
 * Accepted, replaced and void proposals are never "expired".
 */
export function isExpired(p: Pick<Proposal, "expiresAt" | "status">, now: number = Date.now()): boolean {
  return ["sent", "viewed", "declined", "expired"].includes(p.status) && isPastExpiry(p.expiresAt, now);
}

type Tx = FirebaseFirestore.Transaction;

/**
 * Every quote on a lead, read inside a transaction: those carrying the
 * lead's id, plus the one lead.quoteId names (website quotes imported before
 * the two-way link existed only have that side).
 */
export async function readLeadQuotes(
  tx: Tx,
  store: Firestore,
  leadId: string,
  leadQuoteId?: string
): Promise<QuoteForRollup[]> {
  const snap = await tx.get(store.collection("quoteRequests").where("leadId", "==", leadId));
  const out: QuoteForRollup[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<QuoteRequest, "id">) }));
  if (leadQuoteId && !out.some((q) => q.id === leadQuoteId)) {
    const extra = await tx.get(store.collection("quoteRequests").doc(leadQuoteId));
    if (extra.exists) out.push({ id: extra.id, ...(extra.data() as Omit<QuoteRequest, "id">) });
  }
  return out;
}

/**
 * The lead fields that describe its quotes, from the quotes as they will be
 * after this transaction: `changed` replaces (or with null, drops) quotes in
 * the list read by readLeadQuotes.
 */
export function leadQuoteFields(
  quotes: QuoteForRollup[],
  changed: Record<string, QuoteForRollup | null>,
  today: string
): { quoteId: string; quote: QuoteBadge | null; quoteCount: number } {
  const next = quotes
    .filter((q) => !(q.id in changed) || changed[q.id] !== null)
    .map((q) => (changed[q.id] ? changed[q.id]! : q));
  for (const [id, q] of Object.entries(changed)) if (q && !next.some((x) => x.id === id)) next.push(q);
  return leadQuoteRollup(next, today);
}

/** Lead update for the rollup: FieldValue.delete() for a lead left with no quotes. */
export function leadQuotePatch(r: ReturnType<typeof leadQuoteRollup>): Record<string, unknown> {
  if (!r.quote) return { quoteId: FieldValue.delete(), quote: FieldValue.delete(), quoteCount: 0 };
  return { quoteId: r.quoteId, quote: r.quote, quoteCount: r.quoteCount };
}

// Cheap per-instance limiter for high-volume, low-stakes pings (proposal
// view beacons, Bore-ON callbacks). Anything that writes customer-visible
// state should use rateLimitedShared instead.
const hits = new Map<string, { n: number; t: number }>();
export function rateLimited(request: Request, max = 30): boolean {
  const ip = getClientIp(request);
  const now = Date.now();
  const e = hits.get(ip);
  if (!e || now - e.t > 10 * 60_000) {
    hits.set(ip, { n: 1, t: now });
    return false;
  }
  e.n += 1;
  return e.n > max;
}

export function clientIp(request: Request): string {
  return getClientIp(request);
}

/** Firestore-backed limit shared across instances (10-minute window per IP). */
export async function rateLimitedShared(request: Request, bucket: string, max = 10): Promise<boolean> {
  const r = await rateLimit({ bucket, key: getClientIp(request), limit: max, windowMs: 10 * 60_000 });
  return r.limited;
}
