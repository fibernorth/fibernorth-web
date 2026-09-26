// Regression tests from the Sept 26 2026 status and data audits. The audit
// versions asserted the old, wrong behaviour; these assert the fix.

import { describe, it, expect } from "vitest";
import {
  contactPatch,
  hasTalked,
  isDue,
  isToSchedule,
  leadSavePatch,
  leadSaveRules,
  reopenStage,
  sheetColumnsFromLead,
  sheetRowKey,
  sheetExternalId,
  stageFromSheet,
  LeadSaveRefused,
  type Lead,
  type LeadActivity,
} from "@/lib/leads";
import { cadencePatch, nextCadenceStep } from "@/lib/cadence";
import { writeBackSet, sheetDay } from "@/lib/sheet-sync";

const at = (d: string) => `${d}T16:00:00.000Z`;
const act = (d: string, type: LeadActivity["type"], text = "x"): LeadActivity => ({ ts: at(d), type, text });
const L = (p: Partial<Lead>) =>
  ({ id: "l", name: "n", phone: "231-555-0100", email: "a@b.c", address: "", serviceType: "", source: "website", stage: "new", ...p }) as Lead;
const blankRow = { notes: "", answered: "", booked: "", taken: "", converted: "", objection: "", cash: "", sale: "" };

describe("lastContactAt only moves forward (data #10)", () => {
  it("a replayed offline call with an older date doesn't rewind it", () => {
    const out = leadSavePatch(
      { stage: "contacted", contactEveryDays: 0, lastContactAt: "2026-09-22" } as Lead,
      {},
      { ts: "2026-09-21T15:00:00.000Z", type: "call", text: "queued offline Monday" },
      "2026-09-23"
    );
    expect(out.lastContactAt).toBeUndefined();
  });
  it("a newer contact moves it forward", () => {
    const out = leadSavePatch({ stage: "contacted", lastContactAt: "2026-09-20" } as Lead, {}, act("2026-09-22", "text"), "2026-09-22");
    expect(out.lastContactAt).toBe("2026-09-22");
  });
  it("a date Bill typed in the same save wins", () => {
    const out = leadSavePatch({ stage: "new" } as Lead, { lastContactAt: "2026-09-18" }, act("2026-09-26", "call"), "2026-09-26");
    expect(out.lastContactAt).toBe("2026-09-18");
  });
});

describe("booking a walk is not talking (data #7)", () => {
  it("walk_booked doesn't set contacted, answered or the contact date", () => {
    const booked: LeadActivity = { ts: at("2026-09-26"), type: "walk_booked", text: "Walk scheduled for 2026-10-01" };
    const out = leadSavePatch({ stage: "new" } as Lead, { appointmentAt: "2026-10-01" }, booked, "2026-09-26");
    expect(out.stage).toBeUndefined();
    expect(out.lastContactAt).toBeUndefined();
    expect(hasTalked({ activity: [booked] })).toBe(false);
  });
  it("old 'Walk scheduled for' lines logged as walk count as booked, not walked or talked", () => {
    const lead = L({ stage: "quoted", activity: [act("2026-09-20", "walk", "Walk scheduled for 2026-09-28")] });
    expect(hasTalked(lead)).toBe(false);
    expect(sheetColumnsFromLead(lead)).toMatchObject({ booked: "Yes", taken: "" });
  });
  it("a quote to someone nobody met: Booked No, Taken blank", () => {
    const cols = sheetColumnsFromLead(L({ stage: "quoted", activity: [act("2026-09-21", "quote", "Quote v1 sent")] }));
    expect(cols).toMatchObject({ booked: "No", taken: "" });
  });
  it("a walk that happened: Booked and Taken Yes, even after Lost", () => {
    const cols = sheetColumnsFromLead(L({ stage: "lost", activity: [act("2026-09-21", "walk", "Walked the yard")] }));
    expect(cols).toMatchObject({ booked: "Yes", taken: "Yes", answered: "Yes" });
  });
});

