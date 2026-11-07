import { describe, it, expect } from "vitest";
import {
  cadencePatch,
  canReplaceNextAction,
  EXPIRED_QUOTE_STEP,
  nextCadenceStep,
  OPENED_QUOTE_ACTION,
  openedQuotePatch,
  quoteExpiryDate,
  UNOPENED_QUOTE_STEP,
} from "./cadence";
import type { Lead, LeadActivity } from "./leads";

// Noon Detroit on a given day.
const at = (d: string) => `${d}T16:00:00.000Z`;
const act = (d: string, type: LeadActivity["type"], text = "x"): LeadActivity => ({ ts: at(d), type, text });

const base: Partial<Lead> = { phone: "231-555-0100", email: "don@example.com", source: "website" };

const quoted = (activity: LeadActivity[] = [], quote: Partial<NonNullable<Lead["quote"]>> = {}) =>
  ({
    ...base,
    stage: "quoted",
    quote: { status: "sent", total: 3000, version: 1, sentAt: at("2026-09-01"), expiresAt: at("2026-10-01"), ...quote },
    activity: [act("2026-09-01", "quote", "Quote v1 sent"), ...activity],
  }) as Lead;

describe("quoted leads", () => {
  it("day 2 text first once they've opened it", () => {
    const s = nextCadenceStep(quoted([], { status: "viewed", viewedAt: at("2026-09-02") }), "2026-09-02");
    expect(s).toMatchObject({ key: "quote:d2", date: "2026-09-03", kind: "text", templateKey: "quote-followup", track: "quote" });
  });

  it("day 2 is a call when the quote hasn't been opened", () => {
    const s = nextCadenceStep(quoted(), "2026-09-01");
    expect(s).toMatchObject({
      key: "quote:d2-unopened",
      date: "2026-09-03",
      kind: "call",
      label: UNOPENED_QUOTE_STEP,
      track: "quote",
    });
    // Opened later: back to the usual text, same day.
    const opened = nextCadenceStep(quoted([], { status: "viewed", viewedAt: at("2026-09-03") }), "2026-09-03");
    expect(opened).toMatchObject({ key: "quote:d2", kind: "text", date: "2026-09-03" });
    // The call covers day 2; the rest of the schedule is unchanged.
    expect(nextCadenceStep(quoted([act("2026-09-03", "call")]), "2026-09-03")).toMatchObject({ key: "quote:d5", date: "2026-09-09" });
    // No phone: an email instead.
    expect(nextCadenceStep({ ...quoted(), phone: "" }, "2026-09-01")).toMatchObject({ kind: "email", label: "Email about the quote" });
  });

  it("the send itself is not a touch", () => {
    expect(nextCadenceStep(quoted(), "2026-09-05")?.key).toBe("quote:d2-unopened");
  });

  it("walks business day 2 text, day 5 call, day 10 email, then the business day before expiry", () => {
    expect(nextCadenceStep(quoted([act("2026-09-03", "text")]), "2026-09-03")).toMatchObject({ date: "2026-09-09", kind: "call" });
    // Labor Day (9/7) and the weekend don't count.
    expect(nextCadenceStep(quoted([act("2026-09-03", "text"), act("2026-09-09", "attempt")]), "2026-09-09")).toMatchObject({
      date: "2026-09-16",
      kind: "email",
      templateKey: "quote-followup",
    });
    const three = [act("2026-09-03", "text"), act("2026-09-09", "call"), act("2026-09-16", "email")];
    expect(nextCadenceStep(quoted(three), "2026-09-16")).toMatchObject({
      date: "2026-09-30",
      kind: "email",
      templateKey: "quote-expiring",
      key: "quote:expiring",
    });
    // After the reminder: a fresh copy on the day it expires.
    expect(nextCadenceStep(quoted([...three, act("2026-09-30", "email")]), "2026-09-30")).toMatchObject({
      key: "quote:expired",
      date: "2026-10-01",
      kind: "email",
      label: EXPIRED_QUOTE_STEP,
    });
    // Re-sent on the expiry day: done.
    expect(nextCadenceStep(quoted([...three, act("2026-09-30", "email"), act("2026-10-01", "quote")]), "2026-10-01")).toBeNull();
  });

  it("two touches the same day cover one step", () => {
    const s = nextCadenceStep(quoted([act("2026-09-03", "attempt"), act("2026-09-03", "text")]), "2026-09-03");
    expect(s?.key).toBe("quote:d5");
  });

  it("a late touch also covers steps that were due before it", () => {
    // Nothing until business day 5: day 2 and day 5 are both covered, next is the email.
    expect(nextCadenceStep(quoted([act("2026-09-09", "call")]), "2026-09-09")?.key).toBe("quote:d12");
  });

  it("stops once the quote is accepted or declined", () => {
    expect(nextCadenceStep(quoted([], { status: "accepted" }), "2026-09-05")).toBeNull();
    expect(nextCadenceStep(quoted([], { status: "declined" }), "2026-09-05")).toBeNull();
  });

  it("expired with no answer: send a fresh copy", () => {
    // Untouched and expired: the old steps are moot, the fresh copy is next.
    expect(nextCadenceStep(quoted(), "2026-10-01")).toMatchObject({ key: "quote:expired", date: "2026-10-01", label: EXPIRED_QUOTE_STEP });
    expect(nextCadenceStep(quoted([], { status: "viewed", viewedAt: at("2026-09-02") }), "2026-10-05")?.key).toBe("quote:expired");
    expect(nextCadenceStep(quoted([], { status: "expired" }), "2026-10-05")?.key).toBe("quote:expired");
    // Touches before the expiry day don't cover it; one on or after does.
    expect(nextCadenceStep(quoted([act("2026-09-30", "call")]), "2026-10-02")?.key).toBe("quote:expired");
    expect(nextCadenceStep(quoted([act("2026-10-02", "call")]), "2026-10-02")).toBeNull();
    // Without a phone it stays "Send a fresh copy" (an email anyway).
    expect(nextCadenceStep({ ...quoted(), phone: "" }, "2026-10-01")?.label).toBe(EXPIRED_QUOTE_STEP);
    // Expiry on a Saturday: due Monday.
    expect(nextCadenceStep(quoted([], { expiresAt: at("2026-10-03") }), "2026-10-03")?.date).toBe("2026-10-05");
    // Long expired: left alone.
    expect(nextCadenceStep(quoted(), "2026-11-15")).toBeNull();
    // Accepted or declined: nothing.
    expect(nextCadenceStep(quoted([], { status: "accepted" }), "2026-10-05")).toBeNull();
    expect(nextCadenceStep(quoted([], { status: "declined" }), "2026-10-05")).toBeNull();
  });

  it("short quotes drop steps past the expiry", () => {
    const q = quoted([act("2026-09-03", "text")], { expiresAt: at("2026-09-08") });
    // Expires 9/8; 9/7 is Labor Day, so the reminder is Friday 9/4 and the day 5 call is dropped.
    expect(nextCadenceStep(q, "2026-09-03")).toMatchObject({ key: "quote:expiring", date: "2026-09-04" });
  });

  it("old badges without expiresAt assume 30 days", () => {
    expect(quoteExpiryDate({ status: "sent", total: 1, version: 1, sentAt: at("2026-09-01") })).toBe("2026-10-01");
  });

  it("uses text when there is no email, and email when there is no phone", () => {
    const noEmail = { ...quoted([act("2026-09-03", "text"), act("2026-09-09", "call")]), email: "" };
    expect(nextCadenceStep(noEmail, "2026-09-09")).toMatchObject({ kind: "text", label: "Text about the quote" });
    const noPhone = { ...quoted(), phone: "" };
    expect(nextCadenceStep(noPhone, "2026-09-01")).toMatchObject({ kind: "email", label: "Email about the quote" });
  });
});

