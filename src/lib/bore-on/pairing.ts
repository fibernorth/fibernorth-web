// The pure half of "Connect to Bore-ON": the one-time state and PKCE verifier,
// the consent address, and reading what comes back. No Firebase here, so
// every refusal is tested without a database.
//
// The flow: the owner presses Connect; we make a random verifier, keep it, and
// send only its sha256 (the challenge) with the browser to Bore-ON's consent
// page. An admin approves there. The browser returns here carrying a one-time
// CODE, never the key. We trade the code, server to server, for the key and
// the callback secret, proving we are the app that started it by showing the
// verifier. A stolen code is useless without it.

import { createHash, randomBytes, timingSafeEqual } from "crypto";

export const BORE_ON_DEFAULT_BASE = "https://bore-on.com";

/** Our name in Bore-ON's registry of apps that may connect. */
export const PAIRING_CLIENT = "fibernorth";

/**
 * Where Bore-ON returns the browser. It must equal the address Bore-ON's own
 * registry holds for us, character for character; Bore-ON refuses any other.
 */
export const PAIRING_REDIRECT_URI = "https://fibernorth.com/api/bore-on/connect/callback";

/** A start request is good for ten minutes, like the Google Calendar one. */
export const PAIRING_TTL_MS = 10 * 60_000;

const sha256 = (s: string) => createHash("sha256").update(s).digest();

export function makeVerifier(): string {
  return randomBytes(48).toString("base64url");
}

/** RFC 7636: base64url(sha256(verifier)), unpadded. */
export function challengeFor(verifier: string): string {
  return sha256(verifier).toString("base64url");
}

export function makeState(): string {
  return randomBytes(24).toString("hex");
}

/** An https base address without a trailing slash, or null when it is not one. */
export function normalizeBase(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function consentUrl(base: string, p: { state: string; challenge: string }): string {
  const url = new URL(`${base}/connect/crm`);
  url.searchParams.set("client", PAIRING_CLIENT);
  url.searchParams.set("state", p.state);
  url.searchParams.set("code_challenge", p.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export interface PendingPairing {
  state?: string;
  verifier?: string;
  base?: string;
  startedAt?: string;
}

/** Is this return from Bore-ON the one we started, and recent enough? */
export function pendingMatches(p: PendingPairing | undefined, state: string, nowMs: number): boolean {
  if (!p?.state || !p.verifier || !p.base || !p.startedAt || !state) return false;
  const age = nowMs - Date.parse(p.startedAt);
  if (!Number.isFinite(age) || age < 0 || age >= PAIRING_TTL_MS) return false;
  const a = Buffer.from(p.state);
  const b = Buffer.from(state);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type CallbackParams =
  | { kind: "code"; code: string; state: string }
  | { kind: "denied"; state: string }
  | { kind: "invalid" };

export function readCallback(params: URLSearchParams): CallbackParams {
  const state = params.get("state") || "";
  if (!state) return { kind: "invalid" };
  if (params.get("error")) return { kind: "denied", state };
  const code = params.get("code") || "";
  return code ? { kind: "code", code, state } : { kind: "invalid" };
}

export interface Exchange {
  apiKey: string;
  webhookSecret: string;
  companyName: string;
  keyId: string;
}

/** What Bore-ON hands back, checked for shape before anything is stored. */
export function parseExchange(body: unknown): Exchange | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const apiKey = typeof b.apiKey === "string" ? b.apiKey : "";
  const webhookSecret = typeof b.webhookSecret === "string" ? b.webhookSecret : "";
  if (!/^bo\.[^.\s]+\.[0-9a-f]{32,}$/.test(apiKey)) return null;
  if (webhookSecret.length < 32 || webhookSecret.length > 200) return null;
  return {
    apiKey,
    webhookSecret,
    companyName: typeof b.companyName === "string" ? b.companyName.slice(0, 120) : "",
    keyId: typeof b.keyId === "string" ? b.keyId.slice(0, 80) : "",
  };
}

export type PairingOutcome = "connected" | "denied" | "state" | "exchange" | "unreachable";

/** Plain words for the settings screen, keyed by what the callback redirected with. */
export const PAIRING_MESSAGES: Record<string, string> = {
  connected: "Connected to Bore-ON.",
  denied: "The connection was cancelled in Bore-ON. Nothing was changed.",
  state: "That connection link expired or was not the one started here. Press Connect to Bore-ON again.",
  exchange: "Bore-ON would not hand over the key. Press Connect to Bore-ON again.",
  unreachable: "Couldn't reach Bore-ON. Check the base URL and try again.",
};
