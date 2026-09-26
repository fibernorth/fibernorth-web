// Inbound safeguards (audit-deliver G4, G6, G12, G13): acceptance is bound to
// what the customer saw and leaves an add-only evidence record, the customer
// gets a copy, an accepted quote can't be re-priced, the respond route only
// takes small same-site JSON, and a Bore-ON delivery is applied once.
// Routes and actions run against the in-memory Firestore (src/test/fakedb.ts).

import { describe, it, expect, vi, beforeEach } from "vitest";
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
vi.mock("@/lib/admin-allowlist", () => ({ isAdminIdentity: () => true, isOwnerIdentity: () => true, OWNER_ONLY_MESSAGE: "Owner only" }));
vi.mock("@/lib/server-action-auth", () => ({
  verifyServerActionCaller: async () => ({ uid: "u1", email: "bill@fibernorth.com", owner: true }),
  verifyOwnerCaller: async () => ({ uid: "u1", email: "bill@fibernorth.com", owner: true }),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ limited: false }), enforceAdminEmailLimit: async () => {} }));
vi.mock("@/services/notifications", () => ({
  sendProposalEventNotice: vi.fn(async () => ({ ok: true, error: "" })),
  sendAcceptanceConfirmation: vi.fn(async () => ({ ok: true, error: "" })),
  sendProposalEmail: vi.fn(async () => ({ id: "re_1", bcc: [] })),
}));
vi.mock("@/lib/bore-on/signature", () => ({
  SIGNATURE_HEADER: "x-boreon-signature",
  TIMESTAMP_HEADER: "x-boreon-timestamp",
  verifyBoreOnSignature: () => ({ ok: true }),
}));
vi.mock("@/services/bore-on", () => ({
  loadBoreOnSecrets: async () => ({ webhookSecret: "s" }),
  fetchBoreOnReadback: vi.fn(async () => ({ ok: true })),
  applyBoreOnReadback: vi.fn(async () => ({ repriced: true })),
}));

import { POST as respondRoute } from "@/app/api/proposals/[token]/respond/route";
import { POST as boreOnWebhook } from "@/app/api/bore-on/webhook/route";
import { saveQuoteWork } from "@/actions/quotes";
import { sendAcceptanceConfirmation, sendProposalEventNotice } from "@/services/notifications";
import { applyBoreOnReadback, fetchBoreOnReadback } from "@/services/bore-on";
import { proposalContentHash } from "@/lib/proposal-hash";
import { shownHash, QUOTE_CHANGED } from "@/lib/proposal-evidence";
import {
  acceptConsentText,
  DECLINE_CONSENT_TEXT,
  isArchivedAcceptance,
  nameLooselyMatches,
  QUOTE_ACCEPTED_LOCKED,
} from "@/lib/proposal-consent";
import { endOfDetroitDay } from "@/lib/proposal";
import { addDays, todayISO, type LeadActivity } from "@/lib/leads";
import type { Proposal } from "@/lib/types";

const T = "T".repeat(32);
const DAY = 86400000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();
type Res = { status: number; body: Record<string, unknown> };
const ctx = (t: string) => ({ params: Promise.resolve({ token: t }) });

function seed(extra: Partial<Proposal> = {}) {
  db.put("leads", "L1", { name: "Pat Jones", stage: "quoted", quoteId: "Q1", activity: [] });
  db.put("quoteRequests", "Q1", {
    leadId: "L1",
    proposalId: T,
    estimateStatus: "sent",
    version: 2,
    quotedPrice: 4000,
    sentTotal: 4000,
    expiresAt: endOfDetroitDay(addDays(todayISO(), 10)),
    createdAt: ago(10),
  });
  db.put("proposals", T, {
    quoteId: "Q1",
    leadId: "L1",
    version: 2,
    status: "sent",
    customer: { name: "Pat Jones", email: "pat@example.com", phone: "", address: "1 Main St" },
    scopeText: "Bore 150 ft",
    terms: ["Net 30"],
    lines: [{ description: "Bore", kind: "work", qty: 1, unitPrice: 4000 }],
    totals: { work: 4000, materials: 0, tax: 0, total: 4000 },
    annotation: null,
    sentAt: ago(2),
    sentBy: "chris@fibernorth.com",
    sentTo: "pat@example.com",
    expiresAt: endOfDetroitDay(addDays(todayISO(), 10)),
    ...extra,
  });
}

