import { describe, expect, it } from "vitest";
import { classifyVisit, isBotUserAgent, isMetaIp } from "@/lib/visit-filter";

describe("letter visit filter", () => {
  it("treats Meta's address space as a crawler, without a lookup", async () => {
    expect(isMetaIp("57.141.0.23")).toBe(true);
    expect(isMetaIp("57.141.16.89")).toBe(true);
    expect(isMetaIp("57.144.2.1")).toBe(true);
    expect(isMetaIp("57.150.0.1")).toBe(false);
    expect(isMetaIp("157.141.0.1")).toBe(false);
    expect(await classifyVisit("57.141.14.12")).toEqual({ count: false, org: "Meta (crawler)" });
  });
  it("spots crawler user agents, including Meta's bare 'Google'", () => {
    expect(isBotUserAgent("Google")).toBe(true);
    expect(isBotUserAgent("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")).toBe(true);
    expect(isBotUserAgent("meta-externalagent/1.1")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(isBotUserAgent("Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36 GoogleApp")).toBe(false);
  });
});
