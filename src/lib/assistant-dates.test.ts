import { describe, it, expect } from "vitest";
import { findExistingLead, resolveDate, resolveTime } from "@/lib/assistant-logic";

describe("assistant dates are real dates (Detroit)", () => {
  const today = "2026-09-26"; // a Saturday
  it("keeps YYYY-MM-DD, resolves words, refuses the rest", () => {
    expect(resolveDate("2026-10-02", today)).toBe("2026-10-02");
    expect(resolveDate("", today)).toBe("");
    expect(resolveDate("today", today)).toBe(today);
    expect(resolveDate("Tomorrow", today)).toBe("2026-09-27");
    expect(resolveDate("Friday", today)).toBe("2026-10-02");
    expect(resolveDate("this fri", today)).toBe("2026-10-02");
    expect(resolveDate("saturday", today)).toBe("2026-10-03"); // the next one, not today
    expect(resolveDate("next week", today)).toBe("2026-10-03");
    expect(resolveDate("in 3 days", today)).toBe("2026-09-29");
    expect(resolveDate("10/2", today)).toBe("2026-10-02");
    expect(resolveDate("1/5", today)).toBe("2027-01-05");
    expect(resolveDate("10/2/26", today)).toBe("2026-10-02");
    expect(resolveDate("next Friday", today)).toBeNull();
    expect(resolveDate("sometime soon", today)).toBeNull();
    expect(resolveDate("2026-02-30", today)).toBeNull();
  });
  it("times", () => {
    expect(resolveTime("")).toBe("");
    expect(resolveTime("14:30")).toBe("14:30");
    expect(resolveTime("2pm")).toBe("14:00");
    expect(resolveTime("2:30 p.m.")).toBe("14:30");
    expect(resolveTime("12 am")).toBe("00:00");
    expect(resolveTime("14")).toBeNull();
    expect(resolveTime("25:00")).toBeNull();
  });
});

describe("findExistingLead", () => {
  const all = [
    { id: "a", name: "Pat", phone: "1 (231) 555-0123", email: "" },
    { id: "b", name: "Sam", phone: "", email: "Sam@Example.com" },
  ];
  it("matches the last 10 phone digits or the email", () => {
    expect(findExistingLead(all, { phone: "231.555.0123" })).toEqual({ id: "a", name: "Pat", match: "phone" });
    expect(findExistingLead(all, { email: "sam@example.com " })).toEqual({ id: "b", name: "Sam", match: "email" });
    expect(findExistingLead(all, { phone: "231-555-9999", email: "x@y.z" })).toBeNull();
  });
});