const shown = () => {
  const p = db.get("proposals", T) as Proposal;
  return { version: p.version, total: p.totals.total, contentHash: shownHash(p) };
};

function req(body: unknown, headers: Record<string, string> = { "Content-Type": "application/json" }) {
  return respondRoute(
    new Request(`https://fibernorth.com/api/proposals/${T}/respond`, {
      method: "POST",
      headers: { "user-agent": "TestBrowser/1", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    ctx(T)
  ) as unknown as Promise<Res>;
}
const acceptBody = (over: Record<string, unknown> = {}) => ({
  action: "accept",
  name: "Pat Jones",
  agree: true,
  ...shown(),
  consentText: acceptConsentText(4000),
  ...over,
});
const events = () => [...(db.data[`proposals/${T}/events`]?.values() ?? [])];
const history = (): LeadActivity[] => (db.get("leads", "L1")!.activity || []) as LeadActivity[];

beforeEach(async () => {
  db = (await import("@/test/fakedb")).makeDb();
  vi.mocked(sendAcceptanceConfirmation).mockClear();
  vi.mocked(sendProposalEventNotice).mockClear();
});

describe("acceptance is bound to what the customer saw (G4)", () => {
  it("records add-only evidence: consent words, version, total, hash, name, ip, browser", async () => {
    seed();
    const r = await req(acceptBody());
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, status: "accepted", acceptedName: "Pat Jones" });
    const ev = events();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      type: "accepted",
      name: "Pat Jones",
      nameMatches: true,
      consentText: "I approve this quote for $4,000.00 and agree to the terms above.",
      version: 2,
      total: 4000,
      contentHash: proposalContentHash(db.get("proposals", T) as Proposal),
      hashStoredAtSend: false,
      ua: "TestBrowser/1",
    });
    expect(typeof ev[0].ip).toBe("string");
    // The proposal keeps its old fields for the screens that read them.
    expect(db.get("proposals", T)).toMatchObject({ status: "accepted", acceptedName: "Pat Jones" });
  });

  it("uses the hash stored at send when there is one", async () => {
    seed({ contentHash: "a".repeat(64) });
    expect((await req(acceptBody({ contentHash: proposalContentHash(db.get("proposals", T) as Proposal) }))).status).toBe(409);
    const r = await req(acceptBody({ contentHash: "a".repeat(64) }));
    expect(r.status).toBe(200);
    expect(events()[0]).toMatchObject({ contentHash: "a".repeat(64), hashStoredAtSend: true });
  });

  it.each([
    ["a different total", { total: 3999 }],
    ["a different version", { version: 1 }],
    ["a different hash", { contentHash: "b".repeat(64) }],
    ["different consent words", { consentText: "I approve this quote for $3,999.00 and agree to the terms above." }],
  ])("refuses %s with 409 'This quote changed' and records nothing", async (_label, over) => {
    seed();
    const r = await req(acceptBody(over));
    expect(r.status).toBe(409);
    expect(r.body.error).toBe(QUOTE_CHANGED);
    expect(events()).toHaveLength(0);
    expect(db.get("proposals", T)!.status).toBe("sent");
    expect(db.get("quoteRequests", "Q1")!.estimateStatus).toBe("sent");
  });

  it("refuses a page from before the evidence fields (asks for a reload)", async () => {
    seed();
    const r = await req({ action: "accept", name: "Pat Jones", agree: true });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe(QUOTE_CHANGED);
  });

  it("refuses a version that isn't the quote's current one", async () => {
    seed();
    db.put("quoteRequests", "Q1", { ...db.get("quoteRequests", "Q1")!, proposalId: "X".repeat(32) });
    expect((await req(acceptBody())).status).toBe(409);
    expect(events()).toHaveLength(0);
  });

  it("a decline also needs the shown content and leaves an evidence record", async () => {
    seed();
    expect((await req({ action: "decline", reason: "price", ...shown(), consentText: "Nope" })).status).toBe(409);
    const r = await req({ action: "decline", reason: "price", ...shown(), consentText: DECLINE_CONSENT_TEXT });
    expect(r.status).toBe(200);
    expect(events()[0]).toMatchObject({ type: "declined", reason: "price", consentText: "Decline quote", total: 4000 });
  });

  it("a second accept is refused and adds no second record", async () => {
    seed();
    await req(acceptBody());
    const r = await req(acceptBody());
    expect(r.status).toBe(409);
    expect(events()).toHaveLength(1);
  });
});

