// The Bid feed key check, shared by the bid import (src/app/api/bids/import)
// and the morning list (src/app/api/cron/morning): the built-in scan key
// (stored only as its SHA-256) or the key saved in Admin -> Settings -> Bid
// feed (integrationSecrets/bidFeed).

import { createHash, timingSafeEqual } from "crypto";

export const SCAN_KEY_SHA256 = "96641669f7ceae20454f9804cecf475905cff9686d99470800e805b8abe4bdf0";

export function scanKeyMatches(given: string): boolean {
  if (!given) return false;
  const a = Buffer.from(createHash("sha256").update(given).digest("hex"));
  const b = Buffer.from(SCAN_KEY_SHA256);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function secretMatches(given: string, expected: string): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
