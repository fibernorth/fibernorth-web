import { describe, it, expect } from "vitest";
import {
  contactPatch,
  directionsUrl,
  formatLogForSheet,
  isDue,
  isToSchedule,
  leadSavePatch,
  localDateOf,
  nurturePatch,
  parseMoney,
  quickNextDates,
  sheetColumnsFromLead,
  smsUrl,
  todayISO,
  todaySummary,
  NURTURE_EVERY_DAYS,
  type Lead,
} from "./leads";

const lead = (p: Partial<Lead>): Lead =>
  ({ id: "x", name: "", phone: "", email: "", address: "", serviceType: "", source: "phone", stage: "new", ...p }) as Lead;

describe("Detroit time", () => {
  it("todayISO is the Michigan date, not UTC, after 8pm", () => {
    // 9:30pm EDT on Sept 25 is 01:30 UTC on Sept 26.
    expect(todayISO(new Date("2026-09-26T01:30:00Z"))).toBe("2026-09-25");
    expect(todayISO(new Date("2026-09-26T04:30:00Z"))).toBe("2026-09-26");
    // Winter (EST, UTC-5)
    expect(todayISO(new Date("2026-12-10T04:59:00Z"))).toBe("2026-12-09");
    expect(todayISO(new Date("2026-12-10T05:00:00Z"))).toBe("2026-12-10");
  });

  it("an evening call gets that day's date as last contact", () => {
    const p = contactPatch(lead({}), { ts: "2026-09-26T00:15:00.000Z", type: "call", text: "talked" }, "2026-09-25");
    expect(p.lastContactAt).toBe("2026-09-25");
  });

  it("the sheet note carries the Michigan date", () => {
    expect(formatLogForSheet({ ts: "2026-09-26T01:00:00.000Z", type: "call", text: "left vm" })).toBe("9/25 Call: left vm");
    expect(formatLogForSheet({ ts: "2026-09-25T15:00:00.000Z", type: "attempt", text: "No answer" })).toBe("9/25 Call: No answer");
    expect(localDateOf("not a date")).toBe("not a date".slice(0, 10));
  });
});

describe("isDue", () => {
  const today = "2026-09-25";
  it("keeps the old rules for open leads", () => {
    expect(isDue(lead({ stage: "new" }), today)).toBe(true);
    expect(isDue(lead({ stage: "contacted" }), today)).toBe(false);
    expect(isDue(lead({ stage: "quoted", nextActionAt: "2026-09-24" }), today)).toBe(true);
    expect(isDue(lead({ stage: "quoted", nextActionAt: "2026-09-26" }), today)).toBe(false);
  });
  it("brings long-term leads back when their check-back comes", () => {
    expect(isDue(lead({ stage: "nurture", nextActionAt: "2026-09-25" }), today)).toBe(true);
    expect(isDue(lead({ stage: "nurture", nextActionAt: "2026-11-01" }), today)).toBe(false);
    expect(isDue(lead({ stage: "nurture" }), today)).toBe(false);
  });
  it("shows won jobs that still need scheduling", () => {
    const won = lead({ stage: "won", nextAction: "Schedule the job", nextActionAt: "2026-09-20" });
    expect(isDue(won, today)).toBe(true);
    expect(isToSchedule(won)).toBe(true);
    expect(isDue(lead({ stage: "won", nextAction: "Schedule the job" }), today)).toBe(true);
    expect(isDue(lead({ stage: "won", nextAction: "", nextActionAt: "" }), today)).toBe(false);
    expect(isToSchedule(lead({ stage: "won" }))).toBe(false);
  });
  it("never shows closed-out leads", () => {
    expect(isDue(lead({ stage: "lost", nextActionAt: "2026-09-01", nextAction: "x" }), today)).toBe(false);
    expect(isDue(lead({ stage: "not_a_lead", nextActionAt: "2026-09-01" }), today)).toBe(false);
  });
});

describe("nurturePatch", () => {
  it("sets a 45 day cadence and a check-back date", () => {
    expect(nurturePatch({}, "2026-09-25")).toEqual({
      contactEveryDays: NURTURE_EVERY_DAYS,
      nextAction: "Check back",
      nextActionAt: "2026-11-09",
    });
  });
  it("keeps an existing cadence and a future next action", () => {
    expect(nurturePatch({ contactEveryDays: 90, nextAction: "Call in spring", nextActionAt: "2027-03-01" }, "2026-09-25")).toEqual({});
    expect(nurturePatch({ contactEveryDays: 30, nextActionAt: "2026-09-01" }, "2026-09-25")).toEqual({
      nextAction: "Check back",
      nextActionAt: "2026-10-25",
    });
  });
});

