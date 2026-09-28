import { describe, it, expect } from "vitest";
import { addBusinessDays, businessDaysBetween, holidaysOf, isBusinessDay, isPastDue, nextBusinessDay } from "./business-days";

describe("business days", () => {
  it("knows the holidays, with weekend ones observed", () => {
    expect([...holidaysOf(2026)].sort()).toEqual([
      "2026-01-01",
      "2026-05-25",
      "2026-07-03", // July 4 is a Saturday
      "2026-09-07",
      "2026-11-26",
      "2026-11-27",
      "2026-12-25",
    ]);
    expect(holidaysOf(2027).has("2027-12-24")).toBe(true); // Christmas on Saturday
    expect(holidaysOf(2027).has("2027-12-31")).toBe(true); // New Year's 2028 on Saturday
  });
  it("skips weekends and holidays", () => {
    expect(isBusinessDay("2026-09-26")).toBe(false); // Saturday
    expect(isBusinessDay("2026-09-07")).toBe(false); // Labor Day
    expect(nextBusinessDay("2026-09-05")).toBe("2026-09-08");
    expect(addBusinessDays("2026-09-25", 1)).toBe("2026-09-28");
    expect(addBusinessDays("2026-11-25", 1)).toBe("2026-11-30"); // over Thanksgiving
    expect(addBusinessDays("2026-09-26", 0)).toBe("2026-09-28");
    expect(businessDaysBetween("2026-09-25", "2026-09-28")).toBe(1);
    expect(businessDaysBetween("2026-09-28", "2026-09-25")).toBe(-1);
  });
  it("never overdue because of a weekend or holiday", () => {
    expect(isPastDue("2026-09-25", "2026-09-28")).toBe(true); // Friday's call, missed
    expect(isPastDue("2026-09-26", "2026-09-28")).toBe(false); // due Saturday: Monday is fine
    expect(isPastDue("2026-09-26", "2026-09-29")).toBe(true);
    expect(isPastDue("2026-09-04", "2026-09-08")).toBe(true);
    expect(isPastDue("2026-09-05", "2026-09-08")).toBe(false); // Sat before Labor Day
  });
});