describe("the customer's copy and Bill's notice (G4, G5)", () => {
  it("emails the customer a confirmation and notifies the office with the event id", async () => {
    seed();
    await req(acceptBody());
    const eventId = [...db.data[`proposals/${T}/events`].keys()][0];
    expect(sendAcceptanceConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId,
        proposalToken: T,
        to: "pat@example.com",
        acceptedName: "Pat Jones",
        total: 4000,
        version: 2,
        address: "1 Main St",
        url: `https://fibernorth.com/proposal/${T}`,
        senderEmail: "chris@fibernorth.com",
      })
    );
    expect(sendProposalEventNotice).toHaveBeenCalledWith(expect.objectContaining({ event: "accepted", eventId, proposalToken: T }));
  });

  it("a decline sends no customer copy", async () => {
    seed();
    await req({ action: "decline", reason: "", ...shown(), consentText: DECLINE_CONSENT_TEXT });
    expect(sendAcceptanceConfirmation).not.toHaveBeenCalled();
    expect(sendProposalEventNotice).toHaveBeenCalledWith(expect.objectContaining({ event: "declined" }));
  });
});

describe("typed name (G12)", () => {
  it("a name that isn't the customer's is allowed but flagged in the record and on the lead", async () => {
    seed();
    const r = await req(acceptBody({ name: "Sam Smith" }));
    expect(r.status).toBe(200);
    expect(events()[0]).toMatchObject({ name: "Sam Smith", nameMatches: false });
    expect(history().some((a) => a.text.startsWith('Signed as "Sam Smith", quote was for Pat Jones'))).toBe(true);
  });

  it("loose matching", () => {
    expect(nameLooselyMatches("Pat Jones", "Pat Jones")).toBe(true);
    expect(nameLooselyMatches("patricia jones", "Pat Jones")).toBe(true);
    expect(nameLooselyMatches("P. Jones", "Pat Jones")).toBe(true);
    expect(nameLooselyMatches("José Núñez", "Jose Nunez")).toBe(true);
    expect(nameLooselyMatches("Sam Smith", "Pat Jones")).toBe(false);
    expect(nameLooselyMatches("Bob Co", "Contractor Co")).toBe(false);
    expect(nameLooselyMatches("Anyone", "")).toBe(true);
  });
});

describe("respond route request checks (G12)", () => {
  it("needs a JSON content type", async () => {
    seed();
    expect((await req(acceptBody(), { "Content-Type": "text/plain" })).status).toBe(415);
    expect((await req(acceptBody(), {})).status).toBe(415);
  });

  it("refuses another site's Origin or Referer; allows ours and none", async () => {
    seed();
    const json = { "Content-Type": "application/json" };
    expect((await req(acceptBody(), { ...json, Origin: "https://evil.example" })).status).toBe(403);
    expect((await req(acceptBody(), { ...json, Origin: "null" })).status).toBe(403);
    expect((await req(acceptBody(), { ...json, Referer: "https://evil.example/x" })).status).toBe(403);
    expect(events()).toHaveLength(0);
    expect((await req(acceptBody(), { ...json, Origin: "https://fibernorth.com", Referer: `https://fibernorth.com/proposal/${T}` })).status).toBe(200);
  });

  it("caps the body size", async () => {
    seed();
    const r = await req(JSON.stringify({ ...acceptBody(), pad: "x".repeat(20_000) }));
    expect(r.status).toBe(413);
  });
});

