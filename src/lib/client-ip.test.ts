import { describe, expect, it } from "vitest";
import { getClientIp } from "./client-ip";

const APP_HOSTING = { K_SERVICE: "fn-underground" };
const LOCAL = {};

function h(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("getClientIp", () => {
  it("prefers x-fah-client-ip on App Hosting", () => {
    const headers = h({ "x-fah-client-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1, 203.0.113.7, 10.0.0.1" });
    expect(getClientIp(headers, APP_HOSTING)).toBe("203.0.113.7");
  });

  it("ignores x-fah-client-ip when not on App Hosting", () => {
    const headers = h({ "x-fah-client-ip": "9.9.9.9", "x-forwarded-for": "203.0.113.7" });
    expect(getClientIp(headers, LOCAL)).toBe("203.0.113.7");
  });

  it("ignores a garbage x-fah-client-ip and falls back to X-Forwarded-For", () => {
    const headers = h({ "x-fah-client-ip": "<script>", "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    expect(getClientIp(headers, APP_HOSTING)).toBe("203.0.113.7");
  });

  it("does not trust a client-supplied first X-Forwarded-For entry", () => {
    // Client sent "X-Forwarded-For: 6.6.6.6"; the LB appended client + its hop.
    const headers = h({ "x-forwarded-for": "6.6.6.6, 203.0.113.7, 130.211.0.1" });
    expect(getClientIp(headers, LOCAL)).toBe("203.0.113.7");
  });

  it("uses the second-to-last entry with exactly two entries", () => {
    expect(getClientIp(h({ "x-forwarded-for": "203.0.113.7, 130.211.0.1" }), LOCAL)).toBe("203.0.113.7");
  });

  it("uses the only entry when there is one", () => {
    expect(getClientIp(h({ "x-forwarded-for": " 203.0.113.7 " }), LOCAL)).toBe("203.0.113.7");
  });

  it("handles IPv6 and ports", () => {
    expect(getClientIp(h({ "x-forwarded-for": "2001:db8::1, 10.0.0.1" }), LOCAL)).toBe("2001:db8::1");
    expect(getClientIp(h({ "x-forwarded-for": "[2001:db8::2]:443" }), LOCAL)).toBe("2001:db8::2");
    expect(getClientIp(h({ "x-forwarded-for": "203.0.113.9:5555" }), LOCAL)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip, then unknown", () => {
    expect(getClientIp(h({ "x-real-ip": "203.0.113.8" }), LOCAL)).toBe("203.0.113.8");
    expect(getClientIp(h({}), LOCAL)).toBe("unknown");
    expect(getClientIp(h({ "x-forwarded-for": "not-an-ip" }), LOCAL)).toBe("unknown");
  });

  it("accepts a Request", () => {
    const req = new Request("https://fibernorth.com/api/quote", {
      headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.7, 10.0.0.1" },
    });
    expect(getClientIp(req, LOCAL)).toBe("203.0.113.7");
  });
});
