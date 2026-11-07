// The sending side of the sales alerts (notifications.ts), with Firebase and
// fetch mocked: nothing reaches Resend, Twilio or the live database.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const admin = vi.hoisted(() => ({
  users: [] as Array<{ uid: string; email: string; disabled?: boolean; customClaims?: Record<string, unknown> }>,
  profiles: {} as Record<string, Record<string, unknown>>,
  settings: {} as Record<string, unknown>,
  quotes: {} as Record<string, Record<string, unknown>>,
}));

vi.mock("@/services/firebase-admin", () => ({ initializeAdminApp: () => ({}) }));
vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ listUsers: async () => ({ users: admin.users, pageToken: undefined }) }),
}));
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({
    collection: (name: string) => ({
      get: async () => ({
        forEach: (fn: (d: { id: string; data: () => Record<string, unknown> }) => void) =>
          Object.entries(name === "adminUsers" ? admin.profiles : {}).forEach(([id, data]) => fn({ id, data: () => data })),
      }),
      doc: (id: string) => ({
        get: async () => {
          const data = name === "siteSettings" ? admin.settings : name === "quoteRequests" ? admin.quotes[id] : undefined;
          return { exists: !!data, get: (f: string) => data?.[f], data: () => data };
        },
      }),
    }),
  }),
}));
vi.mock("@/lib/admin-allowlist", () => ({
  ADMIN_UIDS: new Set(["bill-uid"]),
  ADMIN_EMAILS: new Set(["bill@fibernorth.com", "admin@fibernorth.com"]),
}));

import { sendNewLeadAlert, sendProposalEventNotice, sendQuoteOpenedAlert } from "./notifications";

type Call = { url: string; body: string };
let calls: Call[];
const realFetch = globalThis.fetch;
const ENV = { ...process.env };

beforeEach(() => {
  calls = [];
  globalThis.fetch = (async (url: string, init: { body: unknown }) => {
    calls.push({ url: String(url), body: String(init.body) });
    return new Response(JSON.stringify({ id: "x" }), { status: 200 });
  }) as unknown as typeof fetch;
  process.env.RESEND_API_KEY = "test";
  delete process.env.NOTIFICATION_EMAIL_TO;
  delete process.env.NOTIFICATION_SMS_TO;
  delete process.env.SLACK_QUOTE_WEBHOOK_URL;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
  admin.users = [
    { uid: "bill-uid", email: "bill@fibernorth.com" },
    { uid: "maddy-uid", email: "maddy@fibernorth.com", customClaims: { admin: true, role: "sales" } },
    { uid: "admin-uid", email: "admin@fibernorth.com" },
    { uid: "random", email: "random@fibernorth.com" }, // not an admin
  ];
  admin.profiles = { "bill-uid": { name: "Bill", phone: "231-555-0199" }, "maddy-uid": { name: "Madison", phone: "" } };
  admin.settings = { quoteSmsTo: "+12315550150" };
  admin.quotes = {};
});
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...ENV };
});

const emails = () => calls.filter((c) => c.url.includes("resend")).map((c) => JSON.parse(c.body));
const texts = () => calls.filter((c) => c.url.includes("twilio")).map((c) => Object.fromEntries(new URLSearchParams(c.body)));
const lead = { id: "L1", name: "Pat Jones", phone: "231-555-0100", wants: "Water line", town: "Kingsley", source: "Meta ads" };

describe("sendNewLeadAlert", () => {
  it("emails each rep; no Twilio, no texts", async () => {
    await sendNewLeadAlert(lead);
    expect(emails().map((e) => e.to)).toEqual([["bill@fibernorth.com"], ["maddy@fibernorth.com"]]);
    expect(emails()[0].subject).toMatch(/Pat Jones.*Call within the hour/);
    expect(texts()).toHaveLength(0);
  });

  it("with Twilio: each rep's own phone, the office number for a rep without one", async () => {
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM_NUMBER: "+12315550000" });
    await sendNewLeadAlert(lead);
    expect(texts().map((t) => t.To).sort()).toEqual(["+12315550150", "+12315550199"]);
    expect(texts()[0].Body).toMatch(/Call within the hour\. https:\/\/fibernorth\.com\/admin\/leads\?lead=L1$/);
  });

  it("the website form's own text already went to the office number: not twice", async () => {
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM_NUMBER: "+12315550000" });
    await sendNewLeadAlert(lead, { officeTexted: true });
    expect(texts().map((t) => t.To)).toEqual(["+12315550199"]);
  });

  it("a Just mine lead: owners only", async () => {
    await sendNewLeadAlert(lead, { privateLead: true });
    expect(emails().map((e) => e.to)).toEqual([["bill@fibernorth.com"]]);
  });

  it("never throws, even when sending fails", async () => {
    globalThis.fetch = (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    await expect(sendNewLeadAlert(lead)).resolves.toBeUndefined();
  });
});

describe("quote opened and answered", () => {
  it("opened: the submitter and Bill, one email", async () => {
    await sendQuoteOpenedAlert({ customerName: "Pat", total: 3000, phone: "231-555-0100", leadId: "L1", quoteId: "Q1", version: 1 }, ["maddy@fibernorth.com"]);
    expect(emails()).toHaveLength(1);
    expect(emails()[0].to).toEqual(["maddy@fibernorth.com", "bill@fibernorth.com"]);
    expect(emails()[0].subject).toBe("Pat just opened their quote ($3,000), call now");
  });

  it("declined: the office notice as before, plus the submitter with the reason", async () => {
    admin.quotes.Q1 = { submittedBy: "maddy@fibernorth.com" };
    await sendProposalEventNotice({ event: "declined", customerName: "Pat", total: 3000, version: 1, leadId: "L1", detail: "Too much", quoteId: "Q1" });
    const to = emails().map((e) => e.to);
    expect(to).toContainEqual(["maddy@fibernorth.com"]);
    expect(to).toContainEqual(["bill@fibernorth.net", "office@fibernorth.com"]);
    expect(emails().find((e) => e.to[0] === "maddy@fibernorth.com").text).toContain("Their reason: Too much");
  });

  it("no submitter, or a viewed event: no extra email", async () => {
    admin.quotes.Q1 = {};
    await sendProposalEventNotice({ event: "accepted", customerName: "Pat", total: 3000, version: 1, leadId: "L1", quoteId: "Q1" });
    expect(emails()).toHaveLength(1);
    await sendProposalEventNotice({ event: "viewed", customerName: "Pat", total: 3000, version: 1, leadId: "L1", quoteId: "Q1" });
    expect(emails()).toHaveLength(1);
  });
});
