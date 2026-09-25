import { describe, it, expect } from "vitest";
import { eventTimes } from "./calendar-event";

describe("eventTimes", () => {
  it("timed walks clear the all-day date field", () => {
    expect(eventTimes("2026-09-25", "10:30")).toEqual({
      start: { dateTime: "2026-09-25T10:30:00", timeZone: "America/Detroit", date: null },
      end: { dateTime: "2026-09-25T11:30:00", timeZone: "America/Detroit", date: null },
    });
  });
  it("all-day walks clear dateTime and use an exclusive end date", () => {
    expect(eventTimes("2026-09-30", "")).toEqual({
      start: { date: "2026-09-30", dateTime: null, timeZone: null },
      end: { date: "2026-10-01", dateTime: null, timeZone: null },
    });
  });
  it("a 23:xx walk ends the next day", () => {
    const t = eventTimes("2026-12-31", "23:15");
    expect(t.end.dateTime).toBe("2027-01-01T00:15:00");
    expect(t.start.dateTime).toBe("2026-12-31T23:15:00");
  });
  it("a bad time falls back to all day", () => {
    expect(eventTimes("2026-09-25", "9am").start.date).toBe("2026-09-25");
  });
});