describe("old accepted links (G12)", () => {
  it("hide details 180 days after acceptance", () => {
    expect(isArchivedAcceptance({ status: "accepted", acceptedAt: ago(179) })).toBe(false);
    expect(isArchivedAcceptance({ status: "accepted", acceptedAt: ago(181) })).toBe(true);
    expect(isArchivedAcceptance({ status: "viewed", acceptedAt: ago(400) })).toBe(false);
  });
});

describe("an accepted quote's working copy is frozen (G6)", () => {
  const work = { mapAnnotation: null, quotedPrice: 2500, quoteLines: null, scopeText: "Cheaper" };

  it("saveQuoteWork refuses when the quote is accepted", async () => {
    seed();
    db.put("quoteRequests", "Q1", { ...db.get("quoteRequests", "Q1")!, estimateStatus: "accepted" });
    const r = await saveQuoteWork("Q1", work, "admin-token");
    expect(r).toMatchObject({ wrote: false, locked: QUOTE_ACCEPTED_LOCKED });
    expect(db.get("quoteRequests", "Q1")!.quotedPrice).toBe(4000);
  });

  it("…or when its current proposal is accepted", async () => {
    seed({ status: "accepted", acceptedAt: ago(1) });
    const r = await saveQuoteWork("Q1", work, "admin-token");
    expect(r.locked).toBe(QUOTE_ACCEPTED_LOCKED);
    expect(db.get("quoteRequests", "Q1")!.quotedPrice).toBe(4000);
  });

  it("an open quote still saves", async () => {
    seed();
    const r = await saveQuoteWork("Q1", work, "admin-token");
    expect(r).toMatchObject({ wrote: true });
    expect(r.locked).toBeUndefined();
  });
});

describe("Bore-ON webhook deliveries apply once (G13)", () => {
  const hook = (deliveryId: string) =>
    boreOnWebhook(
      new Request("https://fibernorth.com/api/bore-on/webhook", {
        method: "POST",
        body: JSON.stringify({
          event: "design.updated",
          deliveryId,
          designId: "D1",
          externalRef: "fibernorth:quote:Q1",
          status: "x",
          boreOnStatus: "draft",
          url: "https://bore-on/x",
          apiUrl: "https://bore-on/api/x",
          updatedAt: new Date().toISOString(),
        }),
      })
    ) as unknown as Promise<Res>;

  beforeEach(() => {
    vi.mocked(applyBoreOnReadback).mockClear();
    vi.mocked(fetchBoreOnReadback).mockClear();
  });

  it("a replay (A, B, A) is a 200 no-op", async () => {
    seed();
    expect((await hook("A")).status).toBe(200);
    expect((await hook("B/with/slash")).status).toBe(200);
    const again = await hook("A");
    expect(again).toMatchObject({ status: 200, body: { ok: true, duplicate: true } });
    expect(applyBoreOnReadback).toHaveBeenCalledTimes(2);
    expect(db.data.boreOnDeliveries.size).toBe(2);
    expect([...db.data.boreOnDeliveries.values()].map((d) => d.status)).toEqual(["applied", "applied"]);
  });

  it("a delivery that couldn't be read back gives its claim back so the retry runs", async () => {
    seed();
    vi.mocked(fetchBoreOnReadback).mockResolvedValueOnce(null);
    expect((await hook("C")).status).toBe(503);
    expect(db.data.boreOnDeliveries?.size ?? 0).toBe(0);
    expect((await hook("C")).status).toBe(200);
    expect(applyBoreOnReadback).toHaveBeenCalledTimes(1);
  });
});
