import { describe, it, expect } from "vitest";
import {
  callPromptAfterSheet,
  isDue,
  isScheduleJobStep,
  isToSchedule,
  jobFromCalendarPatch,
  walkBookingPatch,
  type Lead,
} from "./leads";

const lead = (p: Partial<Lead>): Lead =>
  ({ id: "x", name: "", phone: "", email: "", address: "", serviceType: "", source: "phone", stage: "new", ...p }) as Lead;

describe("booking a site walk", () => {
  it("moves earlier stages to Walk scheduled and sets Draw the quote the business day after", () => {
    for (const stage of ["new", "attempted", "contacted"] as const) {
      expect(walkBookingPatch(lead({ stage }), "2026-11-12", "10:00")).toEqual({
        appointmentAt: "2026-11-12",
        appointmentTime: "10:00",
        stage: "walk_scheduled",
        nextAction: "Draw the quote",
        nextActionAt: "2026-11-13",
      });
    }
    // A Friday walk: Monday.
    expect(walkBookingPatch(lead({ stage: "contacted" }), "2026-11-13", "").nextActionAt).toBe("2026-11-16");
  });
  it("never moves a stage backwards", () => {
    expect(walkBookingPatch(lead({ stage: "walk_done" }), "2026-11-12", "").stage).toBeUndefined();
    for (const stage of ["quoted", "won", "nurture", "lost", "not_a_lead"] as const) {
      const p = walkBookingPatch(lead({ stage }), "2026-11-12", "");
      expect(p.stage).toBeUndefined();
      expect(p.nextAction).toBeUndefined();
      expect(p.appointmentAt).toBe("2026-11-12");
    }
  });
  it("the lead comes back on Due after the walk instead of going cold", () => {
    const booked = lead({ stage: "contacted", ...walkBookingPatch(lead({ stage: "contacted" }), "2026-11-12", "") });
    expect(booked.stage).toBe("walk_scheduled");
    expect(isDue(booked, "2026-11-10")).toBe(false); // walk ahead
    expect(isDue(booked, "2026-11-13")).toBe(true); // Draw the quote, the day after
    expect(isDue({ ...booked, stage: "walk_done" }, "2026-11-17")).toBe(true);
  });
});

describe("a Job from Add to calendar", () => {
  const ev = { id: "ev1", htmlLink: "https://calendar.google.com/x" };
  it("records the job on a won lead, like Schedule the job", () => {
    const won = lead({ stage: "won", nextAction: "Schedule the job", nextActionAt: "2026-11-01" });
    const p = jobFromCalendarPatch(won, { date: "2026-11-20", endDate: "2026-11-21", time: "" }, ev);
    expect(p).toEqual({
      jobScheduledAt: "2026-11-20",
      jobEndAt: "2026-11-21",
      jobEventId: "ev1",
      jobEventLink: "https://calendar.google.com/x",
      nextAction: "Job day",
      nextActionAt: "2026-11-20",
    });
    expect(isToSchedule({ ...won, ...p })).toBe(false);
  });
  it("a timed job has no last day", () => {
    const p = jobFromCalendarPatch(lead({ stage: "won" }), { date: "2026-11-20", endDate: "2026-11-21", time: "08:00" }, ev);
    expect(p?.jobEndAt).toBe("");
  });
  it("leaves a lead that already has its job, a done job and closed leads alone", () => {
    expect(jobFromCalendarPatch(lead({ stage: "won", jobScheduledAt: "2026-11-10" }), { date: "2026-11-20" }, ev)).toBeNull();
    expect(jobFromCalendarPatch(lead({ stage: "won", jobDoneAt: "2026-11-01" }), { date: "2026-11-20" }, ev)).toBeNull();
    expect(jobFromCalendarPatch(lead({ stage: "lost" }), { date: "2026-11-20" }, ev)).toBeNull();
    expect(jobFromCalendarPatch(lead({ stage: "won" }), { date: "2026-11-20" }, {})).toBeNull();
  });
  it("records the date (not Job day) on a lead that isn't won yet", () => {
    const p = jobFromCalendarPatch(lead({ stage: "quoted" }), { date: "2026-11-20" }, ev);
    expect(p).toMatchObject({ jobScheduledAt: "2026-11-20", jobEventId: "ev1" });
    expect(p?.nextAction).toBeUndefined();
  });
});

describe("Schedule the job step", () => {
  it("is the won, unscheduled job's 'Schedule the job' (Done isn't offered)", () => {
    expect(isScheduleJobStep(lead({ stage: "won", nextAction: "Schedule the job" }))).toBe(true);
    expect(isScheduleJobStep(lead({ stage: "won", nextAction: "Job day", jobScheduledAt: "2026-11-20" }))).toBe(false);
    expect(isScheduleJobStep(lead({ stage: "won", nextAction: "Call about the deposit" }))).toBe(false);
    expect(isScheduleJobStep(lead({ stage: "quoted", nextAction: "Schedule the job" }))).toBe(false);
  });
});

describe("Log that call?", () => {
  it("asks after the Call window closes without a logged call", () => {
    expect(callPromptAfterSheet(null, "a", false)).toBe("a");
    expect(callPromptAfterSheet("b", "a", false)).toBe("a");
  });
  it("a call logged in the window needs no prompt", () => {
    expect(callPromptAfterSheet(null, "a", true)).toBeNull();
    expect(callPromptAfterSheet("a", "a", true)).toBeNull();
    expect(callPromptAfterSheet("b", "a", true)).toBe("b");
  });
});
