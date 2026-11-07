import { describe, it, expect } from "vitest";
import {
  buildMorningList,
  cronAuthorized,
  digestDecision,
  DIGEST_LEASE_MS,
  listFor,
  morningEmail,
  newLeadAlert,
  pickReps,
  quoteOpenedAlert,
  smsTargets,
  submitterNotice,
  submitterTo,
  telHref,
  toE164,
  townOf,
} from "./sales-alerts";
import type { Lead, LeadActivity } from "./leads";
import type { QuoteRequest } from "./types";

const TODAY = "2026-11-09"; // a Monday
const at = (d: string, hhmm = "16:00") => `${d}T${hhmm}:00.000Z`;
const act = (d: string, type: LeadActivity["type"], extra: Partial<LeadActivity> = {}): LeadActivity => ({ ts: at(d), type, text: "x", ...extra });
const L = (id: string, p: Partial<Lead>): Lead => ({ id, name: id, phone: "", email: "", address: "", serviceType: "", source: "website", stage: "new", ...p }) as Lead;
const Q = (id: string, p: Partial<QuoteRequest>): QuoteRequest => ({ id, name: id, phone: "", createdAt: at("2026-11-01"), ...p }) as QuoteRequest;

describe("small helpers", () => {
  it("phones", () => {
    expect(toE164("(231) 555-0100")).toBe("+12315550100");
    expect(toE164("1-231-555-0100")).toBe("+12315550100");
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
    expect(toE164("555-0100")).toBeNull();
    expect(toE164("")).toBeNull();
    expect(telHref("231.555.0100")).toBe("tel:+12315550100");
    expect(telHref("")).toBe("");
  });

  it("town from an address", () => {
    expect(townOf("123 Main St, Traverse City, MI 49684")).toBe("Traverse City");
    expect(townOf("4410 Cherry Rd, Williamsburg, MI 49690, USA")).toBe("Williamsburg");
    expect(townOf("88 Bay St, Suttons Bay MI 49682")).toBe("Suttons Bay");
    expect(townOf("Kalkaska, Michigan")).toBe("Kalkaska");
    expect(townOf("123 Main St")).toBe("");
    expect(townOf("")).toBe("");
  });

  it("submitter: only someone other than the actor", () => {
    expect(submitterTo("Maddy@FiberNorth.com", "bill@fibernorth.com")).toBe("maddy@fibernorth.com");
    expect(submitterTo("bill@fibernorth.com", "BILL@fibernorth.com")).toBeNull();
    expect(submitterTo("", "bill@fibernorth.com")).toBeNull();
    expect(submitterTo("uid123", undefined)).toBeNull();
    expect(submitterTo("maddy@fibernorth.com")).toBe("maddy@fibernorth.com");
  });
});

describe("pickReps", () => {
  it("own fibernorth.com addresses, enabled, plus Bill always", () => {
    const reps = pickReps([
      { email: "Maddy@fibernorth.com", name: "Madison", phone: "231-555-0101" },
      { email: "admin@fibernorth.com", owner: true },
      { email: "webadmin@fibernorth.com", owner: true },
      { email: "someone@gmail.com" },
      { email: "gone@fibernorth.com", disabled: true },
    ]);
    expect(reps.map((r) => r.email)).toEqual(["bill@fibernorth.com", "maddy@fibernorth.com"]);
    expect(reps.find((r) => r.email === "bill@fibernorth.com")!.owner).toBe(true);
    expect(reps.find((r) => r.email === "maddy@fibernorth.com")).toMatchObject({ name: "Madison", phone: "231-555-0101", owner: false });
  });

  it("one entry per address, keeping a phone from either account", () => {
    const reps = pickReps([
      { email: "bill@fibernorth.com", owner: true, name: "Bill" },
      { email: "bill@fibernorth.com", owner: true, phone: "231-555-0199" },
    ]);
    expect(reps).toEqual([{ email: "bill@fibernorth.com", name: "Bill", phone: "231-555-0199", owner: true }]);
  });
});

