// Regression tests for the quote/proposal integrity fixes (audit, Sept 2026).
// They run the real proposal routes, quote server actions, Bore-ON push and
// lead import against an in-memory Firestore (src/test/fakedb.ts).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FakeDb } from "@/test/fakedb";

let db: FakeDb;

vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
}));
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakedb")).fakeFirestoreModule(() => db));
vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => {
      if (t !== "admin-token") throw new Error("bad token");
      return { uid: "u1", email: "bill@fibernorth.com" };
    },
  }),
}));
vi.mock("@/services/firebase-admin", () => ({ initializeAdminApp: () => ({}) }));
vi.mock("@/lib/admin-allowlist", () => ({ isAdminIdentity: () => true }));
vi.mock("@/lib/server-action-auth", () => ({ verifyServerActionCaller: async () => ({ uid: "u1", email: "bill@fibernorth.com" }) }));
vi.mock("@/lib/api-auth", () => ({ verifyApiAuth: async () => ({ authorized: true, uid: "u1" }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ limited: false }), enforceAdminEmailLimit: async () => {} }));
vi.mock("@/services/notifications", () => ({
  sendProposalEventNotice: vi.fn(async () => {}),
  sendProposalEmail: vi.fn(async () => ({ id: "re_1", bcc: [] })),
}));

import { POST as respondRoute } from "@/app/api/proposals/[token]/respond/route";
import { POST as viewRoute } from "@/app/api/proposals/[token]/view/route";
import { POST as borePush } from "@/app/api/bore-on/push/route";
import { POST as importRoute } from "@/app/api/admin/leads/import/route";
import {
  createQuoteForLead,
  deleteQuote,
  ensureQuoteForLead,
  saveQuoteWork,
  sendProposal,
  undoAcceptance,
} from "@/actions/quotes";
import { isExpired } from "@/lib/proposal-server";
import { endOfDetroitDay, workContentKey } from "@/lib/proposal";
import { addDays, todayISO, type Lead, type LeadActivity } from "@/lib/leads";
import { openQuotes } from "@/lib/sales-metrics";

const T_A = "A".repeat(32);
const T_B = "B".repeat(32);
const DAY = 86400000;
const today = () => todayISO();
const future = () => endOfDetroitDay(addDays(today(), 10));
const past = () => endOfDetroitDay(addDays(today(), -3));
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

type Res = { status: number; body: Record<string, unknown> };
const ctx = (t: string) => ({ params: Promise.resolve({ token: t }) });
const accept = (t: string, name = "Pat Jones") =>
  respondRoute(
    new Request(`http://x/api/proposals/${t}/respond`, { method: "POST", body: JSON.stringify({ action: "accept", name, agree: true }) }),
    ctx(t)
  ) as unknown as Promise<Res>;
const decline = (t: string) =>
  respondRoute(
    new Request(`http://x/api/proposals/${t}/respond`, { method: "POST", body: JSON.stringify({ action: "decline", reason: "too much" }) }),
    ctx(t)
  ) as unknown as Promise<Res>;
const view = (t: string, opts: { query?: string; auth?: string } = {}) =>
  viewRoute(
    new Request(`http://x/api/proposals/${t}/view${opts.query ?? ""}`, {
      method: "POST",
      headers: opts.auth ? { Authorization: `Bearer ${opts.auth}` } : {},
    }),
    ctx(t)
  ) as unknown as Promise<Res>;

const lead = (): Lead => db.get("leads", "L1") as Lead;
const history = (): LeadActivity[] => lead().activity || [];

/** A lead with two job sites: A sent first ($3,000), B sent last ($9,000), badge on B. */
function twoSites(opts: { leadExtra?: Partial<Lead>; aExtra?: Record<string, unknown>; pA?: Record<string, unknown> } = {}) {
  db.put("leads", "L1", {
    name: "Contractor Co",
    stage: "quoted",
    quoteId: "QB",
    quoteCount: 2,
    activity: [],
    quote: { status: "sent", total: 9000, version: 1, sentAt: ago(2), expiresAt: future(), url: `https://fibernorth.com/proposal/${T_B}` },
    ...opts.leadExtra,
  });
  db.put("quoteRequests", "QA", {
    leadId: "L1",
    address: "1 Site A",
    proposalId: T_A,
    estimateStatus: "sent",
    version: 1,
    sentAt: ago(5),
    expiresAt: future(),
    sentTotal: 3000,
    quotedPrice: 3000,
    createdAt: ago(20),
    ...opts.aExtra,
  });
  db.put("quoteRequests", "QB", {
    leadId: "L1",
    address: "2 Site B",
    proposalId: T_B,
    estimateStatus: "sent",
    version: 1,
    sentAt: ago(2),
    expiresAt: future(),
    sentTotal: 9000,
    quotedPrice: 9000,
    createdAt: ago(10),
  });
  const prop = (quoteId: string, total: number) => ({
    quoteId,
    leadId: "L1",
    version: 1,
    status: "sent",
    totals: { work: total, materials: 0, tax: 0, total },
    expiresAt: future(),
    sentAt: ago(5),
    customer: { name: "Contractor Co", email: "", phone: "", address: "" },
  });
  db.put("proposals", T_A, { ...prop("QA", 3000), ...opts.pA });
  db.put("proposals", T_B, prop("QB", 9000));
}

