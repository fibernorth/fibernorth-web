// Office notices and customer copies (audit-deliver G5, G4, G11): responses
// are checked, retried with an Idempotency-Key, recorded in notices/{id},
// and a failure lands on the lead's history and the dashboard list. Also the
// website quote form and job application: confirmation email, honeypot, and
// the notified flag. Real notification code; fetch and Firestore are fakes.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FakeDb } from "@/test/fakedb";

let db: FakeDb;

vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
}));
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakedb")).fakeFirestoreModule(() => db));
vi.mock("firebase-admin/storage", () => ({ getStorage: () => ({}) }));
vi.mock("@/services/firebase-admin", () => ({ initializeAdminApp: () => ({}) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ limited: false }), enforceAdminEmailLimit: async () => {} }));
vi.mock("@/lib/server-action-auth", () => ({
  verifyServerActionCaller: async () => ({ uid: "u1", email: "bill@fibernorth.com", owner: true }),
}));

import { noticeTiming } from "@/services/notice-delivery";
import { sendAcceptanceConfirmation, sendProposalEventNotice } from "@/services/notifications";
import { POST as quoteRoute } from "@/app/api/quote/route";
import { POST as applicationRoute } from "@/app/api/application/route";
import { listFailedNotices, markNoticeHandled } from "@/actions/notices";

type Call = { url: string; init: RequestInit & { headers: Record<string, string> } };
let calls: Call[];
let script: Array<number | "throw">;

const resp = (status: number) =>
  new Response(JSON.stringify(status < 300 ? { id: "re_ok" } : { message: "nope" }), { status });