describe("new leads", () => {
  const fresh = (activity: LeadActivity[] = [], p: Partial<Lead> = {}) =>
    ({ ...base, stage: "new", createdAt: at("2026-09-20"), activity, ...p }) as Lead;

  it("day 0 call and text, day 1 call, day 3 text (business days)", () => {
    // Came in Sunday 9/20: first due Monday.
    expect(nextCadenceStep(fresh(), "2026-09-20")).toMatchObject({ date: "2026-09-21", kind: "call+text", templateKey: "new-first" });
    expect(nextCadenceStep(fresh([act("2026-09-20", "attempt")]), "2026-09-20")).toMatchObject({ date: "2026-09-22", kind: "call" });
    expect(
      nextCadenceStep(fresh([act("2026-09-20", "attempt"), act("2026-09-22", "attempt")]), "2026-09-22")
    ).toMatchObject({ date: "2026-09-24", kind: "text", templateKey: "missed" });
    expect(
      nextCadenceStep(fresh([act("2026-09-20", "attempt"), act("2026-09-22", "attempt"), act("2026-09-24", "text")]), "2026-09-24")
    ).toBeNull();
  });

  it("stops once they've talked (stage leaves new)", () => {
    expect(nextCadenceStep(fresh([], { stage: "contacted" }), "2026-09-20")).toBeNull();
  });

  it("leaves letter lists and old untouched leads alone", () => {
    expect(nextCadenceStep(fresh([], { source: "contractor-letter" }), "2026-09-20")).toBeNull();
    expect(nextCadenceStep(fresh([], { source: "campground-letter" }), "2026-09-20")).toBeNull();
    expect(nextCadenceStep(fresh(), "2026-10-20")).toBeNull();
  });
});