beforeEach(async () => {
  db = (await import("@/test/fakedb")).makeDb();
});

describe("several quotes on one lead: the badge describes the right quote", () => {
  it("accepting site A leaves site B's open badge alone, and the badge names its quote", async () => {
    twoSites();
    const r = await accept(T_A);
    expect(r.status).toBe(200);
    expect(db.get("quoteRequests", "QA")!.estimateStatus).toBe("accepted");
    expect(db.get("quoteRequests", "QB")!.estimateStatus).toBe("sent");
    expect(lead().stage).toBe("won");
    expect(lead().saleAmount).toBe("3000.00");
    // B is still out with the customer: the badge stays B's, with B's total.
    expect(lead().quote).toMatchObject({ quoteId: "QB", proposalId: T_B, status: "sent", total: 9000 });
    expect(lead().quoteId).toBe("QB");
  });

  it("the customer first opening site A doesn't flip site B's badge to viewed", async () => {
    twoSites();
    await view(T_A);
    expect(db.get("quoteRequests", "QA")!.estimateStatus).toBe("viewed");
    expect(lead().quote).toMatchObject({ quoteId: "QB", status: "sent" });
    expect(history().map((a) => a.text)).toContain("Customer opened quote v1");
  });

  it("a declined site A leaves B's badge and doesn't put a quote call on a won lead", async () => {
    twoSites({ leadExtra: { stage: "won", nextAction: "Schedule the job", nextActionAt: "2026-09-20" } });
    const r = await decline(T_A);
    expect(r.status).toBe(200);
    expect(lead().quote).toMatchObject({ quoteId: "QB", status: "sent" });
    expect(lead().nextAction).toBe("Schedule the job");
  });

  it("'Quote another site' keeps the sent quote's badge instead of replacing it with a draft", async () => {
    twoSites();
    db.data.quoteRequests.delete("QB");
    db.data.proposals.delete(T_B);
    db.put("leads", "L1", { ...lead(), quoteId: "QA", quoteCount: 1, quote: { status: "sent", total: 3000, version: 1 } });
    const { quoteId } = await createQuoteForLead("L1", { address: "3 Site C" }, "admin-token");
    expect(db.get("quoteRequests", quoteId)).toMatchObject({ leadId: "L1", estimateStatus: "draft" });
    expect(lead().quote).toMatchObject({ quoteId: "QA", status: "sent", total: 3000 });
    expect(lead().quoteId).toBe("QA");
    expect(lead().quoteCount).toBe(2);
  });

  it("sending site A again points the lead (quoteId and badge) at A, with the sent total and version stored", async () => {
    twoSites({ aExtra: { quotedPrice: 3500, quoteLines: null, mapAnnotation: null } });
    await sendProposal("QA", { to: "", message: "", scopeText: "Bore it", validDays: 30, sendEmail: false }, "admin-token");
    const qa = db.get("quoteRequests", "QA")!;
    expect(qa).toMatchObject({ version: 2, sentTotal: 3500, sentVersion: 2 });
    // Good through the whole last day, Detroit time.
    expect(qa.expiresAt).toBe(endOfDetroitDay(addDays(today(), 30)));
    expect(db.get("proposals", T_A)!.status).toBe("superseded");
    expect(lead().quoteId).toBe("QA");
    expect(lead().quote).toMatchObject({ quoteId: "QA", proposalId: qa.proposalId, status: "sent", total: 3500, version: 2 });
  });
});

