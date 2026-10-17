// The Sales role, the approval queue and "Just mine" leads, run against the
// in-memory Firestore (src/test/fakedb.ts) with a caller per token:
// "owner" (Bill), "chris" (office staff on the approver list), "staff"
// (office, not an approver) and "sales".

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FakeDb } from "@/test/fakedb";

let db: FakeDb;

const CALLERS: Record<string, { uid: string; email: string; owner: boolean; role: "owner" | "staff" | "sales" }> = {
  owner: { uid: "bill", email: "bill@fibernorth.com", owner: true, role: "owner" },
  chris: { uid: "chris", email: "chris@fibernorth.com", owner: false, role: "staff" },
  staff: { uid: "pat", email: "pat@fibernorth.com", owner: false, role: "staff" },
  sales: { uid: "sam", email: "sam@fibernorth.com", owner: false, role: "sales" },
};

vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
}));
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakedb")).fakeFirestoreModule(() => db));
vi.mock("@/services/firebase-admin", () => ({ initializeAdminApp: () => ({}) }));
vi.mock("@/lib/server-action-auth", () => {
  const verifyServerActionCaller = async (t: string) => {
    const c = CALLERS[t];
    if (!c) throw new Error("Not authorized");
    return { ...c };
  };
  return {
    verifyServerActionCaller,
    verifyOwnerCaller: async (t: string) => {
      const c = await verifyServerActionCaller(t);
      if (!c.owner) throw new Error("Only an owner (Bill) can do that.");
      return c;
    },
  };
});
vi.mock("@/lib/api-auth", () => ({
  verifyApiAuth: async (req: Request) => {
    const c = CALLERS[(req.headers.get("Authorization") || "").replace("Bearer ", "")];
    return c ? { authorized: true, ...c } : { authorized: false, response: { status: 401, body: {} } };
  },
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ limited: false }), enforceAdminEmailLimit: async () => {} }));
vi.mock("@/services/notifications", () => ({
  sendProposalEmail: vi.fn(async () => ({ id: "re_1", bcc: [] })),
  sendApprovalRequestNotice: vi.fn(async () => {}),
}));
vi.mock("@/services/quickbooks", () => ({
  QboBusyError: class extends Error {},
  QboNotConnectedError: class extends Error {},
  sendQuoteToQuickBooks: vi.fn(async () => ({ docNumber: "1001", url: "", created: true, from: "accepted-proposal" })),
}));

import { approveAndSendQuote, sendBackQuote, sendProposal } from "@/actions/quotes";
import { previewLeadMerge, setLeadPrivate } from "@/actions/leads";
import { createDocument, updateSettings } from "@/actions/crud";
import { updatePageContent } from "@/actions/content";
import { getMyAccess, saveApprovalSettings } from "@/actions/access";
import { POST as qboSend } from "@/app/api/quickbooks/send/route";
import { GET as leadsRoute } from "@/app/api/admin/leads/route";
import { sendApprovalRequestNotice, sendProposalEmail } from "@/services/notifications";
import { sendQuoteToQuickBooks } from "@/services/quickbooks";
import type { LeadActivity } from "@/lib/leads";

const send = { to: "pat@example.com", message: "Here you go", scopeText: "Bore 100 ft", validDays: 30, sendEmail: true };
const quote = () => db.get("quoteRequests", "Q1")!;
const proposals = () => [...db.data.proposals?.values() ?? []];
const history = (): LeadActivity[] => (db.get("leads", "L1")!.activity || []) as LeadActivity[];

beforeEach(async () => {
  db = (await import("@/test/fakedb")).makeDb();
  vi.mocked(sendApprovalRequestNotice).mockClear();
  vi.mocked(sendProposalEmail).mockClear();
  vi.mocked(sendQuoteToQuickBooks).mockClear();
  db.put("leads", "L1", { name: "Pat Jones", email: "pat@example.com", stage: "walk_done", activity: [], createdAt: "2026-10-01T12:00:00.000Z" });
  db.put("quoteRequests", "Q1", {
    leadId: "L1",
    name: "Pat Jones",
    email: "pat@example.com",
    address: "1 Main St",
    serviceType: "fiber",
    quotedPrice: 5000,
    quoteLines: null,
    estimateStatus: "draft",
    version: 0,
    status: "contacted",
    createdAt: "2026-10-01T12:00:00.000Z",
  });
});

