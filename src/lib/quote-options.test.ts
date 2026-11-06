import { describe, expect, it } from "vitest";
import {
  cleanOptionLabel,
  closesOnOtherAccept,
  nextOptionLabel,
  optionCopyOf,
  optionGroupQuotes,
  optionLabelOf,
  optionSiblings,
} from "@/lib/quote-options";

describe("nextOptionLabel", () => {
  it("starts at A and takes the first free letter", () => {
    expect(nextOptionLabel([])).toBe("Option A");
    expect(nextOptionLabel(["Option A"])).toBe("Option B");
    expect(nextOptionLabel(["Option A", "Option C"])).toBe("Option B");
  });
  it("counts hand-typed labels by their letter", () => {
    expect(nextOptionLabel(["Option A: 1-1/4 in", "option b - 2 in"])).toBe("Option C");
    expect(nextOptionLabel(["Cheaper one", undefined])).toBe("Option A");
  });
});

describe("cleanOptionLabel", () => {
  it("trims, squeezes spaces and caps the length", () => {
    expect(cleanOptionLabel("  Option B:   2 in  ")).toBe("Option B: 2 in");
    expect(cleanOptionLabel("x".repeat(100))).toHaveLength(60);
    expect(cleanOptionLabel(undefined)).toBe("");
  });
});

describe("option groups", () => {
  const a = { id: "a", optionGroup: "a", optionLabel: "Option A", createdAt: "2026-11-01" };
  const b = { id: "b", optionGroup: "a", optionLabel: "Option B", createdAt: "2026-11-02" };
  const other = { id: "o", createdAt: "2026-10-01" };
  const otherGroup = { id: "x", optionGroup: "x", optionLabel: "Option A", createdAt: "2026-11-03" };
  const all = [b, other, otherGroup, a];

  it("finds the other options in the same group only", () => {
    expect(optionSiblings(a, all).map((q) => q.id)).toEqual(["b"]);
    expect(optionSiblings(b, all).map((q) => q.id)).toEqual(["a"]);
    expect(optionSiblings(other, all)).toEqual([]);
  });
  it("lists the whole group oldest first", () => {
    expect(optionGroupQuotes(b, all).map((q) => q.id)).toEqual(["a", "b"]);
    expect(optionGroupQuotes(other, all).map((q) => q.id)).toEqual(["o"]);
  });
  it("labels only quotes in a group", () => {
    expect(optionLabelOf(b)).toBe("Option B");
    expect(optionLabelOf({ id: "z", optionLabel: "Option A" })).toBe("");
  });
});

describe("optionCopyOf", () => {
  it("copies the site and pricing, not the send or approval state", () => {
    const copy = optionCopyOf({
      name: "Pat",
      address: "1 Main St",
      quotedPrice: 3000,
      quoteLines: [{ description: "Bore", kind: "work", qty: 1, unitPrice: 3000 }],
      mapAnnotation: null,
      leadId: "L1",
      proposalId: "tok",
      estimateStatus: "sent",
      version: 2,
      sentAt: "2026-11-01",
      approvalStatus: "pending",
      boreOnDesignId: "d1",
      qboEstimateId: "q1",
    });
    expect(copy).toEqual({
      name: "Pat",
      address: "1 Main St",
      quotedPrice: 3000,
      quoteLines: [{ description: "Bore", kind: "work", qty: 1, unitPrice: 3000 }],
      mapAnnotation: null,
      leadId: "L1",
    });
  });
});

describe("closesOnOtherAccept", () => {
  it("closes options out with the customer, leaves drafts and accepted alone", () => {
    expect(closesOnOtherAccept("sent")).toBe(true);
    expect(closesOnOtherAccept("viewed")).toBe(true);
    expect(closesOnOtherAccept("declined")).toBe(true);
    expect(closesOnOtherAccept("draft")).toBe(false);
    expect(closesOnOtherAccept("accepted")).toBe(false);
    expect(closesOnOtherAccept(undefined)).toBe(false);
  });
});
