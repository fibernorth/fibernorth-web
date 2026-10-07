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
  followUpOf,
  isStale,
  isForwardStage,
  NURTURE_EVERY_DAYS,
  type Lead,
  type LeadActivity,
} from "./leads";
import { mergedStage } from "./lead-merge";

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
  it("never lists a finished job, even with a next action left on it", () => {
    const today = "2026-10-07";
    const done = lead({ stage: "won", nextAction: "Ask for a review", nextActionAt: "2026-10-01", jobDoneAt: "2026-09-30" });
    expect(isDue(done, today)).toBe(false);
    expect(isDue({ ...done, jobDoneAt: undefined }, today)).toBe(true);
  });

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
    // Job done: never on Due (Bill), and not "to schedule".
    const done = lead({ stage: "won", jobDoneAt: "2026-09-18", nextAction: "Ask for Google review", nextActionAt: "2026-09-20" });
    expect(isDue(done, today)).toBe(false);
    expect(isToSchedule(done)).toBe(false);
  });
  it("never shows closed-out leads", () => {
    expect(isDue(lead({ stage: "lost", nextActionAt: "2026-09-01", nextAction: "x" }), today)).toBe(false);
    expect(isDue(lead({ stage: "not_a_lead", nextActionAt: "2026-09-01" }), today)).toBe(false);
  });
});

describe("followUpOf", () => {
  it("a contact on or after the follow-up date takes care of it (not overdue)", () => {
    // Stephen Fortin: Call back due 9/25, contacted today (9/28).
    const l = lead({ stage: "contacted", nextAction: "Call back", nextActionAt: "2026-09-25", lastContactAt: "2026-09-28" });
    expect(followUpOf(l)).toEqual({ action: "Check back", at: "2026-10-01", handled: true });
    expect(isDue(l, "2026-09-28")).toBe(false);
    expect(isDue(l, "2026-10-01")).toBe(true);
    // Not contacted since: still overdue.
    const older = lead({ stage: "contacted", nextAction: "Call back", nextActionAt: "2026-09-25", lastContactAt: "2026-09-20" });
    expect(followUpOf(older)).toMatchObject({ action: "Call back", at: "2026-09-25", handled: false });
    expect(isDue(older, "2026-09-28")).toBe(true);
    // Won jobs keep "Schedule the job".
    const won = lead({ stage: "won", nextAction: "Schedule the job", nextActionAt: "2026-09-25", lastContactAt: "2026-09-28" });
    expect(followUpOf(won).handled).toBe(false);
    expect(isDue(won, "2026-09-28")).toBe(true);
  });
});

describe("status-aware follow-up", () => {
  const today = "2026-09-29";
  it("a booked site walk is the next contact: not due or overdue before it", () => {
    const l = lead({ stage: "walk_scheduled", nextAction: "Call back", nextActionAt: "2026-09-25", appointmentAt: "2026-10-02", contactEveryDays: 3, lastContactAt: "2026-09-10" });
    expect(followUpOf(l, today)).toMatchObject({ action: "Site walk", at: "2026-10-02" });
    expect(isDue(l, today)).toBe(false);
    expect(isStale(l, today)).toBe(false);
    expect(isDue(l, "2026-10-02")).toBe(true); // walk day
  });
  it("keeps a step Bill set for before the walk", () => {
    const l = lead({ stage: "walk_scheduled", nextAction: "Confirm walk", nextActionAt: "2026-10-01", appointmentAt: "2026-10-02" });
    expect(followUpOf(l, today)).toMatchObject({ action: "Confirm walk", at: "2026-10-01" });
  });
  it("a past walk doesn't hide an overdue follow-up", () => {
    const l = lead({ stage: "walk_done", nextAction: "Send quote", nextActionAt: "2026-09-25", appointmentAt: "2026-09-24" });
    expect(isDue(l, today)).toBe(true);
  });
  it("lost and not-a-lead are never due or stale", () => {
    for (const stage of ["lost", "not_a_lead"] as const) {
      const l = lead({ stage, nextAction: "Call back", nextActionAt: "2026-09-25", contactEveryDays: 3 });
      expect(isDue(l, today)).toBe(false);
      expect(isStale(l, today)).toBe(false);
    }
  });
});

