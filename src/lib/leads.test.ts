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