describe("sheet keys and stages (data #2, status #12)", () => {
  it("the key uses email, then name, when the phone is blank; same as before with a phone", () => {
    expect(sheetRowKey({ date: "9/20/2026", time: "1:00 PM", phone: "(231) 555-0123" })).toBe(
      sheetExternalId("9/20/2026", "1:00 PM", "(231) 555-0123")
    );
    expect(sheetRowKey({ date: "d", time: "t", phone: "", email: " A@X.com " })).toBe("sheet:d|t|e:a@x.com");
    expect(sheetRowKey({ date: "d", time: "t", phone: "", email: "", name: "Carl  Smith" })).toBe("sheet:d|t|n:carl smith");
  });
  it("Converted: 'Not interested' / 'No' = lost, 'Not a lead' / 'Spam' = not a lead", () => {
    expect(stageFromSheet({ converted: "Not interested" })).toBe("lost");
    expect(stageFromSheet({ converted: "No - price" })).toBe("lost");
    expect(stageFromSheet({ converted: "No" })).toBe("lost");
    expect(stageFromSheet({ converted: "Not a lead" })).toBe("not_a_lead");
    expect(stageFromSheet({ converted: "Spam" })).toBe("not_a_lead");
    expect(stageFromSheet({ converted: "Nothing yet" })).toBe("new");
  });
  it("reads the sheet's date formats", () => {
    expect(sheetDay("9/20/2026")).toBe("2026-09-20");
    expect(sheetDay("2026-09-20")).toBe("2026-09-20");
    expect(sheetDay("9/20/26")).toBe("2026-09-20");
    expect(sheetDay("13/45/2026")).toBe("");
    expect(sheetDay("")).toBe("");
  });
});

describe("write-back (status #2, data #8)", () => {
  it("lowers a cell only while it still shows what we wrote", () => {
    const lead = L({ stage: "contacted", touched: true, activity: [act("2026-09-21", "call")], sheetOwned: { converted: { value: "No", at: at("2026-09-21") } } });
    expect(writeBackSet(lead, { ...blankRow, converted: "No", notes: "9/21 Call: x" }).converted).toBe("");
    // The firm typed "No" (not ours): stays.
    expect(writeBackSet({ ...lead, sheetOwned: {} }, { ...blankRow, converted: "No", notes: "9/21 Call: x" }).converted).toBeUndefined();
  });
  it("never writes a sheet note back", () => {
    const lead = L({ stage: "contacted", activity: [act("2026-09-21", "call"), { ts: at("2026-09-22"), type: "note", via: "sheet", text: "L".repeat(1500) }] });
    expect(writeBackSet(lead, { ...blankRow, notes: "something else" }).notes).toBeUndefined();
  });
});

describe("reopen (status #5)", () => {
  it("goes back to the stage it was closed from", () => {
    expect(reopenStage(L({ stage: "lost", stageBeforeClose: "walk_done" }))).toBe("walk_done");
  });
  it("without a saved stage: quoted if a quote is out, else contacted only if they talked", () => {
    expect(reopenStage(L({ stage: "lost", quote: { status: "sent", total: 1, version: 1, sentAt: at("2026-09-20") } }))).toBe("quoted");
    expect(reopenStage(L({ stage: "lost", activity: [act("2026-09-01", "attempt")] }))).toBe("new");
    expect(reopenStage(L({ stage: "lost", activity: [act("2026-09-01", "call")] }))).toBe("contacted");
  });
});

