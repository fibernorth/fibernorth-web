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

describe("sendProposalEmail sender", () => {
  const base = {
    to: "pat@example.com",
    customerName: "Pat Example",
    url: "https://fibernorth.com/proposal/tok",
    total: 3000,
    version: 1,
    message: "",
    expiresAt: "2026-12-01T04:59:59.000Z",
  };
  const sent = async (extra: Record<string, unknown>) => {
    process.env.RESEND_API_KEY = "test";
    process.env.NOTIFICATION_EMAIL_TO = "bill@fibernorth.com";
    const calls: Array<{ from: string; reply_to: string; html: string; text: string; subject: string; bcc?: string[] }> = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const { sendProposalEmail } = await import("./notifications");
      await sendProposalEmail({ ...base, ...extra });
    } finally {
      globalThis.fetch = realFetch;
    }
    return calls[0];
  };

  it("goes out from the salesperson who made the quote, signed with their name and phone", async () => {
    const c = await sent({ senderEmail: "maddy@fibernorth.com", senderName: "Madison Smith", senderPhone: "231-555-0101" });
    expect(c.from).toBe("Madison Smith, FiberNorth <maddy@fibernorth.com>");
    expect(c.reply_to).toBe("maddy@fibernorth.com");
    expect(c.text).toContain("231-555-0101");
    expect(c.text).toContain("Madison Smith\nFiberNorth Underground");
    expect(c.text).not.toContain("Bill Gaylord");
    expect(c.bcc).toContain("bill@fibernorth.com");
  });

  it("goes out from Bill when the sender is Bill or has no fibernorth.com address", async () => {
    const c = await sent({ senderEmail: "bill@fibernorth.com", phone: "231-944-6471" });
    expect(c.from).toBe("Bill Gaylord, FiberNorth <bill@fibernorth.com>");
    expect(c.text).toContain("Bill Gaylord\nFiberNorth Underground");
    const g = await sent({ senderEmail: "someone@gmail.com" });
    expect(g.from).toBe("Bill Gaylord, FiberNorth <bill@fibernorth.com>");
  });

  it("names the option in the subject and body", async () => {
    const c = await sent({ optionLabel: "Option B: 2 in conduit", address: "1 Main St" });
    expect(c.subject).toBe("Your directional drilling quote, Option B: 2 in conduit, 1 Main St: $3,000.00");
    expect(c.text).toContain("Option B: 2 in conduit\nTotal: $3,000.00");
  });
});