describe("a sales account in training mode (the default)", () => {
  it("Send goes to the approval queue: nothing to the customer, a history line, approvers told", async () => {
    const r = await sendProposal("Q1", send, "sales");
    expect(r).toMatchObject({ submitted: true, version: 1, url: "" });
    expect(proposals()).toHaveLength(0);
    expect(sendProposalEmail).not.toHaveBeenCalled();
    expect(quote()).toMatchObject({
      approvalStatus: "pending",
      approvalReason: "Training mode",
      submittedBy: "sam@fibernorth.com",
      pendingSend: { to: "pat@example.com", message: "Here you go", validDays: 30, sendEmail: true },
      estimateStatus: "draft",
      version: 0,
    });
    expect(history().some((a) => /^Quote v1 submitted for approval/.test(a.text))).toBe(true);
    expect(sendApprovalRequestNotice).toHaveBeenCalledWith(
      expect.objectContaining({ customerName: "Pat Jones", total: 5000, quoteId: "Q1", approvers: expect.arrayContaining(["chris@fibernorth.com"]) })
    );
  });

  it("an approver's Approve & send sends it as submitted, recording who approved it", async () => {
    await sendProposal("Q1", send, "sales");
    const r = await approveAndSendQuote("Q1", null, "chris");
    expect(r.version).toBe(1);
    const [p] = proposals();
    expect(p).toMatchObject({ sentBy: "sam@fibernorth.com", approvedBy: "chris@fibernorth.com", sentTo: "pat@example.com", scopeText: "Bore 100 ft" });
    expect(quote()).toMatchObject({ estimateStatus: "sent", version: 1, approvalStatus: "approved", approvedBy: "chris@fibernorth.com" });
    expect(quote().pendingSend).toBeUndefined();
    expect(sendProposalEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "pat@example.com", message: "Here you go", senderEmail: "sam@fibernorth.com" }));
    expect(history().some((a) => /^Quote v1 sent to pat@example.com: .*\(approved by chris@fibernorth.com\)/.test(a.text))).toBe(true);
  });

  it("Send back: the note is on the quote and the lead; the salesperson can submit again", async () => {
    await sendProposal("Q1", send, "sales");
    await expect(sendBackQuote("Q1", "  ", "owner")).rejects.toThrow(/note/);
    await sendBackQuote("Q1", "Add the rock adder", "owner");
    expect(quote()).toMatchObject({ approvalStatus: "returned", approvalNote: "Add the rock adder", returnedBy: "bill@fibernorth.com" });
    expect(history().some((a) => a.text === "Quote v1 sent back: Add the rock adder")).toBe(true);
    await sendProposal("Q1", send, "sales");
    expect(quote().approvalStatus).toBe("pending");
    expect(quote().approvalNote).toBeUndefined();
  });

  it("only approvers approve or send back; nobody else sends a waiting quote", async () => {
    await sendProposal("Q1", send, "sales");
    await expect(approveAndSendQuote("Q1", null, "sales")).rejects.toThrow(/approver/);
    await expect(approveAndSendQuote("Q1", null, "staff")).rejects.toThrow(/approver/);
    await expect(sendBackQuote("Q1", "no", "staff")).rejects.toThrow(/approver/);
    await expect(sendProposal("Q1", send, "staff")).rejects.toThrow(/waiting for approval/);
    expect(proposals()).toHaveLength(0);
  });

  it("an approver sending a waiting quote with plain Send counts as approving it", async () => {
    await sendProposal("Q1", send, "sales");
    await sendProposal("Q1", send, "owner");
    expect(quote()).toMatchObject({ estimateStatus: "sent", approvalStatus: "approved", approvedBy: "bill@fibernorth.com" });
  });

  it("a waiting quote can never go to QuickBooks, even once accepted", async () => {
    await sendProposal("Q1", send, "sales");
    db.put("quoteRequests", "Q1", { ...quote(), estimateStatus: "accepted" });
    const req = new Request("http://x/api/quickbooks/send", {
      method: "POST",
      headers: { Authorization: "Bearer sales" },
      body: JSON.stringify({ quoteId: "Q1" }),
    });
    const res = (await qboSend(req)) as unknown as { status: number; body: { error: string } };
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/waiting for approval/);
    expect(sendQuoteToQuickBooks).not.toHaveBeenCalled();
  });
});

