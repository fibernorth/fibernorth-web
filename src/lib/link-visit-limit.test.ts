import { describe, expect, it } from "vitest";
import { checkRateLimit, type RateLimitOptions, type RateLimitStore } from "./rate-limit";
import {
  VISIT_LIMIT_PER_IP_PER_HOUR,
  VISIT_LOG_LIMIT_PER_DAY,
  visitCountAllowed,
  visitLimits,
  visitLogAllowed,
} from "./link-visit-limit";

function memoryLimiter(now = Date.UTC(2026, 8, 26, 12)) {
  const counts = new Map<string, number>();
  const store: RateLimitStore = {
    async hit(docId) {
      const n = (counts.get(docId) ?? 0) + 1;
      counts.set(docId, n);
      return n;
    },
  };
  return (opts: RateLimitOptions) => checkRateLimit(opts, store, now);
}

describe("visitCountAllowed", () => {
  it("allows the first N visits from an IP per hour, then stops counting", async () => {
    const limiter = memoryLimiter();
    const results: boolean[] = [];
    for (let i = 0; i < VISIT_LIMIT_PER_IP_PER_HOUR + 5; i++) {
      results.push(await visitCountAllowed("camp", "203.0.113.9", limiter));
    }
    expect(results.filter(Boolean)).toHaveLength(VISIT_LIMIT_PER_IP_PER_HOUR);
    expect(results.slice(VISIT_LIMIT_PER_IP_PER_HOUR).every((r) => !r)).toBe(true);
  });

  it("tracks IPs and links separately", async () => {
    const limiter = memoryLimiter();
    for (let i = 0; i < VISIT_LIMIT_PER_IP_PER_HOUR; i++) await visitCountAllowed("camp", "203.0.113.9", limiter);
    expect(await visitCountAllowed("camp", "203.0.113.9", limiter)).toBe(false);
    expect(await visitCountAllowed("camp", "198.51.100.1", limiter)).toBe(true);
    expect(await visitCountAllowed("pros", "203.0.113.9", limiter)).toBe(true);
  });

  it("fails open when the limiter store errors", async () => {
    const store: RateLimitStore = { hit: async () => { throw new Error("down"); } };
    const limiter = (opts: RateLimitOptions) => checkRateLimit(opts, store);
    expect(await visitCountAllowed("camp", "203.0.113.9", limiter)).toBe(true);
  });
});

describe("visitLimits", () => {
  it("stops counting and logging past the per-IP cap", async () => {
    const limiter = memoryLimiter();
    for (let i = 0; i < VISIT_LIMIT_PER_IP_PER_HOUR; i++) {
      expect(await visitLimits("camp", "203.0.113.9", limiter)).toEqual({ count: true, log: true });
    }
    expect(await visitLimits("camp", "203.0.113.9", limiter)).toEqual({ count: false, log: false });
  });

  it("fails open when the limiter hangs", async () => {
    const hang = () => new Promise<never>(() => {});
    expect(await visitLimits("camp", "203.0.113.9", hang, 10)).toEqual({ count: true, log: true });
  });
});

describe("visitLogAllowed", () => {
  it("caps the per-visit log per link per day", async () => {
    const limiter = memoryLimiter();
    let allowed = 0;
    for (let i = 0; i < VISIT_LOG_LIMIT_PER_DAY + 10; i++) if (await visitLogAllowed("pros", limiter)) allowed++;
    expect(allowed).toBe(VISIT_LOG_LIMIT_PER_DAY);
  });
});
