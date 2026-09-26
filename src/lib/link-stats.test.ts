import { describe, it, expect } from "vitest";
import { detroitDayStartIso, lastDays, rekeyDays, sumLastDays, visitDayKey } from "./link-stats";

describe("link-stats day keys", () => {
  it("keys an evening visit on its Detroit day", () => {
    // 9:30pm Detroit on Sept 25 is Sept 26 in UTC.
    expect(visitDayKey(new Date("2026-09-26T01:30:00Z"))).toBe("2026-09-25");
  });
  it("sums the last 7 Detroit days", () => {
    expect(lastDays("2026-09-03", 3)).toEqual(["2026-09-03", "2026-09-02", "2026-09-01"]);
    const days = { "2026-09-26": 2, "2026-09-20": 1, "2026-09-19": 5, "2026-09-27": 9 };
    expect(sumLastDays(days, "2026-09-26", 7)).toBe(3);
    expect(sumLastDays(undefined, "2026-09-26")).toBe(0);
  });
  it("finds Detroit midnight in summer and winter", () => {
    expect(detroitDayStartIso("2026-09-26")).toBe("2026-09-26T04:00:00.000Z");
    expect(detroitDayStartIso("2026-12-01")).toBe("2026-12-01T05:00:00.000Z");
  });
  it("rebuilds day keys from the visit log, keeping days before it", () => {
    const days = { "2026-09-01": 4, "2026-09-10": 1, "2026-09-11": 2 };
    const visits = [
      "2026-09-10T15:00:00Z", // first logged day: may be partial, keep the counter
      "2026-09-11T01:30:00Z", // 9:30pm on the 10th in Detroit (was keyed the 11th in UTC)
      "2026-09-11T14:00:00Z",
      "bad",
    ];
    expect(rekeyDays(days, visits)).toEqual({ "2026-09-01": 4, "2026-09-10": 1, "2026-09-11": 1 });
    expect(rekeyDays(days, [])).toEqual(days);
  });
});