describe("scheduled jobs", () => {
  it("a won job on the jobs calendar drops off To schedule", () => {
    const l = lead({ stage: "won", nextAction: "Schedule the job", nextActionAt: "2026-09-25" });
    expect(isToSchedule(l)).toBe(true);
    expect(isToSchedule({ ...l, nextAction: "Job day", jobScheduledAt: "2026-10-06" })).toBe(false);
  });
});

describe("nurturePatch", () => {
  it("sets a 30 business day cadence and a check-back date", () => {
    expect(nurturePatch({}, "2026-09-25")).toEqual({
      contactEveryDays: NURTURE_EVERY_DAYS,
      nextAction: "Check back",
      nextActionAt: "2026-11-06",
    });
  });
  it("keeps an existing cadence and a future next action", () => {
    expect(nurturePatch({ contactEveryDays: 90, nextAction: "Call in spring", nextActionAt: "2027-03-01" }, "2026-09-25")).toEqual({});
    expect(nurturePatch({ contactEveryDays: 30, nextActionAt: "2026-09-01" }, "2026-09-25")).toEqual({
      nextAction: "Check back",
      nextActionAt: "2026-11-06",
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
  it("a no-answer attempt is not a conversation: New -> New (tried to contact)", () => {
    const p = leadSavePatch({ stage: "new" }, {}, { ts: call.ts, type: "attempt", text: "No answer" }, today);
    expect(p.stage).toBe("attempted");
    expect(p.lastContactAt).toBeUndefined();
    expect(sheetColumnsFromLead(lead({ stage: "new", activity: [{ ts: call.ts, type: "attempt", text: "x" }] })).answered).toBe("No");
  });
  it("Lead Answered is Yes only after a response, never from the stage alone", () => {
    const ans = (p: Partial<Lead>) => sheetColumnsFromLead(lead(p)).answered;
    const vm = { ts: call.ts, type: "attempt" as const, text: "No answer, left VM" };
    expect(ans({ stage: "new", activity: [] })).toBe("");
    expect(ans({ stage: "contacted", activity: [vm] })).toBe("No");
    expect(ans({ stage: "contacted", activity: [] })).toBe("");
    expect(ans({ stage: "quoted", activity: [vm, { ts: call.ts, type: "quote", text: "Quote sent" }] })).toBe("No");
    expect(ans({ stage: "contacted", activity: [{ ts: call.ts, type: "text", text: "Texted" }] })).toBe("No");
    expect(ans({ stage: "contacted", activity: [vm, call] })).toBe("Yes");
    expect(ans({ stage: "walk_scheduled", activity: [] })).toBe("Yes");
    expect(ans({ stage: "won", activity: [] })).toBe("Yes");
    expect(ans({ stage: "not_a_lead", activity: [vm] })).toBe("No");
    // Voicemails logged as calls are not conversations.
    for (const text of ["Left VM 9/22", "Left a message", "Called and left a voice mail.", "called wrong number", "No answer"]) {
      expect(ans({ stage: "contacted", activity: [{ ts: call.ts, type: "call", text }] })).toBe("No");
    }
    expect(ans({ stage: "contacted", activity: [{ ts: call.ts, type: "call", text: "Verbally told 3,000 for work" }] })).toBe("Yes");
  });
  it("adds Long term defaults when moving to nurture", () => {
    const p = leadSavePatch({ stage: "contacted" }, { stage: "nurture" }, undefined, today);
    expect(p).toMatchObject({ stage: "nurture", contactEveryDays: 30, nextAction: "Check back", nextActionAt: "2026-11-06" });
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
      { label: "Mon", date: "2026-09-28" },
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

  it("an acceptance that was undone, or followed by a new version, isn't shown as accepted", () => {
    const today = "2026-09-26";
    const accept = { ts: "2026-09-25T15:05:00.000Z", type: "quote" as const, text: 'Customer ACCEPTED quote v1 (signed "Bill Gaylord")' };
    const undone = { ts: "2026-09-25T15:35:00.000Z", type: "quote" as const, text: "Acceptance of quote v1 undone by bill@fibernorth.com (it was a test or a slip)" };
    const v2 = { ts: "2026-09-25T15:36:00.000Z", type: "quote" as const, text: "Quote v2 sent to x@example.com: $3,632.82" };
    const q = (activity: LeadActivity[]) => todaySummary([lead({ id: "b", stage: "quoted", activity })], today).quotes;
    expect(q([accept])).toEqual([{ lead: expect.objectContaining({ id: "b" }), what: "accepted" }]);
    expect(q([accept, undone])).toEqual([]);
    expect(q([v2, accept].reverse())).toEqual([]);
    // A later acceptance of the new version shows again.
    expect(q([accept, undone, v2, { ...accept, ts: "2026-09-26T12:00:00.000Z", text: "Customer ACCEPTED quote v2" }])).toHaveLength(1);
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

describe('"New (tried to contact)" (attempted)', () => {
  const today = "2026-09-25";
  const ts = "2026-09-25T15:00:00.000Z";
  const a = (type: LeadActivity["type"], text = "x"): LeadActivity => ({ ts, type, text });

  it("outreach without a conversation moves New -> attempted", () => {
    for (const t of ["attempt", "text", "email", "letter"] as const) {
      expect(leadSavePatch({ stage: "new" }, {}, a(t), today).stage).toBe("attempted");
    }
    // A call logged as a call whose note says nobody answered.
    expect(leadSavePatch({ stage: "new" }, {}, a("call", "left vm"), today).stage).toBe("attempted");
    // Texts and emails still count for the contact date.
    expect(leadSavePatch({ stage: "new" }, {}, a("text"), today).lastContactAt).toBe("2026-09-25");
  });

  it("notes, walk bookings, system and stage lines leave New alone", () => {
    for (const t of ["note", "walk_booked", "system", "stage", "quote"] as const) {
      expect(leadSavePatch({ stage: "new" }, {}, a(t), today).stage).toBeUndefined();
    }
  });

  it("a real conversation moves New or attempted -> contacted", () => {
    expect(leadSavePatch({ stage: "attempted" }, {}, a("call", "talked"), today).stage).toBe("contacted");
    expect(leadSavePatch({ stage: "attempted" }, {}, a("walk", "walked it"), today).stage).toBe("contacted");
    expect(leadSavePatch({ stage: "new" }, {}, a("call", "talked"), today).stage).toBe("contacted");
  });

  it("never moves backwards or out of a later stage", () => {
    expect(leadSavePatch({ stage: "attempted" }, {}, a("attempt"), today).stage).toBeUndefined();
    for (const s of ["contacted", "walk_scheduled", "walk_done", "quoted", "won", "nurture", "lost", "not_a_lead"]) {
      expect(leadSavePatch({ stage: s }, {}, a("attempt"), today).stage).toBeUndefined();
      expect(leadSavePatch({ stage: s }, {}, a("text"), today).stage).toBeUndefined();
    }
    // A stage Bill picks in the same save wins.
    expect(leadSavePatch({ stage: "new" }, { stage: "nurture" }, a("attempt"), today).stage).toBe("nurture");
  });

  it("ranks between New and Contacted (sheet sync forward moves, merges)", () => {
    expect(isForwardStage("new", "attempted")).toBe(true);
    expect(isForwardStage("attempted", "contacted")).toBe(true);
    expect(isForwardStage("attempted", "new")).toBe(false);
    expect(isForwardStage("contacted", "attempted")).toBe(false);
    expect(mergedStage("new", "attempted")).toBe("attempted");
    expect(mergedStage("attempted", "contacted")).toBe("contacted");
  });

  it("reads as not contacted on the marketing sheet", () => {
    const cols = sheetColumnsFromLead(lead({ stage: "attempted", activity: [a("attempt", "No answer")] }));
    expect(cols.answered).toBe("No");
    expect(cols.booked).toBe("");
    expect(cols.taken).toBe("");
    expect(cols.converted).toBe("");
  });

  it("stays on the Due list and Today's new leads like New", () => {
    expect(isDue({ stage: "attempted" }, today)).toBe(true);
    expect(isDue({ stage: "attempted", nextActionAt: "2026-09-24" }, today)).toBe(true);
    expect(isDue({ stage: "attempted", nextActionAt: "2026-09-29" }, today)).toBe(false);
    const fresh = lead({ id: "a1", stage: "attempted", createdAt: "2026-09-25T13:00:00.000Z" });
    expect(todaySummary([fresh], today).newLeads.map((l) => l.id)).toEqual(["a1"]);
  });
});
