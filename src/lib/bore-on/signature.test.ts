import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { signBoreOnBody, verifyBoreOnSignature, MAX_AGE_SEC } from "./signature";

const secret = "s3cret";
const body = JSON.stringify({ designId: "des1" });
const ts = "1757426400";
const now = Number(ts) + 30;

describe("verifyBoreOnSignature", () => {
  it("matches the scheme Bore-ON documents: HMAC-SHA256 over `${timestamp}.${body}`", () => {
    const expected = `sha256=${createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex")}`;
    expect(signBoreOnBody(secret, ts, body)).toBe(expected);
  });
  it("accepts a fresh, correctly signed delivery", () => {
    expect(verifyBoreOnSignature({ secret, timestamp: ts, signature: signBoreOnBody(secret, ts, body), rawBody: body, nowSec: now })).toEqual({ ok: true });
  });
  it("rejects a missing header, a stale timestamp, a wrong secret and a changed body", () => {
    const sig = signBoreOnBody(secret, ts, body);
    expect(verifyBoreOnSignature({ secret, timestamp: null, signature: sig, rawBody: body, nowSec: now })).toEqual({ ok: false, reason: "missing" });
    expect(verifyBoreOnSignature({ secret: "", timestamp: ts, signature: sig, rawBody: body, nowSec: now })).toEqual({ ok: false, reason: "missing" });
    expect(verifyBoreOnSignature({ secret, timestamp: ts, signature: sig, rawBody: body, nowSec: now + MAX_AGE_SEC + 1 })).toEqual({ ok: false, reason: "stale" });
    expect(verifyBoreOnSignature({ secret, timestamp: "abc", signature: sig, rawBody: body, nowSec: now })).toEqual({ ok: false, reason: "stale" });
    expect(verifyBoreOnSignature({ secret: "other", timestamp: ts, signature: sig, rawBody: body, nowSec: now })).toEqual({ ok: false, reason: "mismatch" });
    expect(verifyBoreOnSignature({ secret, timestamp: ts, signature: sig, rawBody: `${body} `, nowSec: now })).toEqual({ ok: false, reason: "mismatch" });
    expect(verifyBoreOnSignature({ secret, timestamp: ts, signature: "sha256=00", rawBody: body, nowSec: now })).toEqual({ ok: false, reason: "mismatch" });
  });
});