describe("leadSavePatch (decided on the server against the fresh lead)", () => {
  const today = "2026-09-25";
  const call = { ts: "2026-09-25T15:00:00.000Z", type: "call" as const, text: "talked" };
  it("moves new -> contacted only when the lead is still new", () => {
    expect(leadSavePatch({ stage: "new" }, {}, call, today).stage).toBe("contacted");
    // The card still showed "new" but a customer already accepted: stays won.
    expect(leadSavePatch({ stage: "won" }, {}, call, today).stage).toBeUndefined();
  });
  it("a no-answer attempt is not a conversation", () => {
    const p = leadSavePatch({ stage: "new" }, {}, { ts: call.ts, type: "attempt", text: "No answer" }, today);
    expect(p.stage).toBeUndefined();
    expect(p.lastContactAt).toBeUndefined();
    expect(sheetColumnsFromLead(lead({ stage: "new", activity: [{ ts: call.ts, type: "attempt", text: "x" }] })).answered).toBe("");
  });
  it("adds Long term defaults when moving to nurture", () => {
    const p = leadSavePatch({ stage: "contacted" }, { stage: "nurture" }, undefined, today);
    expect(p).toMatchObject({ stage: "nurture", contactEveryDays: 45, nextAction: "Check back", nextActionAt: "2026-11-09" });
    expect(leadSavePatch({ stage: "nurture" }, { stage: "nurture" }, undefined, today).contactEveryDays).toBeUndefined();
  });
  it("stores the sale amount as a number too, keeping the text", () => {
    const p = leadSavePatch({ stage: "won" }, { saleAmount: "$4,250" }, undefined, today);
    expect(p.saleAmount).toBe("$4,250");
    expect(p.saleAmountNum).toBe(4250);
    expect(leadSavePatch({ stage: "won" }, { saleAmount: "" }, undefined, today).saleAmountNum).toBeNull();
    expect(leadSavePatch({ stage: "won" }, { notes: "x" }, undefined, today)).not.toHaveProperty("saleAmountNum");
  });
});

describe("parseMoney", () => {
  it("reads what people type", () => {
    expect(parseMoney("$4,250")).toBe(4250);
    expect(parseMoney("4250.5")).toBe(4250.5);
    expect(parseMoney("12k")).toBe(12000);
    expect(parseMoney(" $ 3,000.00 ")).toBe(3000);
    expect(parseMoney(1500)).toBe(1500);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("about 4 grand")).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
  });
});

describe("quickNextDates", () => {
  it("Tomorrow, Fri, Next wk, 2 wks", () => {
    // 2026-09-25 is a Friday: "Fri" means next Friday.
    expect(quickNextDates("2026-09-25")).toEqual([
      { label: "Tomorrow", date: "2026-09-26" },
      { label: "Fri", date: "2026-10-02" },
      { label: "Next wk", date: "2026-10-02" },
      { label: "2 wks", date: "2026-10-09" },
    ]);
    // Monday -> this Friday
    expect(quickNextDates("2026-09-28")[1]).toEqual({ label: "Fri", date: "2026-10-02" });
  });
});

describe("todaySummary", () => {
  it("walks today by time, new since yesterday, quotes opened or accepted", () => {
    const today = "2026-09-25";
    const s = todaySummary(
      [
        lead({ id: "a", name: "A", appointmentAt: today, appointmentTime: "14:00", stage: "walk_scheduled" }),
        lead({ id: "b", name: "B", appointmentAt: today, appointmentTime: "09:00", stage: "walk_scheduled" }),
        lead({ id: "c", name: "C", appointmentAt: today, stage: "not_a_lead" }),
        lead({ id: "n", name: "N", stage: "new", createdAt: "2026-09-24T20:00:00.000Z" }),
        lead({ id: "old", name: "Old", stage: "new", createdAt: "2026-09-20T20:00:00.000Z" }),
        lead({ id: "v", name: "V", stage: "quoted", nextActionAt: "2026-10-01", quote: { status: "viewed", total: 1, version: 1, viewedAt: "2026-09-24T12:00:00.000Z" } }),
        lead({
          id: "w",
          name: "W",
          stage: "won",
          nextAction: "Schedule the job",
          nextActionAt: today,
          activity: [{ ts: "2026-09-25T13:00:00.000Z", type: "quote", text: 'Customer ACCEPTED quote v1 (signed "W")' }],
        }),
      ],
      today
    );
    expect(s.walks.map((l) => l.id)).toEqual(["b", "a"]);
    expect(s.newLeads.map((l) => l.id)).toEqual(["n"]);
    expect(s.quotes).toEqual([
      { lead: expect.objectContaining({ id: "v" }), what: "opened" },
      { lead: expect.objectContaining({ id: "w" }), what: "accepted" },
    ]);
    expect(s.due).toBe(3); // n, old (new, no date) and w (to schedule)
  });
});

describe("links", () => {
  it("builds tel/sms/maps links", () => {
    expect(smsUrl("(231) 944-6471")).toBe("sms:2319446471");
    expect(smsUrl("231-944-6471", "Hi there")).toBe("sms:2319446471?&body=Hi%20there");
    expect(directionsUrl("5555 M-72 East, Williamsburg, MI")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=5555%20M-72%20East%2C%20Williamsburg%2C%20MI"
    );
  });
});