describe("review ask", () => {
  it("2 business days after the job is done", () => {
    const won = { ...base, stage: "won", jobDoneAt: "2026-09-25", activity: [act("2026-09-25", "note", "Job done")] } as Lead;
    // Done Friday 9/25: ask Tuesday.
    expect(nextCadenceStep(won, "2026-09-25")).toMatchObject({
      date: "2026-09-29",
      kind: "text",
      label: "Ask for Google review",
      templateKey: "review",
      track: "review",
    });
    // A thank-you call the same day isn't the ask; a text two days later is.
    const same = { ...won, activity: [...won.activity!, act("2026-09-25", "call")] };
    expect(nextCadenceStep(same, "2026-09-25")?.key).toBe("review:d2");
    const asked = { ...won, activity: [...won.activity!, act("2026-09-29", "text")] };
    expect(nextCadenceStep(asked, "2026-09-29")).toBeNull();
  });

  it("a review request sent the day the job is done ends the ask", () => {
    const won = { ...base, stage: "won", jobDoneAt: "2026-09-25", activity: [act("2026-09-25", "note", "Job done")] } as Lead;
    const emailed = { ...won, activity: [...won.activity!, act("2026-09-25", "email", 'Emailed "Thanks" to pat@x.com (Google review request)')] };
    expect(nextCadenceStep(emailed, "2026-09-25")).toBeNull();
    const texted = { ...won, activity: [...won.activity!, act("2026-09-25", "text", "Texted (Google review request):\nHi")] };
    expect(nextCadenceStep(texted, "2026-09-25")).toBeNull();
  });

  it("nothing for a won job that isn't done yet", () => {
    expect(nextCadenceStep({ ...base, stage: "won" } as Lead, "2026-09-25")).toBeNull();
  });
});

describe("canReplaceNextAction", () => {
  const today = "2026-09-10";
  it("replaces empty, due, overdue, auto and the app's own defaults", () => {
    expect(canReplaceNextAction({}, today)).toBe(true);
    expect(canReplaceNextAction({ nextAction: "Call Don", nextActionAt: today }, today)).toBe(true);
    expect(canReplaceNextAction({ nextAction: "Call Don", nextActionAt: "2026-09-01" }, today)).toBe(true);
    expect(canReplaceNextAction({ nextAction: "Text about the quote", nextActionAt: "2026-09-20", nextActionAuto: true }, today)).toBe(true);
    expect(canReplaceNextAction({ nextAction: "Follow up on quote", nextActionAt: "2026-09-20" }, today)).toBe(true);
  });
  it("keeps Bill's own next action for a later day", () => {
    expect(canReplaceNextAction({ nextAction: "Call after the 20th, he's at camp", nextActionAt: "2026-09-20" }, today)).toBe(false);
    expect(canReplaceNextAction({ nextAction: "Call back", nextActionAt: "2026-09-20", nextActionAuto: false }, today)).toBe(false);
  });
});

