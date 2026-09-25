// Checking a Bore-ON callback is really from Bore-ON. Server only (node crypto).
//
// Bore-ON signs `${timestamp}.${rawBody}` with HMAC-SHA256 under the shared
// secret and sends `x-boreon-timestamp` (Unix seconds) and
// `x-boreon-signature: sha256=<hex>`. The timestamp is inside the signed
// material, so a captured delivery cannot be replayed once it is old.

import { createHmac, timingSafeEqual } from "crypto";

export const SIGNATURE_HEADER = "x-boreon-signature";
export const TIMESTAMP_HEADER = "x-boreon-timestamp";
/** How old a delivery may be and still count, in seconds. */
export const MAX_AGE_SEC = 5 * 60;

export function signBoreOnBody(secret: string, timestamp: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

export type SignatureCheck = { ok: true } | { ok: false; reason: "missing" | "stale" | "mismatch" };

export function verifyBoreOnSignature(input: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  nowSec?: number;
}): SignatureCheck {
  const { secret, timestamp, signature, rawBody } = input;
  if (!secret || !timestamp || !signature) return { ok: false, reason: "missing" };
  const ts = Number(timestamp);
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_AGE_SEC) return { ok: false, reason: "stale" };
  const expected = Buffer.from(signBoreOnBody(secret, timestamp, rawBody));
  const given = Buffer.from(signature.trim());
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true };
}