describe("smsTargets", () => {
  const rep = (phone: string) => ({ email: "x@fibernorth.com", name: "", phone, owner: false });
  it("each rep's own phone; the office number only when someone has none", () => {
    expect(smsTargets([rep("231-555-0101"), rep("(231) 555-0102")], "231-555-0199")).toEqual(["+12315550101", "+12315550102"]);
    expect(smsTargets([rep("231-555-0101"), rep("")], "231-555-0199")).toEqual(["+12315550101", "+12315550199"]);
    expect(smsTargets([], "+12315550199")).toEqual(["+12315550199"]);
    expect(smsTargets([rep("")], "")).toEqual([]);
  });
  it("no duplicates, and a number already texted is skipped", () => {
    expect(smsTargets([rep("231-555-0199"), rep("")], "2315550199")).toEqual(["+12315550199"]);
    expect(smsTargets([rep("231-555-0199"), rep("231-555-0101")], "231-555-0199", ["231-555-0199"])).toEqual(["+12315550101"]);
  });
});

describe("messages", () => {
  it("new lead: name, phone, what they want, town, link, call within the hour", () => {
    const m = newLeadAlert({ id: "L 1", name: "Pat <b>Jones</b>", phone: "231-555-0100", wants: "Water line", town: "Traverse City", source: "Meta ads" });
    expect(m.sms).toBe(
      "New lead: Pat <b>Jones</b>, 231-555-0100, Water line in Traverse City. Call within the hour. https://fibernorth.com/admin/leads?lead=L%201"
    );
    expect(m.subject).toMatch(/Call within the hour/);
    expect(m.html).toContain('href="tel:+12315550100"');
    expect(m.html).toContain("Pat &lt;b&gt;Jones&lt;/b&gt;");
    expect(m.html).not.toContain("<b>Jones");
    expect(m.text).toContain("Town: Traverse City");
  });

  it("quote opened: who, how much, call now, with phone and links", () => {
    const m = quoteOpenedAlert({ customerName: "Pat Jones", total: 4250, phone: "231-555-0100", leadId: "L1", quoteId: "Q1", version: 1 });
    expect(m.subject).toBe("Pat Jones just opened their quote ($4,250), call now");
    expect(m.html).toContain("tel:+12315550100");
    expect(m.html).toContain("/admin/leads?lead=L1");
    expect(m.html).toContain("/admin/quotes/Q1");
  });

  it("submitter notices", () => {
    expect(submitterNotice({ kind: "approved", customerName: "Pat", total: 3000, quoteId: "Q1" }).subject).toBe("Your quote for Pat went out ($3,000)");
    const back = submitterNotice({ kind: "returned", customerName: "Pat", note: "Add the rock adder\nand 20 ft", quoteId: "Q1" });
    expect(back.text).toContain("Add the rock adder\nand 20 ft");
    expect(back.html).toContain("Add the rock adder<br>and 20 ft");
    const no = submitterNotice({ kind: "declined", customerName: "Pat", total: 3000, detail: "Too much" });
    expect(no.subject).toBe("Pat declined your quote ($3,000)");
    expect(no.text).toContain("Their reason: Too much");
    expect(submitterNotice({ kind: "accepted", customerName: "Pat", total: 3000, detail: 'signed "Pat"' }).text).toContain("accepted your quote ($3,000)");
  });
});