describe("accepting a quote", () => {
  it("leaves a hand-typed sale amount alone and logs that it may need updating", async () => {
    twoSites({ leadExtra: { saleAmount: "$5,000", saleAmountNum: 5000 } });
    await accept(T_A);
    expect(lead().saleAmount).toBe("$5,000");
    expect(lead().saleAmountNum).toBe(5000);
    expect(history().some((a) => a.type === "system" && /^Sale may need updating/.test(a.text))).toBe(true);
  });

  it("updates a sale amount the system wrote (the accepted total so far)", async () => {
    twoSites({ leadExtra: { stage: "won", saleAmount: "3000.00", saleAmountNum: 3000 } });
    db.put("proposals", T_A, { ...db.get("proposals", T_A)!, status: "accepted" });
    db.put("quoteRequests", "QA", { ...db.get("quoteRequests", "QA")!, estimateStatus: "accepted" });
    await accept(T_B);
    expect(lead().saleAmount).toBe("12000.00");
    expect(lead().saleAmountNum).toBe(12000);
  });

  it("on a lead marked not a lead: reopens it as won and clears the disqualify fields", async () => {
    twoSites({ leadExtra: { stage: "not_a_lead", disqualifyReason: "spam", disqualifiedAt: "2026-09-01" } });
    await accept(T_A);
    expect(lead()).toMatchObject({ stage: "won", disqualifyReason: "", disqualifiedAt: "" });
    expect(history().some((a) => /^Reopened by acceptance/.test(a.text))).toBe(true);
  });

  it("a declined proposal can't be accepted after its good-through date", async () => {
    twoSites({ pA: { status: "declined", expiresAt: past() } });
    expect(isExpired({ status: "declined", expiresAt: past() })).toBe(true);
    const r = await accept(T_A);
    expect(r.status).toBe(409);
    expect(String(r.body.error)).toMatch(/expired/);
    expect(db.get("proposals", T_A)!.status).toBe("declined");
  });

  it("a customer who declined can still accept while the quote is good (their choice)", async () => {
    twoSites({ pA: { status: "declined" }, aExtra: { estimateStatus: "declined" } });
    const r = await accept(T_A);
    expect(r.status).toBe(200);
    expect(db.get("proposals", T_A)!.status).toBe("accepted");
  });
});

describe("deleting a quote", () => {
  it("voids its links, deletes it, and rebuilds the lead's quote fields from what's left", async () => {
    twoSites();
    await deleteQuote("QB", "admin-token");
    expect(db.get("quoteRequests", "QB")).toBeUndefined();
    expect(db.get("proposals", T_B)!.status).toBe("void");
    expect(lead().quoteId).toBe("QA");
    expect(lead().quoteCount).toBe(1);
    expect(lead().quote).toMatchObject({ quoteId: "QA", status: "sent", total: 3000 });
    expect(history().some((a) => a.type === "system" && /deleted/.test(a.text))).toBe(true);
  });

  it("the last quote gone: the lead has no quote fields left", async () => {
    twoSites();
    await deleteQuote("QB", "admin-token");
    await deleteQuote("QA", "admin-token");
    expect(lead().quoteId).toBeUndefined();
    expect(lead().quote).toBeUndefined();
    expect(lead().quoteCount).toBe(0);
  });

  it("refuses an accepted quote (undo the acceptance first)", async () => {
    twoSites({ aExtra: { estimateStatus: "accepted" } });
    await expect(deleteQuote("QA", "admin-token")).rejects.toThrow(/Undo the acceptance/);
    expect(db.get("quoteRequests", "QA")).toBeDefined();
  });

  it("the customer's old link says the quote is gone instead of a 500", async () => {
    twoSites();
    await deleteQuote("QA", "admin-token");
    const r = await accept(T_A);
    expect(r.status).toBe(410);
    expect(String(r.body.error)).toMatch(/no longer available/);
  });

  it("a quote deleted the old way (proposal still live) also answers 410, not 500", async () => {
    twoSites();
    db.data.quoteRequests.delete("QA");
    const before = structuredClone(lead());
    const r = await accept(T_A);
    expect(r.status).toBe(410);
    const v = await view(T_A);
    expect(v.status).toBe(200);
    expect(lead()).toEqual(before);
  });

  it("opening a lead whose quoteId points at a deleted quote finds its other quotes, not a new count of 1", async () => {
    twoSites();
    db.data.quoteRequests.delete("QB");
    db.put("quoteRequests", "QC", { leadId: "L1", estimateStatus: "draft", version: 0, createdAt: ago(1) });
    const { quoteId } = await ensureQuoteForLead("L1", "admin-token");
    expect(quoteId).toBe("QA"); // the sent one
    expect(lead().quoteCount).toBe(2);
    expect(lead().quoteId).toBe("QA");
  });
});