describe("stage rules, for every path (status #6)", () => {
  const today = "2026-09-26";
  const now = at(today);
  it("entering Won: Schedule the job, not the schedule's step", () => {
    const { patch } = leadSaveRules(
      L({ stage: "quoted", nextAction: "Call about the quote", nextActionAt: "2026-09-30", nextActionAuto: true }),
      { stage: "won" },
      undefined,
      today,
      now
    );
    expect(patch).toMatchObject({ nextAction: "Schedule the job", nextActionAt: today, nextActionAuto: false });
  });
  it("entering Not a lead: clears the next action, defaults a reason, remembers the stage", () => {
    const { patch } = leadSaveRules(L({ stage: "contacted", nextAction: "Call", nextActionAt: today }), { stage: "not_a_lead" }, undefined, today, now);
    expect(patch).toMatchObject({ nextAction: "", nextActionAt: "", disqualifyReason: "other", disqualifiedAt: now, stageBeforeClose: "contacted" });
  });
  it("entering Lost from the dropdown clears the next action too", () => {
    const { patch } = leadSaveRules(L({ stage: "quoted", nextAction: "Call", nextActionAt: today }), { stage: "lost" }, undefined, today, now);
    expect(patch).toMatchObject({ nextAction: "", nextActionAt: "", stageBeforeClose: "quoted" });
  });
  it("leaving Not a lead clears the disqualify fields", () => {
    const { patch } = leadSaveRules(L({ stage: "not_a_lead", disqualifyReason: "spam", disqualifiedAt: now }), { stage: "contacted" }, undefined, today, now);
    expect(patch).toMatchObject({ disqualifyReason: "", disqualifiedAt: "", stageBeforeClose: "" });
  });
  it("leaving Won while a customer's acceptance stands is refused", () => {
    const fresh = L({ stage: "won", quote: { status: "accepted", total: 4250, version: 1 } });
    expect(() => leadSaveRules(fresh, { stage: "walk_done" }, undefined, today, now)).toThrow(LeadSaveRefused);
    expect(() => leadSaveRules(fresh, { stage: "walk_done" }, undefined, today, now)).toThrow(/Undo acceptance/);
  });
  it("leaving Won with a paid referral fee keeps the fee and logs a warning", () => {
    const fresh = L({ stage: "won", jobDoneAt: "2026-09-20", referralFeeStatus: "paid", referralFeePaidAt: "2026-09-22" });
    const { patch, notes } = leadSaveRules(fresh, { stage: "lost" }, undefined, today, now);
    expect(patch.referralFeeStatus).toBeUndefined();
    expect(patch.jobDoneAt).toBe("");
    expect(notes[0].text).toMatch(/referral fee already paid/);
  });
});

describe("closed leads and the schedule (status #7, #8, #14)", () => {
  it("logging a call on a won contractor doesn't set Check back", () => {
    const lead = L({ stage: "won", contactEveryDays: 30 });
    const p = contactPatch(lead, act("2026-09-26", "call"), "2026-09-26");
    expect(p.nextAction).toBeUndefined();
    expect(p.nextActionAt).toBeUndefined();
  });
  it("finished job, review asked: next action cleared, not 'Set the next step'", () => {
    const fresh = L({ stage: "won", jobDoneAt: "2026-09-20", nextAction: "Ask for Google review", nextActionAt: "2026-09-22", nextActionAuto: true,
      activity: [act("2026-09-20", "note", "Job done")] });
    const out = cadencePatch(fresh, {}, {}, act("2026-09-23", "text", "review ask"), "2026-09-23");
    expect(out).toEqual({ nextAction: "", nextActionAt: "", nextActionAuto: false });
    expect(isDue({ ...fresh, ...out }, "2026-09-30")).toBe(false);
  });
  it("taking back Job done puts Schedule the job back", () => {
    const fresh = L({ stage: "won", jobDoneAt: "2026-09-20", nextAction: "Ask for Google review", nextActionAt: "2026-09-22", nextActionAuto: true });
    const out = cadencePatch(fresh, { jobDoneAt: "" }, {}, { ts: at("2026-09-21"), type: "system", text: "Job done taken back" }, "2026-09-21");
    expect(out).toEqual({ nextAction: "Schedule the job", nextActionAt: "2026-09-21", nextActionAuto: false });
  });
  it("a quote out on a won lead (second site) runs the quote schedule, and isn't 'to schedule'", () => {
    const lead = L({ stage: "won", quote: { status: "sent", total: 3000, version: 1, sentAt: at("2026-09-20"), expiresAt: at("2026-10-20") } });
    expect(nextCadenceStep(lead, "2026-09-22")?.key).toBe("quote:d2");
    expect(isToSchedule({ ...lead, nextAction: "Text about the quote", nextActionAuto: true })).toBe(false);
    expect(isToSchedule({ ...lead, nextAction: "Schedule the job", nextActionAuto: false })).toBe(true);
  });
  it("imported mid-pipeline leads show up in Due once they have a check-back", () => {
    expect(isDue(L({ stage: "walk_done", nextAction: "Check back", nextActionAt: "2026-09-26" }), "2026-09-26")).toBe(true);
  });
});
