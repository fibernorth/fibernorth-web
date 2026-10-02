// QuickBooks token refresh and quote sending against an in-memory Firestore
// and a fake Intuit (fetch mocked). No real QuickBooks calls.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FakeDb } from "@/test/fakedb";

let db: FakeDb;
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakedb")).fakeFirestoreModule(() => db));

import { makeDb } from "@/test/fakedb";
import { estimateUpdateBody, getAccessToken, qboRequest, sendQuoteToQuickBooks } from "@/services/quickbooks";

const future = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

const ITEMS: Record<string, string> = {
  "Directional Drilling": "23",
  "Conduit:2in": "139",
  Misc: "38",
};

interface Call {
  method: string;
  url: string;
  body: any;
  auth: string;
}

let calls: Call[];
let tokenResponses: Array<{ status: number; body: any }>;
let estimates: Record<string, any>;
let customers: Array<{ Id: string; DisplayName: string; PrimaryEmailAddr?: { Address: string } }>;
let refuseToken: string | null;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fakeIntuit(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const method = init?.method || "GET";
  const headers = (init?.headers || {}) as Record<string, string>;
  const raw = init?.body;
  const body = typeof raw === "string" ? (raw.startsWith("{") ? JSON.parse(raw) : raw) : raw instanceof URLSearchParams ? Object.fromEntries(raw) : raw;
  calls.push({ method, url, body, auth: headers.Authorization || "" });

  if (url.startsWith("https://oauth.platform.intuit.com/")) {
    const next = tokenResponses.shift();
    if (!next) throw new Error("unexpected token call");
    return Promise.resolve(json(next.status, next.body));
  }
  if (refuseToken && headers.Authorization === `Bearer ${refuseToken}`) {
    return Promise.resolve(json(401, { fault: { error: [{ message: "AuthenticationFailed" }] } }));
  }
  const u = new URL(url);
  const path = u.pathname.replace("/v3/company/R1/", "");
  if (path === "query") {
    const q = u.searchParams.get("query") || "";
    const val = /= '((?:[^'\\]|\\.)*)'/.exec(q)?.[1]?.replace(/\\'/g, "'") ?? "";
    if (q.includes("from Item")) {
      const id = ITEMS[val];
      return Promise.resolve(json(200, { QueryResponse: id ? { Item: [{ Id: id, FullyQualifiedName: val }] } : {} }));
    }
    if (q.includes("PrimaryEmailAddr")) {
      const found = customers.filter((c) => c.PrimaryEmailAddr?.Address === val);
      return Promise.resolve(json(200, { QueryResponse: found.length ? { Customer: found } : {} }));
    }
    const found = customers.filter((c) => c.DisplayName === val);
    return Promise.resolve(json(200, { QueryResponse: found.length ? { Customer: found } : {} }));
  }
  if (path === "customer" && method === "POST") {
    const c = { Id: `C${customers.length + 100}`, ...body };
    customers.push(c);
    return Promise.resolve(json(200, { Customer: c }));
  }
  if (path.startsWith("estimate/") && method === "GET") {
    const id = path.slice("estimate/".length);
    const e = estimates[id];
    if (!e) {
      return Promise.resolve(json(400, { Fault: { Error: [{ Message: "Object Not Found", Detail: "deleted", code: "610" }], type: "ValidationFault" } }));
    }
    return Promise.resolve(json(200, { Estimate: e }));
  }
  if (path === "estimate" && method === "POST") {
    if (body.Id) {
      const e = { ...body, SyncToken: String(Number(body.SyncToken) + 1) };
      estimates[body.Id] = e;
      return Promise.resolve(json(200, { Estimate: e }));
    }
    const id = String(500 + Object.keys(estimates).length);
    const e = { ...body, Id: id, SyncToken: "0", DocNumber: String(1258 + Object.keys(estimates).length) };
    estimates[id] = e;
    return Promise.resolve(json(200, { Estimate: e }));
  }
  throw new Error(`unexpected ${method} ${url}`);
}

const connectedSecret = (over: Record<string, unknown> = {}) => ({
  clientId: "CID",
  clientSecret: "CSECRET",
  realmId: "R1",
  refreshToken: "R-old",
  accessToken: "A-cached",
  accessTokenExpiresAt: future(30),
  ...over,
});

