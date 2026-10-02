import { describe, it, expect } from "vitest";
import { basicAuth, isQboConnected, tokenErrorMessage, tokenPatch, usableAccessToken } from "@/lib/quickbooks/tokens";
import { faultText, isNotFound, parseFault } from "@/lib/quickbooks/fault";

const NOW = Date.parse("2026-10-02T12:00:00Z");

describe("tokens", () => {
  it("connected needs keys, a refresh token and a company", () => {
    expect(isQboConnected({ clientId: "a", clientSecret: "b", refreshToken: "r", realmId: "1" })).toBe(true);
    expect(isQboConnected({ clientId: "a", clientSecret: "b", refreshToken: "r" })).toBe(false);
    expect(isQboConnected({ clientId: "a", clientSecret: "b", realmId: "1", refreshToken: "" })).toBe(false);
  });

  it("uses a cached access token only with more than 2 minutes left", () => {
    const at = (ms: number) => new Date(NOW + ms).toISOString();
    expect(usableAccessToken({ accessToken: "A", accessTokenExpiresAt: at(10 * 60_000) }, NOW)).toBe("A");
    expect(usableAccessToken({ accessToken: "A", accessTokenExpiresAt: at(90_000) }, NOW)).toBeNull();
    expect(usableAccessToken({ accessToken: "A", accessTokenExpiresAt: "junk" }, NOW)).toBeNull();
    expect(usableAccessToken({}, NOW)).toBeNull();
  });

  it("always keeps the rotated refresh token", () => {
    const p = tokenPatch(
      { access_token: "A2", refresh_token: "R2", expires_in: 3600, x_refresh_token_expires_in: 8_640_000 },
      { refreshToken: "R1", refreshTokenExpiresAt: "2026-12-01T00:00:00.000Z" },
      NOW
    );
    expect(p).toEqual({
      accessToken: "A2",
      accessTokenExpiresAt: "2026-10-02T13:00:00.000Z",
      refreshToken: "R2",
      refreshTokenExpiresAt: "2027-01-10T12:00:00.000Z",
    });
  });

  it("keeps the old refresh token when none comes back", () => {
    const p = tokenPatch({ access_token: "A2" }, { refreshToken: "R1", refreshTokenExpiresAt: "2026-12-01T00:00:00.000Z" }, NOW);
    expect(p.refreshToken).toBe("R1");
    expect(p.refreshTokenExpiresAt).toBe("2026-12-01T00:00:00.000Z");
    expect(p.accessTokenExpiresAt).toBe("2026-10-02T13:00:00.000Z");
  });

  it("refuses a response with no tokens", () => {
    expect(() => tokenPatch({}, { refreshToken: "R1" }, NOW)).toThrow(/no access token/);
    expect(() => tokenPatch({ access_token: "A" }, {}, NOW)).toThrow(/no refresh token/);
  });

  it("basic auth and token errors", () => {
    expect(basicAuth("id", "secret")).toBe(`Basic ${Buffer.from("id:secret").toString("base64")}`);
    expect(tokenErrorMessage(400, '{"error":"invalid_grant"}')).toMatch(/Reconnect QuickBooks/);
    expect(tokenErrorMessage(401, '{"error":"invalid_client"}')).toMatch(/client ID or secret/);
    expect(tokenErrorMessage(500, "oops")).toBe("QuickBooks token refresh failed (500)");
  });
});

describe("faults", () => {
  const body = JSON.stringify({
    Fault: { Error: [{ Message: "Object Not Found", Detail: "Something you're trying to use has been made inactive or deleted", code: "610" }], type: "ValidationFault" },
  });

  it("reads Intuit's message and code", () => {
    expect(parseFault(body)).toEqual({
      message: "Object Not Found: Something you're trying to use has been made inactive or deleted",
      code: "610",
      type: "ValidationFault",
    });
    expect(faultText(400, body)).toBe("QuickBooks said: Object Not Found: Something you're trying to use has been made inactive or deleted");
    expect(parseFault("<html>")).toBeNull();
    expect(faultText(503, "<html>down</html>")).toBe("QuickBooks error (HTTP 503): <html>down</html>");
  });

  it("knows a deleted object", () => {
    expect(isNotFound(400, parseFault(body))).toBe(true);
    expect(isNotFound(404, null)).toBe(true);
    expect(isNotFound(400, { message: "Duplicate Name Exists Error", code: "6240", type: "" })).toBe(false);
  });
});