beforeEach(async () => {
  db = (await import("@/test/fakedb")).makeDb();
  db.put("leads", "L1", { name: "Pat Jones", activity: [] });
  calls = [];
  script = [];
  noticeTiming.sleep = async () => {};
  process.env.RESEND_API_KEY = "re_test";
  process.env.NOTIFICATION_EMAIL_TO = "bill@fibernorth.com";
  process.env.SLACK_QUOTE_WEBHOOK_URL = "https://hooks.slack.com/services/T/B/X";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: Call["init"]) => {
      calls.push({ url, init });
      const next = script.length ? script.shift()! : 200;
      if (next === "throw") throw new Error("network down");
      return resp(next);
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const emailCalls = () => calls.filter((c) => c.url.includes("resend"));
const slackCalls = () => calls.filter((c) => c.url.includes("slack"));
const history = () => (db.get("leads", "L1")!.activity || []) as Array<{ text: string }>;
const accepted = (over: Record<string, unknown> = {}) => ({
  event: "accepted" as const,
  customerName: "Pat Jones",
  total: 4000,
  version: 2,
  leadId: "L1",
  detail: 'signed "Pat Jones"',
  eventId: "EV1",
  proposalToken: "T1",
  ...over,
});

describe("sendProposalEventNotice (G5)", () => {
  it("sends email with the event id as Idempotency-Key and Slack, and records success", async () => {
    const r = await sendProposalEventNotice(accepted());
    expect(r.ok).toBe(true);
    expect(emailCalls()).toHaveLength(1);
    expect(emailCalls()[0].init.headers["Idempotency-Key"]).toBe("EV1");
    expect(slackCalls()).toHaveLength(1);
    expect(db.get("notices", "EV1")).toMatchObject({
      kind: "accepted",
      proposal: "T1",
      lead: "L1",
      attempts: 2,
      emailOk: true,
      slackOk: true,
      ok: true,
      open: false,
      error: "",
    });
    expect(history()).toHaveLength(0);
  });

  it("retries a 500 and succeeds on the third try, same key every time", async () => {
    script = [200 /* slack */, 500, 502, 200];
    const r = await sendProposalEventNotice(accepted());
    expect(r.ok).toBe(true);
    expect(emailCalls()).toHaveLength(3);
    expect(new Set(emailCalls().map((c) => c.init.headers["Idempotency-Key"]))).toEqual(new Set(["EV1"]));
    expect(db.get("notices", "EV1")).toMatchObject({ emailOk: true, attempts: 4 });
  });

  it("Resend 500 three times and Slack 404: recorded as failed, lead history line, open on the dashboard", async () => {
    script = [404 /* slack, not retried */, 500, 500, 500];
    const r = await sendProposalEventNotice(accepted());
    expect(r.ok).toBe(false);
    expect(slackCalls()).toHaveLength(1);
    expect(emailCalls()).toHaveLength(3);
    const n = db.get("notices", "EV1")!;
    expect(n).toMatchObject({ emailOk: false, slackOk: false, ok: false, open: true, attempts: 4 });
    expect(n.error).toMatch(/Email service said 500/);
    expect(n.error).toMatch(/Slack said 404/);
    expect(history().some((a) => a.text.startsWith("Couldn't notify the office: "))).toBe(true);
    const list = await listFailedNotices("admin-token");
    expect(list.map((x) => x.id)).toEqual(["EV1"]);
    await markNoticeHandled("EV1", "admin-token");
    expect(await listFailedNotices("admin-token")).toEqual([]);
    expect(db.get("notices", "EV1")).toMatchObject({ open: false, handledBy: "bill@fibernorth.com" });
  });

  it("a network error is retried too", async () => {
    script = [200, "throw", "throw", 200];
    expect((await sendProposalEventNotice(accepted())).ok).toBe(true);
  });

  it("no API key is a failure for accept/decline; a missing Slack webhook is only a skip", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.SLACK_QUOTE_WEBHOOK_URL;
    const r = await sendProposalEventNotice(accepted());
    expect(r.ok).toBe(false);
    expect(db.get("notices", "EV1")).toMatchObject({ emailOk: false, slackOk: null, open: true });
  });

  it("a view only goes to Slack", async () => {
    const r = await sendProposalEventNotice(accepted({ event: "viewed", eventId: "V1" }));
    expect(r.ok).toBe(true);
    expect(emailCalls()).toHaveLength(0);
    expect(db.get("notices", "V1")).toMatchObject({ kind: "viewed", emailOk: null, slackOk: true });
  });
});

describe("sendAcceptanceConfirmation (G4)", () => {
  const data = {
    eventId: "EV1",
    proposalToken: "T1",
    leadId: "L1",
    to: "Pat@Example.com",
    customerName: "Pat <b>Jones</b>",
    acceptedName: "Pat <script>",
    acceptedAt: "2026-09-26T19:05:00.000Z",
    version: 2,
    total: 4000,
    address: "1 Main St\r\nBcc: x@y.z",
    url: "https://fibernorth.com/proposal/T1",
    contentHash: "abcdef0123456789".repeat(4),
    senderEmail: "chris@fibernorth.com",
  };

  it("from Bill, BCC the sender and Bill, escaped HTML, plain subject, Detroit time and fingerprint", async () => {
    const r = await sendAcceptanceConfirmation(data);
    expect(r.ok).toBe(true);
    const body = JSON.parse(String(emailCalls()[0].init.body));
    expect(body.from).toBe("Bill Gaylord, FiberNorth <bill@fibernorth.com>");
    expect(body.to).toEqual(["pat@example.com"]);
    expect(body.bcc).toEqual(["chris@fibernorth.com", "bill@fibernorth.com"]);
    expect(body.subject).not.toMatch(/[\r\n]/);
    expect(body.subject).toContain("$4,000.00");
    expect(body.html).toContain("Pat &lt;script&gt;");
    expect(body.html).not.toContain("<script>");
    expect(body.html).toContain("September 26, 2026 at 3:05 PM");
    expect(body.html).toContain("abcdef012345");
    expect(body.html).toContain("https://fibernorth.com/proposal/T1");
    expect(body.text).toContain("What happens next");
    expect(emailCalls()[0].init.headers["Idempotency-Key"]).toBe("EV1-customer");
    expect(db.get("notices", "EV1-customer")).toMatchObject({ kind: "customer-copy", ok: true });
  });

  it("no usable address: recorded as a failed notice with a lead line", async () => {
    const r = await sendAcceptanceConfirmation({ ...data, to: "" });
    expect(r.ok).toBe(false);
    expect(emailCalls()).toHaveLength(0);
    expect(db.get("notices", "EV1-customer")).toMatchObject({ open: true });
    expect(history().some((a) => a.text.startsWith("Couldn't email the customer a copy of their acceptance"))).toBe(true);
  });
});

describe("website quote form and job application (G11)", () => {
  const quoteReq = (body: Record<string, unknown>) =>
    quoteRoute(
      new Request("https://fibernorth.com/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    ) as unknown as Promise<{ status: number; body: Record<string, unknown> }>;
  const form = { name: "Pat Jones", phone: "231-555-0100", email: "pat@example.com", address: "1 Main St" };

  it("a filled honeypot gets 200 and nothing is saved or sent", async () => {
    const r = await quoteReq({ ...form, website: "http://spam" });
    expect(r.status).toBe(200);
    expect(db.data.quoteRequests?.size ?? 0).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("confirms to the customer, notifies the office, and marks the lead and quote notified", async () => {
    const r = await quoteReq({ ...form, website: "" });
    expect(r.status).toBe(200);
    const [qid, quote] = [...db.data.quoteRequests.entries()][0];
    const lead = db.get("leads", quote.leadId)!;
    expect(quote).toMatchObject({ notifiedOk: true, notifyError: "", confirmationOk: true });
    expect(lead).toMatchObject({ notifiedOk: true, confirmationOk: true });
    const confirm = emailCalls()
      .map((c) => JSON.parse(String(c.init.body)))
      .find((b) => b.to[0] === "pat@example.com");
    expect(confirm.text).toContain("Got your request. I'll give you a call within one business day.");
    expect(confirm.text).not.toMatch(/—/);
    expect(db.get("notices", `quote-${qid}`)).toMatchObject({ kind: "quote-form", ok: true });
  });

  it("when the office email fails, the lead says so and the notice is open", async () => {
    script = [500, 500, 500, 500, 500, 500, 500, 500];
    const r = await quoteReq(form);
    expect(r.status).toBe(200);
    const [qid, quote] = [...db.data.quoteRequests.entries()][0];
    expect(quote.notifiedOk).toBe(false);
    expect(quote.notifyError).toMatch(/said 500/);
    const lead = db.get("leads", quote.leadId)!;
    expect(lead.notifiedOk).toBe(false);
    expect((lead.activity as Array<{ text: string }>).some((a) => a.text.startsWith("Couldn't notify the office"))).toBe(true);
    expect(db.get("notices", `quote-${qid}`)).toMatchObject({ open: true });
  });

  it("job application: honeypot, confirmation and notified flag", async () => {
    const app = (body: Record<string, unknown>) =>
      applicationRoute(
        new Request("https://fibernorth.com/api/application", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      ) as unknown as Promise<{ status: number }>;
    const person = { name: "Sam Hill", phone: "231-555-0101", email: "sam@example.com" };
    expect((await app({ ...person, website: "x" })).status).toBe(200);
    expect(db.data.jobApplications?.size ?? 0).toBe(0);
    expect((await app(person)).status).toBe(200);
    const [id, saved] = [...db.data.jobApplications.entries()][0];
    expect(saved).toMatchObject({ notifiedOk: true, confirmationOk: true });
    expect(db.get("notices", `application-${id}`)).toMatchObject({ kind: "application", ok: true });
    expect(emailCalls().some((c) => JSON.parse(String(c.init.body)).subject === "We got your application")).toBe(true);
  });
});
