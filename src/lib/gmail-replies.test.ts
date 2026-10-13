import { describe, it, expect } from "vitest";
import {
  FIRST_RUN_SECONDS,
  OVERLAP_SECONDS,
  REPLY_NEXT_ACTION,
  buildEmailIndex,
  decodeEntities,
  gmailQuery,
  isGmailState,
  leadEmails,
  leadsForSender,
  messageTs,
  parseFromEmail,
  pickTargets,
  replyActivity,
  replyActivityText,
  replyPatch,
  shouldRun,
  type LeadForMatch,
} from "./gmail-replies";
import { answeredCell, autoStageFor, contactPatch, formatLogForSheet, hasTalked, isOutreach, leadSavePatch, type LeadActivity } from "./leads";
import { cadencePatch } from "./cadence";

const NOW = Date.parse("2026-10-13T15:00:00Z");
const nowSec = NOW / 1000;

describe("parseFromEmail", () => {
  it("reads the address from the usual From shapes, lowercased", () => {
    expect(parseFromEmail('"Jane Doe" <Jane.Doe@Example.com>')).toBe("jane.doe@example.com");
    expect(parseFromEmail("jane@example.com")).toBe("jane@example.com");
    expect(parseFromEmail("<JANE@example.com>")).toBe("jane@example.com");
    expect(parseFromEmail("Jane Doe <jane+quotes@mail.example.co.uk>")).toBe("jane+quotes@mail.example.co.uk");
  });
  it("prefers the <address> over an address-looking display name", () => {
    expect(parseFromEmail('"bill@fibernorth.com via Jane" <jane@example.com>')).toBe("jane@example.com");
  });
  it("returns blank when there is no address", () => {
    expect(parseFromEmail("")).toBe("");
    expect(parseFromEmail(undefined)).toBe("");
    expect(parseFromEmail("Mail Delivery Subsystem")).toBe("");
  });
});

describe("leadEmails", () => {
  it("splits a field holding several addresses", () => {
    expect(leadEmails("A@x.com, b@y.com; c@z.org")).toEqual(["a@x.com", "b@y.com", "c@z.org"]);
    expect(leadEmails("")).toEqual([]);
    expect(leadEmails("not an email")).toEqual([]);
  });
});

describe("gmailQuery", () => {
  it("first run looks back three days", () => {
    expect(gmailQuery(undefined, NOW)).toBe(`in:inbox -from:me after:${nowSec - FIRST_RUN_SECONDS}`);
    expect(gmailQuery(0, NOW)).toBe(`in:inbox -from:me after:${nowSec - FIRST_RUN_SECONDS}`);
  });
  it("later runs start five minutes before the last check", () => {
    const last = nowSec - 600;
    expect(gmailQuery(last, NOW)).toBe(`in:inbox -from:me after:${last - OVERLAP_SECONDS}`);
  });
  it("a last check in the future (clock skew) is ignored", () => {
    expect(gmailQuery(nowSec + 3600, NOW)).toBe(`in:inbox -from:me after:${nowSec - FIRST_RUN_SECONDS}`);
  });
});

describe("shouldRun", () => {
  it("runs when never run, and at most every two minutes", () => {
    expect(shouldRun(undefined, NOW)).toBe(true);
    expect(shouldRun(new Date(NOW - 60_000).toISOString(), NOW)).toBe(false);
    expect(shouldRun(new Date(NOW - 121_000).toISOString(), NOW)).toBe(true);
  });
  it("Check now may run sooner, but not right on top of a run", () => {
    expect(shouldRun(new Date(NOW - 60_000).toISOString(), NOW, true)).toBe(true);
    expect(shouldRun(new Date(NOW - 5_000).toISOString(), NOW, true)).toBe(false);
  });
});

describe("isGmailState", () => {
  it("tells the Gmail sign-in from the calendar's", () => {
    expect(isGmailState("gmail.abc123")).toBe(true);
    expect(isGmailState("abc123")).toBe(false);
  });
});

const lead = (id: string, email: string, stage: string, extra: Partial<LeadForMatch> = {}): LeadForMatch => ({
  id,
  email,
  stage,
  ...extra,
});

describe("matching senders to leads", () => {
  const leads = [
    lead("a", "Jane@Example.com", "new"),
    lead("b", "bob@x.com, shared@co.com", "quoted"),
    lead("acct", "shared@co.com", "contacted", { isAccount: true }),
    lead("job1", "shared@co.com", "won", { updatedAt: "2026-10-01" }),
    lead("old1", "gone@x.com", "lost", { updatedAt: "2026-01-01" }),
    lead("old2", "gone@x.com", "won", { updatedAt: "2026-05-01" }),
    lead("me", "bill@fibernorth.com", "new"),
  ];
  const index = buildEmailIndex(leads);

  it("finds a lead by sender, any case", () => {
    expect(leadsForSender(index, '"Jane" <jane@example.com>').map((l) => l.id)).toEqual(["a"]);
  });
  it("strangers and our own addresses match nothing", () => {
    expect(leadsForSender(index, "someone@else.com")).toEqual([]);
    expect(leadsForSender(index, "Bill <bill@fibernorth.com>")).toEqual([]);
  });
  it("a shared address goes on the leads being worked, not the account or closed jobs", () => {
    expect(leadsForSender(index, "shared@co.com").map((l) => l.id)).toEqual(["b"]);
  });
  it("when none is being worked, the most recently updated one gets it", () => {
    expect(leadsForSender(index, "gone@x.com").map((l) => l.id)).toEqual(["old2"]);
    expect(pickTargets([lead("x", "a@b.co", "won")]).map((l) => l.id)).toEqual(["x"]);
  });
});