describe("cadencePatch (runs on the server after a save)", () => {
  it("a text or email counts as contact: a due or overdue follow-up moves out", () => {
    const lead = { ...base, stage: "contacted", nextAction: "Call back", nextActionAt: "2026-09-25", activity: [] } as unknown as Lead;
    for (const type of ["text", "email", "call"] as const) {
      expect(cadencePatch(lead, {}, {}, act("2026-09-28", type), "2026-09-28")).toEqual({
        nextAction: "Check back",
        nextActionAt: "2026-10-01",
        nextActionAuto: true,
      });
    }
    // No answer: try again the next business day.
    expect(cadencePatch(lead, {}, {}, act("2026-09-25", "attempt"), "2026-09-25")).toEqual({
      nextAction: "Call back",
      nextActionAt: "2026-09-28",
      nextActionAuto: false,
    });
    // A note isn't contact, and a later follow-up Bill set stays.
    expect(cadencePatch(lead, {}, {}, act("2026-09-28", "note"), "2026-09-28")).toEqual({});
    expect(cadencePatch({ ...lead, nextActionAt: "2026-10-05" }, {}, {}, act("2026-09-28", "text"), "2026-09-28")).toEqual({});
    // A won job still to schedule keeps "Schedule the job".
    expect(cadencePatch({ ...lead, stage: "won", nextAction: "Schedule the job" } as Lead, {}, {}, act("2026-09-28", "text"), "2026-09-28")).toEqual({});
  });

  it("logging the day 2 text sets the day 5 call", () => {
    const lead = { ...quoted(), nextAction: "Text about the quote", nextActionAt: "2026-09-03", nextActionAuto: true };
    const p = cadencePatch(lead, {}, {}, act("2026-09-03", "text"), "2026-09-03");
    expect(p).toEqual({ nextAction: "Call about the quote", nextActionAt: "2026-09-09", nextActionAuto: true });
  });

  it("doesn't clobber Bill's own later next action", () => {
    const lead = { ...quoted(), nextAction: "Wait, he's out of town till the 15th", nextActionAt: "2026-09-15" };
    expect(cadencePatch(lead, {}, {}, act("2026-09-03", "text"), "2026-09-03")).toEqual({});
  });

  it("a next action set in the same save is Bill's", () => {
    const lead = quoted();
    expect(cadencePatch(lead, { nextAction: "Call back", nextActionAt: "2026-09-04" }, {}, act("2026-09-03", "attempt"), "2026-09-03")).toEqual({
      nextActionAuto: false,
    });
  });

  it("notes and stage lines don't move the schedule", () => {
    expect(cadencePatch(quoted(), {}, {}, act("2026-09-03", "note"), "2026-09-03")).toEqual({});
  });

  it("job done sets the review ask even over 'Schedule the job'", () => {
    const lead = { ...base, stage: "won", nextAction: "Schedule the job", nextActionAt: "2026-09-30" } as Lead;
    const p = cadencePatch(lead, { jobDoneAt: "2026-09-25" }, {}, act("2026-09-25", "note", "Job done"), "2026-09-25");
    expect(p).toEqual({ nextAction: "Ask for Google review", nextActionAt: "2026-09-29", nextActionAuto: true });
  });

  it("when the schedule ends after they talk, asks Bill for the next step", () => {
    const lead = {
      ...base,
      stage: "new",
      createdAt: at("2026-09-20"),
      nextAction: "Call again",
      nextActionAt: "2026-09-21",
      nextActionAuto: true,
      activity: [],
    } as unknown as Lead;
    const p = cadencePatch(lead, {}, { stage: "contacted" }, act("2026-09-21", "call"), "2026-09-21");
    expect(p).toEqual({ nextAction: "Set the next step", nextActionAt: "2026-09-21", nextActionAuto: false });
  });
});

describe("openedQuotePatch (customer first opens a quote)", () => {
  const today = "2026-09-10";
  const call = { nextAction: OPENED_QUOTE_ACTION, nextActionAt: today, nextActionAuto: true };
  it("moves the next action to today: call now", () => {
    expect(openedQuotePatch({ stage: "quoted" }, today)).toEqual(call);
    expect(openedQuotePatch({ stage: "quoted", nextAction: "Text about the quote", nextActionAt: "2026-09-14", nextActionAuto: true }, today)).toEqual(call);
    expect(openedQuotePatch({ stage: "quoted", nextAction: "Call back", nextActionAt: "2026-09-08", nextActionAuto: false }, today)).toEqual(call);
    expect(openedQuotePatch({ stage: "nurture", nextAction: "Check back", nextActionAt: "2026-10-01" }, today)).toEqual(call);
  });
  it("keeps a next action a person set for a later day", () => {
    expect(openedQuotePatch({ stage: "quoted", nextAction: "Call after the 20th", nextActionAt: "2026-09-20", nextActionAuto: false }, today)).toEqual({});
    expect(openedQuotePatch({ stage: "quoted", nextAction: "Call after the 20th", nextActionAt: "2026-09-20" }, today)).toEqual({});
  });
  it("leaves won, closed, finished and account leads alone", () => {
    expect(openedQuotePatch({ stage: "won", nextAction: "Schedule the job", nextActionAt: today }, today)).toEqual({});
    expect(openedQuotePatch({ stage: "lost" }, today)).toEqual({});
    expect(openedQuotePatch({ stage: "not_a_lead" }, today)).toEqual({});
    expect(openedQuotePatch({ stage: "quoted", isAccount: true }, today)).toEqual({});
  });
});

describe('"New (tried to contact)" keeps the new-lead chase going', () => {
  it("after a no-answer call the next step is still the new track", () => {
    const l = {
      ...base,
      stage: "attempted",
      createdAt: at("2026-09-01"),
      activity: [act("2026-09-01", "attempt", "No answer")],
    } as Lead;
    expect(nextCadenceStep(l, "2026-09-01")?.key).toBe("new:d1");
    // Talked: contacted, the chase stops.
    expect(nextCadenceStep({ ...l, stage: "contacted" }, "2026-09-01")).toBeNull();
  });
});