describe("undoing an acceptance", () => {
  it("another site still accepted: stays won with its next step; only a system line is logged", async () => {
    twoSites({
      leadExtra: { stage: "won", nextAction: "Schedule the job", nextActionAt: "2026-09-20", saleAmount: "12000.00", saleAmountNum: 12000 },
      aExtra: { estimateStatus: "accepted" },
      pA: { status: "accepted" },
    });
    db.put("quoteRequests", "QB", { ...db.get("quoteRequests", "QB")!, estimateStatus: "accepted", acceptedAt: ago(1) });
    db.put("proposals", T_B, { ...db.get("proposals", T_B)!, status: "accepted" });
    await undoAcceptance("QA", "admin-token");
    expect(lead().stage).toBe("won");
    expect(lead().nextAction).toBe("Schedule the job");
    expect(lead().saleAmount).toBe("9000.00");
    const undo = history().find((a) => /undone/.test(a.text))!;
    expect(undo.type).toBe("system");
    // The badge: the only open quote is A again.
    expect(lead().quote).toMatchObject({ quoteId: "QA", status: "sent" });
  });

  it("the only accepted site: back to quoted, job-done cleared, hand-set follow-up, referral fee flagged", async () => {
    twoSites({
      leadExtra: {
        stage: "won",
        jobDoneAt: "2026-09-22",
        referralFeeStatus: "paid",
        saleAmount: "3000.00",
        nextActionAuto: true,
        quote: { status: "accepted", total: 3000, version: 1 },
      },
      aExtra: { estimateStatus: "accepted", acceptedAt: ago(1) },
      pA: { status: "accepted" },
    });
    db.data.quoteRequests.delete("QB");
    db.data.proposals.delete(T_B);
    await undoAcceptance("QA", "admin-token");
    expect(lead()).toMatchObject({ stage: "quoted", jobDoneAt: "", nextAction: "Follow up on quote", nextActionAuto: false, saleAmount: "" });
    expect(history().some((a) => /referral fee/.test(a.text))).toBe(true);
    expect(lead().quote).toMatchObject({ quoteId: "QA", status: "sent" });
  });
});

describe("customer views", () => {
  it("the office preview (?preview=1) and a request with an admin token are not customer views", async () => {
    twoSites();
    await view(T_B, { query: "?preview=1" });
    await view(T_B, { auth: "admin-token" });
    expect(db.get("proposals", T_B)!.viewCount).toBeUndefined();
    expect(db.get("proposals", T_B)!.status).toBe("sent");
    expect(lead().quote).toMatchObject({ status: "sent" });
    // A bad token is just a customer.
    await view(T_B, { auth: "nope" });
    expect(db.get("proposals", T_B)!.status).toBe("viewed");
  });

  it("opening an expired quote doesn't flip the quote or the lead to viewed", async () => {
    twoSites();
    for (const [c, id] of [["proposals", T_B], ["quoteRequests", "QB"]] as const) db.put(c, id, { ...db.get(c, id)!, expiresAt: past() });
    await view(T_B);
    expect(db.get("proposals", T_B)!.status).toBe("sent");
    expect(db.get("quoteRequests", "QB")!.estimateStatus).toBe("sent");
    expect(lead().quote).toMatchObject({ status: "sent" });
    expect(history().map((a) => a.text)).toContain("Customer opened quote v1 (expired)");
  });
});

describe("workbench saves", () => {
  it("won't write over a quote someone else changed since the screen loaded it", async () => {
    db.put("quoteRequests", "Q1", { quotedPrice: 1000, quoteLines: null, mapAnnotation: null, scopeText: "", status: "quoted" });
    const loaded = workContentKey(db.get("quoteRequests", "Q1")!);
    // Chris saves $1,200 from his screen.
    const chris = await saveQuoteWork("Q1", { quotedPrice: 1200, quoteLines: null, mapAnnotation: null, scopeText: "", expectKey: loaded }, "t");
    expect(chris.wrote).toBe(true);
    // Bill's screen still has the old quote loaded.
    const bill = await saveQuoteWork("Q1", { quotedPrice: 1500, quoteLines: null, mapAnnotation: null, scopeText: "", expectKey: loaded }, "t");
    expect(bill).toMatchObject({ wrote: false, conflict: true });
    expect(db.get("quoteRequests", "Q1")!.quotedPrice).toBe(1200);
    // After a reload (the new key) the save goes through.
    const again = await saveQuoteWork("Q1", { quotedPrice: 1500, quoteLines: null, mapAnnotation: null, scopeText: "", expectKey: chris.key }, "t");
    expect(again.wrote).toBe(true);
  });
});

