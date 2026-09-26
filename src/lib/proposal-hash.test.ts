import { describe, it, expect } from "vitest";
import { proposalContentHash } from "@/lib/proposal-hash";

const base = {
  customer: { name: "Pat", email: "p@x.com", phone: "1", address: "1 Main" },
  scopeText: "Bore 150 ft",
  terms: ["Net 30"],
  lines: [{ description: "Bore", kind: "work" as const, qty: 1, unitPrice: 4000 }],
  totals: { work: 4000, materials: 0, tax: 0, total: 4000 },
  annotation: null,
  version: 1,
  expiresAt: "2026-10-26T03:59:59.999Z",
};

describe("proposalContentHash", () => {
  it("is stable across key order and ignores email/phone", () => {
    const a = proposalContentHash(base);
    const b = proposalContentHash({ ...base, customer: { address: "1 Main", phone: "2", email: "q@y.com", name: "Pat" } });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it("changes with the price, terms or version", () => {
    const a = proposalContentHash(base);
    expect(proposalContentHash({ ...base, totals: { ...base.totals, total: 3999 } })).not.toBe(a);
    expect(proposalContentHash({ ...base, terms: ["Net 15"] })).not.toBe(a);
    expect(proposalContentHash({ ...base, version: 2 })).not.toBe(a);
  });
});