describe("buildMorningList", () => {
  const leads: Lead[] = [
    L("due-old", { name: "Old Due", stage: "contacted", nextAction: "Call back", nextActionAt: "2026-11-04", phone: "231-555-0001", address: "1 A St, Kingsley, MI 49649" }),
    L("due-today", { name: "Today Due", stage: "quoted", nextAction: "Text about the quote", nextActionAt: TODAY }),
    L("brand-new", { name: "Brand New", stage: "new" }),
    L("later", { name: "Later", stage: "contacted", nextAction: "Check back", nextActionAt: "2026-11-20" }),
    L("lost", { name: "Lost", stage: "lost", nextAction: "x", nextActionAt: "2026-11-01" }),
    L("opened", { name: "Opened", stage: "quoted", nextAction: "Opened the quote: call now", nextActionAt: TODAY, phone: "231-555-0002" }),
    L("opened-called", { name: "Called", stage: "quoted", nextAction: "Check back", nextActionAt: "2026-11-12", activity: [act("2026-11-08", "call")] }),
    L("won", { name: "Won Job", stage: "won", nextAction: "Schedule the job", nextActionAt: "2026-11-01" }),
    L("won-scheduled", { name: "Scheduled", stage: "won", nextAction: "Schedule the job", jobScheduledAt: "2026-11-20" }),
    L("secret", { name: "Secret", stage: "contacted", nextAction: "Call", nextActionAt: "2026-11-05", private: true }),
  ];
  const quotes: QuoteRequest[] = [
    Q("q-opened", { leadId: "opened", estimateStatus: "viewed", viewedAt: at("2026-11-07"), sentAt: at("2026-11-05"), expiresAt: at("2026-12-05"), sentTotal: 4000 }),
    Q("q-called", { leadId: "opened-called", estimateStatus: "viewed", viewedAt: at("2026-11-07"), sentAt: at("2026-11-05"), expiresAt: at("2026-12-05") }),
    Q("q-expired", { leadId: "due-today", estimateStatus: "viewed", viewedAt: at("2026-10-01"), sentAt: at("2026-10-01"), expiresAt: at("2026-10-31") }),
    Q("q-draft-old", { leadId: "due-old", estimateStatus: "draft", createdAt: at("2026-11-02") }),
    Q("q-draft-fresh", { estimateStatus: "draft", createdAt: at("2026-11-08") }),
    Q("q-draft-edge", { estimateStatus: "draft", createdAt: at("2026-11-06") }),
    Q("q-draft-lost", { leadId: "lost", estimateStatus: "draft", createdAt: at("2026-10-01") }),
    Q("q-draft-closed", { estimateStatus: "draft", createdAt: at("2026-10-01"), optionClosedAt: at("2026-10-02") }),
    Q("q-draft-pending", { estimateStatus: "draft", createdAt: at("2026-11-03"), approvalStatus: "pending" }),
    Q("q-draft-secret", { leadId: "secret", estimateStatus: "draft", createdAt: at("2026-11-03") }),
  ];
  const list = buildMorningList(leads, quotes, TODAY);

  it("opened quotes with no call or text since", () => {
    expect(list.opened.map((q) => q.quoteId)).toEqual(["q-opened"]);
    expect(list.opened[0]).toMatchObject({ leadId: "opened", name: "Opened", phone: "231-555-0002", total: 4000, day: "2026-11-07" });
  });

  it("an inbound text from them isn't a call", () => {
    const l = L("x", { stage: "quoted", activity: [act("2026-11-08", "text", { dir: "in" })] });
    const q = Q("qx", { leadId: "x", estimateStatus: "viewed", viewedAt: at("2026-11-07"), sentAt: at("2026-11-05"), expiresAt: at("2026-12-05") });
    expect(buildMorningList([l], [q], TODAY).opened).toHaveLength(1);
  });

  it("due leads, oldest first, brand-new on top, not repeating opened ones", () => {
    expect(list.due.map((l) => l.id)).toEqual(["brand-new", "due-old", "secret", "due-today"]);
    expect(list.due.find((l) => l.id === "due-old")).toMatchObject({ action: "Call back", at: "2026-11-04", phone: "231-555-0001", town: "Kingsley" });
  });

  it("drafts 3+ days old, newest first, not closed or on lost leads", () => {
    expect(list.drafts.map((q) => q.quoteId)).toEqual(["q-draft-edge", "q-draft-pending", "q-draft-secret", "q-draft-old"]);
    expect(list.drafts.find((q) => q.quoteId === "q-draft-pending")!.pending).toBe(true);
  });

  it("accepted, not scheduled", () => {
    expect(list.toSchedule.map((l) => l.id)).toEqual(["won"]);
  });

  it("Just mine leads only reach owners", () => {
    const sales = listFor(list, { owner: false });
    expect(sales.due.map((l) => l.id)).not.toContain("secret");
    expect(sales.drafts.map((q) => q.quoteId)).not.toContain("q-draft-secret");
    expect(listFor(list, { owner: true })).toBe(list);
  });

  it("the email: counts, sections, tel links, lead links, the whole-list line", () => {
    const m = morningEmail(list, { name: "Madison Smith" });
    expect(m.subject).toBe("Today 11/9: 1 opened quote to call, 4 due, 4 drafts, 1 to schedule");
    expect(m.html).toContain("Morning Madison");
    expect(m.html).toContain("everyone gets the whole list");
    expect(m.html).toContain('href="tel:+12315550001"');
    expect(m.html).toContain("https://fibernorth.com/admin/leads?lead=due-old");
    expect(m.html).toContain("(since 11/4)");
    expect(m.text).toContain("Opened the quote, not called yet (1)");
    expect(m.text).toContain("Accepted, not scheduled (1)");
  });

  it("a quiet day still says so", () => {
    const m = morningEmail(buildMorningList([], [], TODAY), { name: "" });
    expect(m.subject).toBe("Today 11/9: nothing due");
    expect(m.text).toContain("Nothing due today.");
  });
});