describe("Bore-ON push", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("logs on the quote's own lead (not the lead whose quoteId matches), appended, as a system line", async () => {
    twoSites({ leadExtra: { activity: [{ ts: ago(1), type: "call", text: "Talked" }] } });
    const pt = (lat: number) => ({ lat, lng: -85.39 });
    db.put("quoteRequests", "QA", {
      ...db.get("quoteRequests", "QA")!,
      mapAnnotation: { center: pt(44.76), zoom: 18, markers: [], polygons: [], paths: [{ type: "bore-path", points: [pt(44.763), pt(44.764)], color: "#fff" }], runFeet: 364 },
    });
    db.put("integrationSecrets", "boreOn", { baseUrl: "https://bore.example", apiKey: "k" });
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ designId: "D1", url: "https://bore.example/d/1" }), { status: 200 })) as typeof fetch;
    const r = (await borePush(new Request("http://x/api/bore-on/push", { method: "POST", body: JSON.stringify({ quoteId: "QA" }) }))) as unknown as Res;
    expect(r.status).toBe(200);
    const acts = history();
    expect(acts[0]).toMatchObject({ type: "call", text: "Talked" });
    expect(acts.at(-1)).toMatchObject({ type: "system", text: "Design sent to Bore-ON" });
  });
});

describe("importing website quotes as leads", () => {
  it("links the quote back to its new lead and carries the quote's state (accepted = won, with the sale)", async () => {
    db.put("quoteRequests", "QW", {
      name: "Web Person",
      status: "quoted",
      estimateStatus: "accepted",
      version: 1,
      proposalId: T_A,
      sentAt: "2026-08-01T15:00:00.000Z",
      acceptedAt: "2026-08-05T15:00:00.000Z",
      sentTotal: 4000,
      createdAt: "2026-07-30T15:00:00.000Z",
    });
    db.put("quoteRequests", "QS", { name: "Sent Person", status: "quoted", estimateStatus: "viewed", version: 1, proposalId: T_B, sentAt: ago(3), expiresAt: future(), sentTotal: 2500, createdAt: ago(5) });
    // A dry run first: counts, nothing written. Then the confirmed run.
    const dry = (await importRoute(new Request("http://x", { method: "POST", body: JSON.stringify({ source: "quotes" }) }))) as unknown as Res;
    expect(dry.body).toMatchObject({ dryRun: true, counts: { create: 2, update: 0 } });
    expect(db.data.leads?.size ?? 0).toBe(0);
    const r = (await importRoute(
      new Request("http://x", { method: "POST", body: JSON.stringify({ source: "quotes", confirm: true, expect: dry.body.counts }) })
    )) as unknown as Res;
    expect(r.body.created).toBe(2);
    const leads = [...db.data.leads.entries()];
    const won = leads.find(([, l]) => l.quoteId === "QW")!;
    expect(db.get("quoteRequests", "QW")!.leadId).toBe(won[0]);
    expect(won[1]).toMatchObject({ stage: "won", saleAmount: "4000.00", saleAmountNum: 4000, quoteCount: 1 });
    expect(won[1].quote).toMatchObject({ quoteId: "QW", status: "accepted", total: 4000 });
    expect(won[1].activity.some((a: LeadActivity) => a.type === "stage" && a.ts.startsWith("2026-08-05"))).toBe(true);
    const quoted = leads.find(([, l]) => l.quoteId === "QS")!;
    expect(db.get("quoteRequests", "QS")!.leadId).toBe(quoted[0]);
    expect(quoted[1]).toMatchObject({ stage: "quoted", nextAction: "Follow up on quote" });
    expect(quoted[1].quote).toMatchObject({ quoteId: "QS", status: "viewed", total: 2500 });
  });
});

describe("dashboard open quotes", () => {
  it("counts a second site's open quote on a won lead", () => {
    const base = { id: "l", name: "n", phone: "", email: "", address: "", serviceType: "", source: "website" };
    const won = { ...base, stage: "won", quote: { status: "sent", total: 2000, version: 1, sentAt: ago(2), expiresAt: future() } } as Lead;
    const accepted = { ...base, stage: "won", quote: { status: "accepted", total: 5000, version: 1, sentAt: ago(9) } } as Lead;
    const lost = { ...base, stage: "lost", quote: { status: "sent", total: 700, version: 1, sentAt: ago(2), expiresAt: future() } } as Lead;
    expect(openQuotes([won, accepted, lost], today())).toMatchObject({ count: 1, dollars: 2000 });
  });
});
