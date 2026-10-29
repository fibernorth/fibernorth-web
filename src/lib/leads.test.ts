import { describe, it, expect } from "vitest";
import { countByStage, LEAD_STAGES } from "./leads";

describe("countByStage", () => {
  it("counts every stage, including the empty ones, and ignores junk", () => {
    const c = countByStage([{ stage: "new" }, { stage: "new" }, { stage: "won" }, { stage: "bogus" }, {}]);
    expect(c.new).toBe(2);
    expect(c.won).toBe(1);
    expect(c.lost).toBe(0);
    expect(Object.keys(c)).toEqual([...LEAD_STAGES]);
  });
});

describe("done jobs on the marketing sheet", () => {
  it("count as converted, with the sale and cash from the quote", async () => {
    const { sheetColumnsFromLead } = await import("./leads");
    const cols = sheetColumnsFromLead({ id: "x", name: "Ian", stage: "won", jobDoneAt: "2026-10-20", quote: { status: "accepted", total: 4200, version: 1 } } as any);
    expect(cols).toMatchObject({ converted: "Yes", sale: "4200", cash: "4200" });
  });
});