beforeEach(() => {
  db = makeDb();
  calls = [];
  tokenResponses = [];
  estimates = {};
  customers = [];
  refuseToken = null;
  vi.stubGlobal("fetch", vi.fn(fakeIntuit));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("access tokens", () => {
  it("uses the cached token while it is good", async () => {
    db.put("integrationSecrets", "quickbooks", connectedSecret());
    expect(await getAccessToken()).toEqual({ token: "A-cached", realmId: "R1" });
    expect(calls).toHaveLength(0);
  });

  it("refreshes an expiring token and saves the rotated refresh token", async () => {
    db.put("integrationSecrets", "quickbooks", connectedSecret({ accessTokenExpiresAt: future(1) }));
    tokenResponses.push({ status: 200, body: { access_token: "A-new", refresh_token: "R-new", expires_in: 3600, x_refresh_token_expires_in: 8_640_000 } });
    expect(await getAccessToken()).toEqual({ token: "A-new", realmId: "R1" });
    expect(calls[0].body).toEqual({ grant_type: "refresh_token", refresh_token: "R-old" });
    expect(calls[0].auth).toBe(`Basic ${Buffer.from("CID:CSECRET").toString("base64")}`);
    const s = db.get("integrationSecrets", "quickbooks")!;
    expect(s.refreshToken).toBe("R-new");
    expect(s.accessToken).toBe("A-new");
    expect(Date.parse(s.accessTokenExpiresAt)).toBeGreaterThan(Date.now() + 50 * 60_000);
    expect(s.refreshTokenExpiresAt).toBeTruthy();
    // The next call uses the new cached token.
    expect((await getAccessToken()).token).toBe("A-new");
    expect(calls).toHaveLength(1);
  });

  it("a refused token is refreshed once and the call retried", async () => {
    db.put("integrationSecrets", "quickbooks", connectedSecret());
    refuseToken = "A-cached";
    tokenResponses.push({ status: 200, body: { access_token: "A-new", refresh_token: "R-new", expires_in: 3600 } });
    const out = await qboRequest<any>("GET", "query?query=select%20*%20from%20Item%20where%20FullyQualifiedName%20%3D%20'Misc'");
    expect(out.QueryResponse.Item[0].Id).toBe("38");
    expect(calls.map((c) => c.url.split("?")[0].split("/").pop())).toEqual(["query", "bearer", "query"]);
    expect(db.get("integrationSecrets", "quickbooks")!.refreshToken).toBe("R-new");
  });

  it("says to reconnect when the login was revoked", async () => {
    db.put("integrationSecrets", "quickbooks", connectedSecret({ accessTokenExpiresAt: "" }));
    tokenResponses.push({ status: 400, body: { error: "invalid_grant" } });
    await expect(getAccessToken()).rejects.toThrow(/Reconnect QuickBooks/);
    expect(db.get("integrationSecrets", "quickbooks")!.refreshToken).toBe("R-old");
  });

  it("not connected", async () => {
    await expect(getAccessToken()).rejects.toThrow(/isn't connected/);
  });
});

describe("sendQuoteToQuickBooks", () => {
  const quote = {
    name: "Jim Ellis",
    email: "jim@example.com",
    phone: "231-555-0100",
    address: "123 Lake Rd, Traverse City",
    leadId: "L1",
    quoteLines: [
      { description: "Directional Drilling", kind: "work", qty: 1, unitPrice: 3000 },
      { description: "2in SDR 13.5 HDPE Orange Conduit", kind: "material", qty: 100, unitPrice: 2 },
    ],
    quotedPrice: 3212,
  };

  beforeEach(() => {
    db.put("integrationSecrets", "quickbooks", connectedSecret());
    db.put("quoteRequests", "Q1", quote);
    db.put("leads", "L1", { name: "Jim Ellis", activity: [] });
  });

  it("creates the customer and estimate, saves it on the quote and logs on the lead", async () => {
    const out = await sendQuoteToQuickBooks("Q1");
    expect(out).toMatchObject({ estimateId: "500", docNumber: "1258", created: true, from: "quote", url: "https://qbo.intuit.com/app/estimate?txnId=500" });
    expect(customers[0]).toMatchObject({ DisplayName: "Jim Ellis", PrimaryEmailAddr: { Address: "jim@example.com" } });
    const est = estimates["500"];
    expect(est.CustomerRef).toEqual({ value: customers[0].Id });
    expect(est.Line.map((l: any) => [l.SalesItemLineDetail.ItemRef.value, l.SalesItemLineDetail.TaxCodeRef.value, l.Amount])).toEqual([
      ["23", "NON", 3000],
      ["139", "TAX", 200],
    ]);
    expect(est.TxnStatus).toBeUndefined();
    const q = db.get("quoteRequests", "Q1")!;
    expect(q).toMatchObject({ qboEstimateId: "500", qboDocNumber: "1258", qboError: "", qboSendingAt: "", qboUrl: out.url });
    expect(db.get("leads", "L1")!.activity.at(-1)).toMatchObject({ type: "system", text: "Estimate #1258 created in QuickBooks" });
    expect(db.get("integrationStatus", "quickbooks")!.lastOkAt).toBeTruthy();
  });

  it("matches an existing customer by email before name", async () => {
    customers.push({ Id: "C7", DisplayName: "Popp Excavating", PrimaryEmailAddr: { Address: "jim@example.com" } });
    await sendQuoteToQuickBooks("Q1");
    expect(customers).toHaveLength(1);
    expect(estimates["500"].CustomerRef).toEqual({ value: "C7" });
  });

  it("a same-name customer with another email gets a new, tagged customer", async () => {
    customers.push({ Id: "C8", DisplayName: "Jim Ellis", PrimaryEmailAddr: { Address: "other@example.com" } });
    await sendQuoteToQuickBooks("Q1");
    expect(customers[1].DisplayName).toBe("Jim Ellis - 231-555-0100");
  });

  it("a second send updates the same estimate", async () => {
    await sendQuoteToQuickBooks("Q1");
    estimates["500"].CustomerMemo = { value: "Typed in QuickBooks" };
    const out = await sendQuoteToQuickBooks("Q1");
    expect(out).toMatchObject({ estimateId: "500", created: false, docNumber: "1258" });
    expect(Object.keys(estimates)).toEqual(["500"]);
    const post = calls.filter((c) => c.method === "POST" && c.url.includes("/estimate?")).at(-1)!;
    expect(post.body).toMatchObject({ Id: "500", SyncToken: "0", sparse: false, DocNumber: "1258", CustomerMemo: { value: "Typed in QuickBooks" } });
    expect(db.get("leads", "L1")!.activity.at(-1).text).toBe("Estimate #1258 updated in QuickBooks");
  });

  it("makes a new estimate when the old one was deleted in QuickBooks", async () => {
    await sendQuoteToQuickBooks("Q1");
    delete estimates["500"];
    const out = await sendQuoteToQuickBooks("Q1");
    expect(out.created).toBe(true);
    expect(db.get("quoteRequests", "Q1")!.qboEstimateId).toBe(out.estimateId);
  });

  it("sends the accepted proposal, not the edited quote", async () => {
    db.put("quoteRequests", "Q1", { ...quote, proposalId: "T2", estimateStatus: "accepted", quoteLines: [{ description: "Edited later", kind: "work", qty: 1, unitPrice: 1 }] });
    db.put("proposals", "T2", {
      quoteId: "Q1",
      version: 2,
      status: "accepted",
      customer: { name: "Jim Ellis", email: "jim@example.com", phone: "", address: "9 Bay St" },
      lines: [{ description: "Directional Drilling", kind: "work", qty: 1, unitPrice: 2800 }],
      sentAt: "2026-09-20T15:00:00Z",
      expiresAt: "2026-10-21T03:59:59.999Z",
      acceptedAt: "2026-10-01T18:00:00Z",
      acceptedName: "James Ellis",
    });
    const out = await sendQuoteToQuickBooks("Q1", { proposalToken: "T2" });
    expect(out.from).toBe("accepted-proposal");
    const est = estimates[out.estimateId];
    expect(est).toMatchObject({ TxnStatus: "Accepted", AcceptedBy: "James Ellis", AcceptedDate: "2026-10-01", TxnDate: "2026-09-20" });
    expect(est.Line.map((l: any) => l.Amount)).toEqual([2800]);
    expect(est.CustomField[0].StringValue).toBe("9 Bay St");
  });

  it("saves a missing-item error on the quote", async () => {
    db.put("quoteRequests", "Q1", { ...quote, quoteLines: [{ description: "Labor", kind: "work", qty: 1, unitPrice: 50 }] });
    await expect(sendQuoteToQuickBooks("Q1")).rejects.toThrow(/"Labor:Labor"/);
    const q = db.get("quoteRequests", "Q1")!;
    expect(q.qboError).toMatch(/Labor:Labor/);
    expect(q.qboSendingAt).toBe("");
    expect(db.get("integrationStatus", "quickbooks")!.lastError).toMatch(/Labor:Labor/);
  });

  it("refuses a second send while one is running", async () => {
    db.put("quoteRequests", "Q1", { ...quote, qboSendingAt: new Date().toISOString() });
    await expect(sendQuoteToQuickBooks("Q1")).rejects.toThrow(/already being sent/);
    expect(calls).toHaveLength(0);
  });

  it("not connected: no calls, nothing written", async () => {
    db.put("integrationSecrets", "quickbooks", { clientId: "CID", clientSecret: "S" });
    await expect(sendQuoteToQuickBooks("Q1")).rejects.toThrow(/Connect it in Settings/);
    expect(db.get("quoteRequests", "Q1")!.qboError).toBeUndefined();
  });
});

describe("estimateUpdateBody", () => {
  it("keeps QuickBooks' status when we don't set one, and ours when we do", () => {
    const existing = { Id: "5", SyncToken: "3", DocNumber: "1300", TxnStatus: "Accepted", AcceptedBy: "Bill" };
    const base = { CustomerRef: { value: "1" }, TxnDate: "2026-10-01", PrivateNote: "x", Line: [] };
    expect(estimateUpdateBody(base, existing)).toMatchObject({ TxnStatus: "Accepted", AcceptedBy: "Bill", DocNumber: "1300", sparse: false });
    expect(estimateUpdateBody({ ...base, TxnStatus: "Accepted", AcceptedBy: "Jim" }, existing)).toMatchObject({ AcceptedBy: "Jim" });
  });
});
