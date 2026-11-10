import { afterEach, describe, expect, it, vi } from "vitest";
import { turnstileEnabled, verifyTurnstile } from "@/lib/turnstile";

const reply = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);

afterEach(() => {
  delete process.env.TURNSTILE_SECRET_KEY;
});

describe("verifyTurnstile", () => {
  it("is off (everything passes) until the secret key is set", async () => {
    expect(turnstileEnabled()).toBe(false);
    const f = reply({ success: false });
    expect(await verifyTurnstile("", "1.2.3.4", f as unknown as typeof fetch)).toEqual({ ok: true, skipped: true });
    expect(f).not.toHaveBeenCalled();
  });

  it("with the key set: no token fails, a good token passes, a bad one fails", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    expect(turnstileEnabled()).toBe(true);
    expect(await verifyTurnstile("", undefined, reply({ success: true }) as unknown as typeof fetch)).toEqual({ ok: false, reason: "missing" });
    const good = reply({ success: true });
    expect(await verifyTurnstile("tok", "1.2.3.4", good as unknown as typeof fetch)).toEqual({ ok: true });
    const body = (good.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body;
    expect(body.get("secret")).toBe("secret");
    expect(body.get("response")).toBe("tok");
    expect(body.get("remoteip")).toBe("1.2.3.4");
    expect(await verifyTurnstile("tok", undefined, reply({ success: false, "error-codes": ["invalid-input-response"] }) as unknown as typeof fetch)).toEqual({
      ok: false,
      reason: "invalid-input-response",
    });
  });

  it("if Cloudflare can't be reached, the lead still goes through", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const down = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await verifyTurnstile("tok", undefined, down as unknown as typeof fetch)).toEqual({ ok: true, skipped: true });
    expect(await verifyTurnstile("tok", undefined, reply({}, false) as unknown as typeof fetch)).toEqual({ ok: true, skipped: true });
  });
});
