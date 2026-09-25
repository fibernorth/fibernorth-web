import { describe, expect, it } from "vitest";
import { checkRateLimit, rateLimitDocId, windowStartFor, type RateLimitStore } from "./rate-limit";

function memoryStore(): RateLimitStore & { docs: Map<string, number> } {
  const docs = new Map<string, number>();
  return {
    docs,
    async hit(id) {
      const n = (docs.get(id) ?? 0) + 1;
      docs.set(id, n);
      return n;
    },
  };
}

const failingStore: RateLimitStore = {
  async hit() {
    throw new Error("firestore down");
  },
};

describe("checkRateLimit", () => {
  const opts = { bucket: "quote-submit", key: "203.0.113.7", limit: 3, windowMs: 60_000 };

  it("allows up to the limit and blocks after", async () => {
    const store = memoryStore();
    const now = 1_000_000;
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await checkRateLimit(opts, store, now));
    expect(results.map((r) => r.limited)).toEqual([false, false, false, true, true]);
    expect(results[0].remaining).toBe(2);
    expect(results[4].remaining).toBe(0);
  });

  it("resets in the next window", async () => {
    const store = memoryStore();
    for (let i = 0; i < 4; i++) await checkRateLimit(opts, store, 0);
    expect((await checkRateLimit(opts, store, 59_999)).limited).toBe(true);
    expect((await checkRateLimit(opts, store, 60_000)).limited).toBe(false);
  });

  it("keeps keys and buckets separate", async () => {
    const store = memoryStore();
    for (let i = 0; i < 4; i++) await checkRateLimit(opts, store, 0);
    expect((await checkRateLimit({ ...opts, key: "198.51.100.1" }, store, 0)).limited).toBe(false);
    expect((await checkRateLimit({ ...opts, bucket: "application-submit" }, store, 0)).limited).toBe(false);
  });

  it("fails open by default and closed when asked", async () => {
    expect((await checkRateLimit(opts, failingStore, 0)).limited).toBe(false);
    expect((await checkRateLimit({ ...opts, failOpen: false }, failingStore, 0)).limited).toBe(true);
  });
});

describe("rateLimitDocId", () => {
  it("hashes the key (no raw IPs/emails in doc ids) and is stable", () => {
    const a = rateLimitDocId("lead-email", "user@example.com", 3600000);
    expect(a).toBe(rateLimitDocId("lead-email", "user@example.com", 3600000));
    expect(a).not.toContain("user@example.com");
    expect(a.startsWith("lead-email_")).toBe(true);
    expect(a.endsWith("_3600000")).toBe(true);
  });

  it("sanitises the bucket", () => {
    expect(rateLimitDocId("a/b c", "k", 0).startsWith("a-b-c_")).toBe(true);
  });
});

describe("windowStartFor", () => {
  it("floors to the window", () => {
    expect(windowStartFor(125_000, 60_000)).toBe(120_000);
  });
});
