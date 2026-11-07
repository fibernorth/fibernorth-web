import { describe, it, expect } from "vitest";
import { countByStage, earnedOnDone, LEAD_STAGES, saleNoteText } from "./leads";
import { writeBackSet } from "./sheet-sync";

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
  it("count as converted, with the sale from the quote; Cash Collected stays blank until typed", async () => {
    const { sheetColumnsFromLead } = await import("./leads");
    const cols = sheetColumnsFromLead({ id: "x", name: "Ian", stage: "won", jobDoneAt: "2026-10-20", quote: { status: "accepted", total: 4200, version: 1 } } as any);
    expect(cols).toMatchObject({ converted: "Yes", sale: "4200", cash: "" });
    // Typed cash (a real payment) goes on the sheet.
    const typed = sheetColumnsFromLead({ id: "x", name: "Ian", stage: "won", jobDoneAt: "2026-10-20", cashCollected: "2000", quote: { status: "accepted", total: 4200, version: 1 } } as any);
    expect(typed.cash).toBe("2000");
  });

  it("a cash cell the sync already wrote for a done job is left on the sheet", () => {
    const blank = { notes: "", answered: "", booked: "", taken: "", converted: "", objection: "", cash: "", sale: "" };
    const lead = {
      id: "x",
      name: "Ian",
      stage: "won",
      jobDoneAt: "2026-10-20",
      quote: { status: "accepted", total: 4200, version: 1 },
      sheetOwned: { cash: { value: "4200", at: "2026-10-21T00:00:00Z" } },
    } as any;
    expect(writeBackSet(lead, { ...blank, converted: "Yes", sale: "4200", cash: "4200" }).cash).toBeUndefined();
  });
});

describe("earnedOnDone", () => {
  it("fills a blank sale from the quote, never cash collected", () => {
    expect(earnedOnDone({ quote: { status: "accepted", total: 4200, version: 1 } })).toEqual({ saleAmount: "4200" });
    expect(earnedOnDone({ saleAmount: "3500", quote: { status: "accepted", total: 4200, version: 1 } })).toEqual({});
    expect(earnedOnDone({})).toEqual({});
  });
});

describe("saleNoteText", () => {
  it("never doubles the dollar sign", () => {
    expect(saleNoteText("4250")).toBe("$4,250");
    expect(saleNoteText("$4,250")).toBe("$4,250");
    expect(saleNoteText("$$4250.5")).toBe("$4,250.50");
    expect(saleNoteText("4.2k")).toBe("$4,200");
    expect(saleNoteText("$ about 4k plus extras")).toBe("$about 4k plus extras");
    expect(saleNoteText("")).toBe("");
    expect(saleNoteText(undefined)).toBe("");
  });
});
