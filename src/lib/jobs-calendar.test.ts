import { describe, it, expect, vi } from "vitest";
vi.mock("@/services/firebase-admin", () => ({ initializeAdminApp: () => ({}) }));
import { pickJobsCalendar, type CalendarInfo } from "./google-calendar";

const cal = (id: string, name: string, primary = false): CalendarInfo => ({ id, name, primary, color: "", canWrite: true });

describe("pickJobsCalendar", () => {
  const list = [cal("admin@fibernorth.com", "admin@fibernorth.com", true), cal("abc@group.calendar.google.com", "FiberNorth Jobs"), cal("x", "Holidays")];
  it("finds the FiberNorth Jobs calendar by name", () => {
    expect(pickJobsCalendar(list)?.id).toBe("abc@group.calendar.google.com");
  });
  it("a saved choice wins", () => {
    expect(pickJobsCalendar(list, "x")?.id).toBe("x");
  });
  it("nothing that looks like jobs: null", () => {
    expect(pickJobsCalendar([list[0], list[2]])).toBeNull();
  });
});
