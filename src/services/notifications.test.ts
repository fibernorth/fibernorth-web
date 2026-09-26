import { describe, expect, it } from "vitest";
import { esc, slackEsc, subjectText } from "./notifications";

describe("esc", () => {
  it("escapes HTML metacharacters", () => {
    expect(esc(`<img src=x onerror="a('b')">&`)).toBe(
      "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;"
    );
  });

  it("truncates before escaping, so no half entity is left", () => {
    const out = esc("a".repeat(1999) + "&&&");
    expect(out).toBe("a".repeat(1999) + "&amp;");
  });
});

describe("subjectText", () => {
  it("is plain text, not HTML-escaped", () => {
    expect(subjectText("Pat O'Brien & Sons")).toBe("Pat O'Brien & Sons");
  });

  it("removes line breaks and control characters", () => {
    expect(subjectText("Bob\r\nBcc: evil@example.com")).toBe("Bob Bcc: evil@example.com");
    expect(subjectText("a\u0000b\tc\u2028d")).toBe("a b c d");
  });

  it("caps length", () => {
    expect(subjectText("x".repeat(500))).toHaveLength(80);
    expect(subjectText("x".repeat(500), 200)).toHaveLength(200);
  });
});

describe("slackEsc", () => {
  it("stops link and mention injection", () => {
    expect(slackEsc("<!channel> <https://evil|click>")).toBe("&lt;!channel&gt; &lt;https://evil|click&gt;");
  });
});
