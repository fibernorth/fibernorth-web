import { describe, expect, it } from "vitest";
import { jsonLdScript } from "./json-ld";

describe("jsonLdScript", () => {
  it("cannot close the surrounding script element", () => {
    const out = jsonLdScript({ headline: "</script><script>alert(1)</script>" });
    expect(out).not.toMatch(/</);
    expect(out).not.toMatch(/>/);
    expect(out.toLowerCase()).not.toContain("</script");
  });

  it("round-trips to the same data", () => {
    const data = {
      "@context": "https://schema.org",
      name: "A & B <c> \u2028 \u2029 'q' \"dq\"",
      list: [1, 2, { x: "<!-- y -->" }],
    };
    expect(JSON.parse(jsonLdScript(data))).toEqual(data);
  });

  it("escapes ampersands and HTML comment openers", () => {
    expect(jsonLdScript({ a: "<!--&" })).toBe('{"a":"\\u003c!--\\u0026"}');
  });

  it("handles undefined safely", () => {
    expect(jsonLdScript(undefined)).toBe("null");
  });
});