describe("reply history line", () => {
  it("has the subject and a trimmed, decoded snippet", () => {
    expect(replyActivityText("Re: Your quote", "Sounds good, I&#39;m in. When can you start?")).toBe(
      `Replied by email: "Re: Your quote" Sounds good, I'm in. When can you start?`
    );
    const long = replyActivityText("Hi", "word ".repeat(100));
    expect(long.length).toBeLessThan(240);
    expect(long.endsWith("…")).toBe(true);
    expect(replyActivityText("", "")).toBe('Replied by email: "(no subject)"');
  });
  it("decodes the entities Gmail puts in snippets", () => {
    expect(decodeEntities("a &amp; b &lt;c&gt; &quot;d&quot; &#x27;e&#x27;")).toBe(`a & b <c> "d" 'e'`);
  });
  it("is an inbound email from Gmail, dated when the message arrived", () => {
    const ts = messageTs("1760360000000", "Mon, 13 Oct 2026 09:00:00 -0400", "2026-10-13T15:00:00.000Z");
    expect(ts).toBe(new Date(1760360000000).toISOString());
    expect(messageTs(undefined, "Mon, 13 Oct 2026 09:00:00 -0400", "x")).toBe("2026-10-13T13:00:00.000Z");
    expect(messageTs(undefined, "garbage", "fallback")).toBe("fallback");
    expect(replyActivity({ subject: "Re: hi", snippet: "yes", ts })).toEqual({
      ts,
      type: "email",
      dir: "in",
      via: "gmail",
      text: 'Replied by email: "Re: hi" yes',
    });
  });
  it("shows in the sheet's Notes without a doubled Email: prefix", () => {
    const a = replyActivity({ subject: "Re: hi", snippet: "yes", ts: "2026-10-13T15:00:00.000Z" });
    expect(formatLogForSheet(a)).toBe('10/13 Replied by email: "Re: hi" yes');
  });
});

describe("replyPatch", () => {
  it("open and long-term leads get Reply to their email today", () => {
    expect(replyPatch({ stage: "new" }, "2026-10-13")).toEqual({ nextAction: REPLY_NEXT_ACTION, nextActionAt: "2026-10-13" });
    expect(replyPatch({ stage: "nurture" }, "2026-10-13")).toEqual({ nextAction: REPLY_NEXT_ACTION, nextActionAt: "2026-10-13" });
  });
  it("closed leads are only logged", () => {
    for (const stage of ["won", "lost", "not_a_lead"]) expect(replyPatch({ stage }, "2026-10-13")).toEqual({});
  });
});

describe("an inbound email counts as the person responding", () => {
  const reply: LeadActivity = { ts: "2026-10-13T15:00:00.000Z", type: "email", dir: "in", via: "gmail", text: "Replied by email" };
  const sent: LeadActivity = { ts: "2026-10-12T15:00:00.000Z", type: "email", text: "Sent the quote" };

  it("is a conversation, not outreach", () => {
    expect(hasTalked({ activity: [reply] })).toBe(true);
    expect(isOutreach(reply)).toBe(false);
    // An email we sent is still just outreach.
    expect(hasTalked({ activity: [sent] })).toBe(false);
    expect(isOutreach(sent)).toBe(true);
  });
  it("Lead Answered says Yes (a sent email alone says No)", () => {
    expect(answeredCell({ stage: "attempted", activity: [sent] })).toBe("No");
    expect(answeredCell({ stage: "attempted", activity: [sent, reply] })).toBe("Yes");
  });
  it("moves New and tried-to-contact to Contacted, and nothing later", () => {
    expect(autoStageFor("new", reply)).toBe("contacted");
    expect(autoStageFor("attempted", reply)).toBe("contacted");
    expect(autoStageFor("quoted", reply)).toBe(null);
  });
  it("sets the last contact date", () => {
    expect(contactPatch({ stage: "new", lastContactAt: "2026-10-01" }, reply, "2026-10-13")).toEqual({
      lastContactAt: "2026-10-13",
      stage: "contacted",
    });
  });
  it("the save rules keep Reply to their email and move the stage", () => {
    const fresh = { stage: "new", nextAction: "Call back", nextActionAt: "2026-10-20" };
    const patch = leadSavePatch(fresh, replyPatch(fresh, "2026-10-13"), reply, "2026-10-13");
    expect(patch).toMatchObject({ stage: "contacted", nextAction: REPLY_NEXT_ACTION, nextActionAt: "2026-10-13", lastContactAt: "2026-10-13" });
  });
  it("doesn't count as Bill working the follow-up schedule", () => {
    const won = {
      stage: "won",
      jobDoneAt: "2026-10-01",
      nextAction: "Ask for Google review",
      nextActionAt: "2026-10-03",
      nextActionAuto: true,
      activity: [],
    };
    expect(cadencePatch(won, {}, {}, reply, "2026-10-13")).toEqual({});
  });
});
