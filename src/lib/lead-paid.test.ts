import { describe, expect, it } from "vitest";
import { isFinished, isUnpaid, leadSaveRules, sheetColumnsFromLead, type Lead } from "@/lib/leads";

const won = {
  stage: "won",
  contactEveryDays: 0,
  nextAction: "",
  nextActionAt: "",
  quote: { status: "accepted", total: 4200, version: 1 },
} as unknown as Parameters<typeof leadSaveRules>[0];

describe("paid in full", () => {
  it("finishes the lead: marks the job done and fills cash with the sale", () => {
    const { patch } = leadSaveRules(won, { paidAt: "2026-11-13" }, undefined, "2026-11-13");
    expect(patch.jobDoneAt).toBe("2026-11-13");
    expect(patch.saleAmount).toBe("4200");
    expect(patch.cashCollected).toBe("4200");
  });

  it("keeps a typed amount and an existing job-done date", () => {
    const { patch } = leadSaveRules(
      { ...won, jobDoneAt: "2026-11-01", saleAmount: "4,250" },
      { paidAt: "2026-11-13", cashCollected: "$4,000" },
      undefined,
      "2026-11-13"
    );
    expect(patch.jobDoneAt).toBeUndefined();
    expect(patch.cashCollected).toBe("$4,000");
  });

  it("leaving Won takes the paid mark back too", () => {
    const { patch } = leadSaveRules(
      { ...won, quote: undefined, jobDoneAt: "2026-11-01", paidAt: "2026-11-02" },
      { stage: "lost" },
      undefined,
      "2026-11-13"
    );
    expect(patch.paidAt).toBe("");
    expect(patch.jobDoneAt).toBe("");
  });

  it("lists: done-not-paid vs finished", () => {
    expect(isUnpaid({ stage: "won", jobDoneAt: "2026-11-01" })).toBe(true);
    expect(isUnpaid({ stage: "won", jobDoneAt: "2026-11-01", paidAt: "2026-11-02" })).toBe(false);
    expect(isFinished({ stage: "won", paidAt: "2026-11-02" })).toBe(true);
    expect(isFinished({ stage: "quoted", paidAt: "2026-11-02" })).toBe(false);
  });

  it("the marketing sheet shows the cash once paid", () => {
    const cols = sheetColumnsFromLead({
      id: "x",
      name: "Pat",
      stage: "won",
      jobDoneAt: "2026-11-01",
      paidAt: "2026-11-02",
      cashCollected: "4200.00",
      saleAmount: "4200.00",
    } as Lead);
    expect(cols.cash).toBe("4200.00");
  });
});