describe("training mode off", () => {
  beforeEach(async () => {
    expect(await saveApprovalSettings({ approvers: ["chris@fibernorth.com"], trainingMode: false }, "owner")).toMatchObject({ ok: true });
  });

  it("a sales quote within the price rules goes straight to the customer", async () => {
    const r = await sendProposal("Q1", send, "sales");
    expect(r.submitted).toBeUndefined();
    expect(proposals()).toHaveLength(1);
    expect(quote().estimateStatus).toBe("sent");
  });

  it("a quote the price rules flagged still waits", async () => {
    db.put("quoteRequests", "Q1", { ...quote(), needsApprovalReason: "Under $1,250 per man-day" });
    const r = await sendProposal("Q1", send, "sales");
    expect(r.submitted).toBe(true);
    expect(quote()).toMatchObject({ approvalStatus: "pending", approvalReason: "Under $1,250 per man-day" });
  });

  it("only owners change the approval settings; getMyAccess reports them", async () => {
    expect(await saveApprovalSettings({ approvers: [], trainingMode: true }, "chris")).toMatchObject({ ok: false });
    expect(await getMyAccess("chris")).toMatchObject({ role: "staff", approver: true, trainingMode: false });
    expect(await getMyAccess("staff")).toMatchObject({ approver: false });
    expect(await getMyAccess("sales")).toMatchObject({ role: "sales", approver: false });
    expect((await getMyAccess("sales")).approvers).toBeUndefined();
  });
});

describe("what a sales account can't do on the server", () => {
  it("settings, website pages and CMS entries are refused", async () => {
    expect(await updateSettings("general", { phone: "1" }, "sales")).toEqual({ ok: false, error: "Not available on your account." });
    expect(await createDocument("blog", { title: "x" }, "sales")).toEqual({ ok: false, error: "Not available on your account." });
    expect(await updatePageContent("home", { heroTitle: "x" }, "sales")).toEqual({ ok: false, error: "Not available on your account." });
  });
  it("merging leads isn't available, not even the preview", async () => {
    db.put("leads", "L2", { name: "Pat J", stage: "new", activity: [] });
    await expect(previewLeadMerge("L1", "L2", "sales")).rejects.toThrow("Not available on your account.");
  });
});

describe("Just mine (private) leads", () => {
  it("only an owner marks one; the lead's quotes are marked too", async () => {
    expect(await setLeadPrivate("L1", true, "chris")).toMatchObject({ ok: false });
    expect(await setLeadPrivate("L1", true, "owner")).toEqual({ ok: true });
    expect(db.get("leads", "L1")!.private).toBe(true);
    expect(quote().leadPrivate).toBe(true);
    expect(history().some((a) => /^Marked just mine/.test(a.text))).toBe(true);
    expect(await setLeadPrivate("L1", false, "owner")).toEqual({ ok: true });
    expect(db.get("leads", "L1")!.private).toBeUndefined();
    expect(quote().leadPrivate).toBeUndefined();
  });

  it("the server's lead list leaves it out for everyone but owners", async () => {
    db.put("leads", "L1", { ...db.get("leads", "L1")!, private: true });
    db.put("leads", "L2", { name: "Open", stage: "new", activity: [], createdAt: "2026-10-02T12:00:00.000Z" });
    const ids = async (t: string) => {
      const res = (await leadsRoute(new Request("http://x/api/admin/leads", { headers: { Authorization: `Bearer ${t}` } }))) as unknown as {
        body: { leads: Array<{ id: string }> };
      };
      return res.body.leads.map((l) => l.id).sort();
    };
    expect(await ids("owner")).toEqual(["L1", "L2"]);
    expect(await ids("sales")).toEqual(["L2"]);
    expect(await ids("chris")).toEqual(["L2"]);
  });
});
