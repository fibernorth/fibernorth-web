import { describe, it, expect } from "vitest";
import { cadencePatch, canReplaceNextAction, nextCadenceStep, quoteExpiryDate } from "./cadence";
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
  it("day 2 text first", () => {
    const s = nextCadenceStep(quoted(), "2026-09-01");
    expect(s).toMatchObject({ date: "2026-09-03", kind: "text", templateKey: "quote-followup", track: "quote" });
  });

  it("the send itself is not a touch", () => {
    expect(nextCadenceStep(quoted(), "2026-09-05")?.key).toBe("quote:d2");
  });

  it("walks day 2 text, day 5 call, day 12 email, then the day before expiry", () => {
    expect(nextCadenceStep(quoted([act("2026-09-03", "text")]), "2026-09-03")).toMatchObject({ date: "2026-09-06", kind: "call" });
    expect(nextCadenceStep(quoted([act("2026-09-03", "text"), act("2026-09-06", "attempt")]), "2026-09-06")).toMatchObject({
      date: "2026-09-13",
      kind: "email",
      templateKey: "quote-followup",
    });
    const three = [act("2026-09-03", "text"), act("2026-09-06", "call"), act("2026-09-13", "email")];
    expect(nextCadenceStep(quoted(three), "2026-09-13")).toMatchObject({
      date: "2026-09-30",
      kind: "email",
      templateKey: "quote-expiring",
      key: "quote:expiring",
    });
    expect(nextCadenceStep(quoted([...three, act("2026-09-30", "email")]), "2026-09-30")).toBeNull();
  });

  it("two touches the same day cover one step", () => {
    const s = nextCadenceStep(quoted([act("2026-09-03", "attempt"), act("2026-09-03", "text")]), "2026-09-03");
    expect(s?.key).toBe("quote:d5");
  });

  it("a late touch also covers steps that were due before it", () => {
    // Nothing until day 7: day 2 and day 5 are both covered, next is day 12.
    expect(nextCadenceStep(quoted([act("2026-09-08", "call")]), "2026-09-08")?.key).toBe("quote:d12");
  });

  it("stops once the quote is accepted, declined or expired", () => {
    expect(nextCadenceStep(quoted([], { status: "accepted" }), "2026-09-05")).toBeNull();
    expect(nextCadenceStep(quoted([], { status: "declined" }), "2026-09-05")).toBeNull();
    expect(nextCadenceStep(quoted(), "2026-10-01")).toBeNull();
  });

  it("short quotes drop steps past the expiry", () => {
    const q = quoted([act("2026-09-03", "text")], { expiresAt: at("2026-09-08") });
    expect(nextCadenceStep(q, "2026-09-03")).toMatchObject({ key: "quote:d5", date: "2026-09-06" });
    const after = quoted([act("2026-09-03", "text"), act("2026-09-06", "call")], { expiresAt: at("2026-09-08") });
    expect(nextCadenceStep(after, "2026-09-06")).toMatchObject({ key: "quote:expiring", date: "2026-09-07" });
  });

  it("old badges without expiresAt assume 30 days", () => {
    expect(quoteExpiryDate({ status: "sent", total: 1, version: 1, sentAt: at("2026-09-01") })).toBe("2026-10-01");
  });

  it("uses text when there is no email, and email when there is no phone", () => {
    const noEmail = { ...quoted([act("2026-09-03", "text"), act("2026-09-06", "call")]), email: "" };
    expect(nextCadenceStep(noEmail, "2026-09-06")).toMatchObject({ kind: "text", label: "Text about the quote" });
    const noPhone = { ...quoted(), phone: "" };
    expect(nextCadenceStep(noPhone, "2026-09-01")).toMatchObject({ kind: "email", label: "Email about the quote" });
  });
});

describe("new leads", () => {
  const fresh = (activity: LeadActivity[] = [], p: Partial<Lead> = {}) =>
    ({ ...base, stage: "new", createdAt: at("2026-09-20"), activity, ...p }) as Lead;

  it("day 0 call and text, day 1 call, day 3 text", () => {
    expect(nextCadenceStep(fresh(), "2026-09-20")).toMatchObject({ date: "2026-09-20", kind: "call+text", templateKey: "new-first" });
    expect(nextCadenceStep(fresh([act("2026-09-20", "attempt")]), "2026-09-20")).toMatchObject({ date: "2026-09-21", kind: "call" });
    expect(
      nextCadenceStep(fresh([act("2026-09-20", "attempt"), act("2026-09-21", "attempt")]), "2026-09-21")
    ).toMatchObject({ date: "2026-09-23", kind: "text", templateKey: "missed" });
    expect(
      nextCadenceStep(fresh([act("2026-09-20", "attempt"), act("2026-09-21", "attempt"), act("2026-09-23", "text")]), "2026-09-23")
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
  it("2 days after the job is done", () => {
    const won = { ...base, stage: "won", jobDoneAt: "2026-09-25", activity: [act("2026-09-25", "note", "Job done")] } as Lead;
    expect(nextCadenceStep(won, "2026-09-25")).toMatchObject({
      date: "2026-09-27",
      kind: "text",
      label: "Ask for Google review",
      templateKey: "review",
      track: "review",
    });
    // A thank-you call the same day isn't the ask; a text two days later is.
    const same = { ...won, activity: [...won.activity!, act("2026-09-25", "call")] };
    expect(nextCadenceStep(same, "2026-09-25")?.key).toBe("review:d2");
    const asked = { ...won, activity: [...won.activity!, act("2026-09-27", "text")] };
    expect(nextCadenceStep(asked, "2026-09-27")).toBeNull();
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
  it("logging the day 2 text sets the day 5 call", () => {
    const lead = { ...quoted(), nextAction: "Text about the quote", nextActionAt: "2026-09-03", nextActionAuto: true };
    const p = cadencePatch(lead, {}, {}, act("2026-09-03", "text"), "2026-09-03");
    expect(p).toEqual({ nextAction: "Call about the quote", nextActionAt: "2026-09-06", nextActionAuto: true });
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
    expect(p).toEqual({ nextAction: "Ask for Google review", nextActionAt: "2026-09-27", nextActionAuto: true });
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
