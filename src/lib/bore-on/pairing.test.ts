import { describe, it, expect } from "vitest";
import {
  PAIRING_REDIRECT_URI, PAIRING_TTL_MS, challengeFor, consentUrl, makeState, makeVerifier, normalizeBase,
  parseExchange, pendingMatches, readCallback,
} from "./pairing";

// RFC 7636 appendix B. Bore-ON's tests use the same vector, so the two ends agree.
const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

describe("pkce", () => {
  it("matches the RFC 7636 vector", () => {
    expect(challengeFor(RFC_VERIFIER)).toBe(RFC_CHALLENGE);
  });
  it("makes verifiers Bore-ON will accept (43 to 128 url-safe characters) and a challenge of 43", () => {
    const v = makeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    expect(challengeFor(v)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(makeVerifier()).not.toBe(v);
  });
  it("makes states Bore-ON will accept (16 to 128 url-safe characters)", () => {
    expect(makeState()).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
  });
});

describe("consent address", () => {
  it("names us, carries only the challenge, and asks for S256", () => {
    const url = new URL(consentUrl("https://bore-on.com", { state: "s".repeat(24), challenge: RFC_CHALLENGE }));
    expect(`${url.origin}${url.pathname}`).toBe("https://bore-on.com/connect/crm");
    expect(url.searchParams.get("client")).toBe("fibernorth");
    expect(url.searchParams.get("code_challenge")).toBe(RFC_CHALLENGE);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("s".repeat(24));
    expect(url.searchParams.has("code_verifier")).toBe(false);
  });
  it("returns to the address Bore-ON's registry holds for us", () => {
    expect(PAIRING_REDIRECT_URI).toBe("https://fibernorth.com/api/bore-on/connect/callback");
  });
});

describe("base address", () => {
  it("accepts an https origin and trims the rest", () => {
    expect(normalizeBase("https://bore-on.com/")).toBe("https://bore-on.com");
    expect(normalizeBase(" https://bore-on.com/anything?x=1 ")).toBe("https://bore-on.com");
  });
  it("refuses everything else", () => {
    for (const bad of ["http://bore-on.com", "https://u:p@bore-on.com", "bore-on.com", "", null, undefined, 42]) {
      expect(normalizeBase(bad as string)).toBeNull();
    }
  });
});

describe("the return trip", () => {
  const now = Date.parse("2026-10-01T12:00:00Z");
  const pending = { state: "a".repeat(48), verifier: "v".repeat(64), base: "https://bore-on.com", startedAt: new Date(now - 60_000).toISOString() };
  it("accepts the state we started, inside ten minutes", () => {
    expect(pendingMatches(pending, "a".repeat(48), now)).toBe(true);
  });
  it("refuses another state, a stale start, a missing record and a start from the future", () => {
    expect(pendingMatches(pending, "b".repeat(48), now)).toBe(false);
    expect(pendingMatches(pending, "a".repeat(47), now)).toBe(false);
    expect(pendingMatches({ ...pending, startedAt: new Date(now - PAIRING_TTL_MS).toISOString() }, "a".repeat(48), now)).toBe(false);
    expect(pendingMatches({ ...pending, startedAt: new Date(now + 5000).toISOString() }, "a".repeat(48), now)).toBe(false);
    expect(pendingMatches(undefined, "a".repeat(48), now)).toBe(false);
    expect(pendingMatches({ ...pending, verifier: undefined }, "a".repeat(48), now)).toBe(false);
    expect(pendingMatches(pending, "", now)).toBe(false);
  });
  it("reads a code, a refusal, and nothing useful", () => {
    expect(readCallback(new URLSearchParams("code=bp.c.x&state=s1"))).toEqual({ kind: "code", code: "bp.c.x", state: "s1" });
    expect(readCallback(new URLSearchParams("error=access_denied&state=s1"))).toEqual({ kind: "denied", state: "s1" });
    expect(readCallback(new URLSearchParams("code=bp.c.x"))).toEqual({ kind: "invalid" });
    expect(readCallback(new URLSearchParams("state=s1"))).toEqual({ kind: "invalid" });
  });
});

describe("what Bore-ON hands back", () => {
  const good = { apiKey: `bo.company1.${"a".repeat(48)}`, webhookSecret: "f".repeat(64), companyName: "KSA", keyId: "k1" };
  it("accepts a well-formed key and secret", () => {
    expect(parseExchange(good)).toEqual(good);
  });
  it("refuses a key or secret that is the wrong shape", () => {
    for (const bad of [
      null, {}, { ...good, apiKey: "nope" }, { ...good, apiKey: `bo.company1.${"a".repeat(8)}` },
      { ...good, apiKey: `bp.company1.${"a".repeat(48)}` }, { ...good, webhookSecret: "short" }, { ...good, webhookSecret: 5 },
    ]) {
      expect(parseExchange(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});