describe("cron auth", () => {
  it("with CRON_SECRET: only the bearer token", () => {
    expect(cronAuthorized({ authorization: "Bearer s3cret" }, "s3cret")).toBe(true);
    expect(cronAuthorized({ authorization: "Bearer nope" }, "s3cret")).toBe(false);
    expect(cronAuthorized({ authorization: "Bearer s3cre" }, "s3cret")).toBe(false);
    expect(cronAuthorized({ vercelCron: "1", userAgent: "vercel-cron/1.0" }, "s3cret")).toBe(false);
  });
  it("without one, on Vercel: only Vercel's cron call", () => {
    process.env.VERCEL = "1";
    try {
      expect(cronAuthorized({ vercelCron: "1" }, "")).toBe(true);
      expect(cronAuthorized({ userAgent: "vercel-cron/1.0" }, undefined)).toBe(true);
      expect(cronAuthorized({ userAgent: "curl/8" }, undefined)).toBe(false);
      expect(cronAuthorized({ authorization: "Bearer " }, undefined)).toBe(false);
      expect(cronAuthorized({}, undefined)).toBe(false);
    } finally {
      delete process.env.VERCEL;
    }
  });

  it("off Vercel, Vercel's cron headers count for nothing (anyone can send them)", () => {
    delete process.env.VERCEL;
    expect(cronAuthorized({ vercelCron: "1" }, "")).toBe(false);
    expect(cronAuthorized({ userAgent: "vercel-cron/1.0" }, undefined)).toBe(false);
  });
});

describe("once a day", () => {
  const now = Date.parse("2026-11-09T11:45:00Z");
  it("a new day sends", () => {
    expect(digestDecision(undefined, TODAY, now)).toEqual({ send: true, skip: [] });
    expect(digestDecision({ day: "2026-11-06", state: "done" }, TODAY, now)).toEqual({ send: true, skip: [] });
  });
  it("a repeat the same day sends nothing", () => {
    expect(digestDecision({ day: TODAY, state: "done", sentTo: ["a@fibernorth.com"] }, TODAY, now).send).toBe(false);
    expect(digestDecision({ day: TODAY, state: "sending", claimedAt: new Date(now - 60_000).toISOString() }, TODAY, now).send).toBe(false);
  });
  it("a run that died part way is finished later, only to those it missed", () => {
    const stale = new Date(now - DIGEST_LEASE_MS - 1000).toISOString();
    expect(digestDecision({ day: TODAY, state: "sending", claimedAt: stale, sentTo: ["bill@fibernorth.com"] }, TODAY, now)).toEqual({
      send: true,
      skip: ["bill@fibernorth.com"],
    });
  });
});
