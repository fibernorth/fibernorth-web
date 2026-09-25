import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import type { Proposal } from "@/lib/types";

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

export function isExpired(p: Pick<Proposal, "expiresAt" | "status">): boolean {
  return (p.status === "sent" || p.status === "viewed") && new Date(p.expiresAt).getTime() < Date.now();
}

const hits = new Map<string, { n: number; t: number }>();
export function rateLimited(request: Request, max = 30): boolean {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
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
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
