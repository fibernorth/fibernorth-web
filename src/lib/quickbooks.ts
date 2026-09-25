import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { estimateBody, estimateUrl, qboQuote, type EstimateInput } from "@/lib/quickbooks-estimate";
import type { QuoteLine } from "@/lib/types";

// QuickBooks Online for the quotes. Bill connects the company once (OAuth,
// Admin → Settings); the tokens live in integrationSecrets/quickbooks. Every
// sent quote becomes an Estimate there, re-sends update the same estimate,
// and accept/decline on the proposal page marks it Accepted or Rejected.
//
// Intuit rotates the refresh token on every refresh and the old one stops
// working, so the newest one is stored every time.

const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const QBO_SCOPE = "com.intuit.quickbooks.accounting";
export const QBO_REDIRECT_PATH = "/api/quickbooks/oauth/callback";
const MINOR_VERSION = "75";

export type QboEnvironment = "production" | "sandbox";

export interface QboSecret {
  clientId?: string;
  clientSecret?: string;
  environment?: QboEnvironment;
  realmId?: string;
  refreshToken?: string;
  refreshTokenAt?: string;
  accessToken?: string;
  accessTokenExpiresAt?: string;
  companyName?: string;
  workItemId?: string;
  workItemName?: string;
  materialItemId?: string;
  materialItemName?: string;
  /** Record every sent quote as an estimate (default on once connected). */
  recordEstimates?: boolean;
  /** Also have QuickBooks email the estimate (default off; our email carries the accept link). */
  emailFromQuickBooks?: boolean;
  pendingState?: string;
  pendingStateAt?: string;
}

const doc = () => getFirestore(initializeAdminApp()).collection("integrationSecrets").doc("quickbooks");

export async function getQboSecret(): Promise<QboSecret> {
  const snap = await doc().get();
  return (snap.data() as QboSecret | undefined) ?? {};
}

export async function saveQboSecret(patch: Partial<QboSecret>): Promise<void> {
  await doc().set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
}

export function isQboConnected(s: QboSecret): boolean {
  return Boolean(s.clientId && s.clientSecret && s.realmId && s.refreshToken);
}

export function qboEnvironment(s: QboSecret): QboEnvironment {
  return s.environment === "sandbox" ? "sandbox" : "production";
}

export function authorizeUrl(s: QboSecret, redirectUri: string, state: string): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", s.clientId || "");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", QBO_SCOPE);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
}

async function tokenRequest(s: QboSecret, params: Record<string, string>): Promise<TokenResponse> {
  const basic = Buffer.from(`${s.clientId || ""}:${s.clientSecret || ""}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new Error(`QuickBooks token request failed (${res.status})`);
  return (await res.json()) as TokenResponse;
}

/** Keep both tokens; the refresh token Intuit just sent is the only live one. */
async function storeTokens(json: TokenResponse): Promise<Partial<QboSecret>> {
  const now = Date.now();
  const patch: Partial<QboSecret> = {};
  if (json.access_token) {
    patch.accessToken = json.access_token;
    patch.accessTokenExpiresAt = new Date(now + (json.expires_in || 3600) * 1000).toISOString();
  }
  if (json.refresh_token) {
    patch.refreshToken = json.refresh_token;
    patch.refreshTokenAt = new Date(now).toISOString();
  }
  await saveQboSecret(patch);
  return patch;
}

export async function exchangeCode(s: QboSecret, code: string, redirectUri: string): Promise<Partial<QboSecret>> {
  const json = await tokenRequest(s, { grant_type: "authorization_code", code, redirect_uri: redirectUri });
  if (!json.refresh_token || !json.access_token) throw new Error("QuickBooks returned no tokens");
  return storeTokens(json);
}

async function accessToken(s: QboSecret, force = false): Promise<string> {
  const left = s.accessTokenExpiresAt ? new Date(s.accessTokenExpiresAt).getTime() - Date.now() : 0;
  if (!force && s.accessToken && left > 2 * 60_000) return s.accessToken;
  const json = await tokenRequest(s, { grant_type: "refresh_token", refresh_token: s.refreshToken || "" });
  if (!json.access_token) throw new Error("QuickBooks token refresh returned no token");
  const patch = await storeTokens(json);
  Object.assign(s, patch);
  return json.access_token;
}

function apiBase(s: QboSecret): string {
  const host = qboEnvironment(s) === "sandbox" ? "sandbox-quickbooks.api.intuit.com" : "quickbooks.api.intuit.com";
  return `https://${host}/v3/company/${encodeURIComponent(s.realmId || "")}`;
}

interface QboFault {
  Fault?: { Error?: Array<{ Message?: string; Detail?: string; code?: string }> };
}

/** One call to the QBO API, JSON in and out, QuickBooks' own words on failure. */
export async function qbo<T = Record<string, unknown>>(
  s: QboSecret,
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; query?: Record<string, string> } = {},
  retry = true
): Promise<T> {
  const url = new URL(`${apiBase(s)}${path}`);
  url.searchParams.set("minorversion", MINOR_VERSION);
  for (const [k, v] of Object.entries(init.query || {})) url.searchParams.set(k, v);
  const token = await accessToken(s);
  const res = await fetch(url, {
    method: init.method || (init.body ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401 && retry) {
    await accessToken(s, true);
    return qbo<T>(s, path, init, false);
  }
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as QboFault;
      const e = j.Fault?.Error?.[0];
      detail = [e?.Message, e?.Detail].filter(Boolean).join(": ");
    } catch {
      /* no body */
    }
    throw new Error(`QuickBooks said no (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
  return (await res.json()) as T;
}

export async function companyName(s: QboSecret): Promise<string> {
  const j = await qbo<{ CompanyInfo?: { CompanyName?: string } }>(s, `/companyinfo/${encodeURIComponent(s.realmId || "")}`);
  return j.CompanyInfo?.CompanyName || "";
}

export interface QboItem {
  id: string;
  name: string;
  type: string;
  taxable: boolean;
}

export async function listSalesItems(s: QboSecret): Promise<QboItem[]> {
  const j = await qbo<{ QueryResponse?: { Item?: Array<{ Id: string; Name: string; Type?: string; Taxable?: boolean; FullyQualifiedName?: string }> } }>(
    s, "/query", { query: { query: "select Id, Name, FullyQualifiedName, Type, Taxable from Item where Active = true maxresults 1000" } }
  );
  return (j.QueryResponse?.Item || [])
    .map((i) => ({ id: i.Id, name: i.FullyQualifiedName || i.Name, type: i.Type || "", taxable: Boolean(i.Taxable) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

interface QboCustomer {
  Id: string;
  DisplayName: string;
}

/** The customer for a quote: by email, then by name, else made new. */
export async function findOrCreateCustomer(
  s: QboSecret,
  who: { name: string; email?: string; phone?: string; address?: string }
): Promise<{ id: string; displayName: string; created: boolean }> {
  const find = async (where: string) => {
    const j = await qbo<{ QueryResponse?: { Customer?: QboCustomer[] } }>(s, "/query", {
      query: { query: `select Id, DisplayName from Customer where ${where} maxresults 1` },
    });
    return j.QueryResponse?.Customer?.[0];
  };
  const email = (who.email || "").trim();
  const name = (who.name || "").trim() || email || "Customer";
  const hit = (email && (await find(`PrimaryEmailAddr = ${qboQuote(email)}`))) || (await find(`DisplayName = ${qboQuote(name)}`));
  if (hit) return { id: hit.Id, displayName: hit.DisplayName, created: false };
  const j = await qbo<{ Customer: QboCustomer }>(s, "/customer", {
    body: {
      DisplayName: name.slice(0, 100),
      ...(email ? { PrimaryEmailAddr: { Address: email } } : {}),
      ...(who.phone ? { PrimaryPhone: { FreeFormNumber: who.phone.slice(0, 30) } } : {}),
      ...(who.address ? { BillAddr: { Line1: who.address.slice(0, 500) } } : {}),
    },
  });
  return { id: j.Customer.Id, displayName: j.Customer.DisplayName, created: true };
}

interface QboEstimate {
  Id: string;
  SyncToken: string;
  DocNumber?: string;
}

/** Create the estimate, or update the one this quote already has. */
export async function upsertEstimate(
  s: QboSecret,
  input: Omit<EstimateInput, "items" | "existing"> & { lines: QuoteLine[]; existingId?: string }
): Promise<{ id: string; docNumber: string; url: string }> {
  if (!s.workItemId || !s.materialItemId) {
    throw new Error("Pick the work and material items under Admin → Settings → QuickBooks.");
  }
  const items = {
    work: { value: s.workItemId, ...(s.workItemName ? { name: s.workItemName } : {}) },
    material: { value: s.materialItemId, ...(s.materialItemName ? { name: s.materialItemName } : {}) },
  };
  let existing: { id: string; syncToken: string } | undefined;
  if (input.existingId) {
    try {
      const cur = await qbo<{ Estimate: QboEstimate }>(s, `/estimate/${encodeURIComponent(input.existingId)}`);
      existing = { id: cur.Estimate.Id, syncToken: cur.Estimate.SyncToken };
    } catch {
      existing = undefined; // deleted in QuickBooks: make a new one
    }
  }
  const j = await qbo<{ Estimate: QboEstimate }>(s, "/estimate", { body: estimateBody({ ...input, items, existing }) });
  return { id: j.Estimate.Id, docNumber: j.Estimate.DocNumber || j.Estimate.Id, url: estimateUrl(j.Estimate.Id, qboEnvironment(s)) };
}

export async function setEstimateStatus(
  s: QboSecret,
  id: string,
  status: "Accepted" | "Rejected",
  acceptedBy?: string
): Promise<void> {
  const cur = await qbo<{ Estimate: QboEstimate }>(s, `/estimate/${encodeURIComponent(id)}`);
  await qbo(s, "/estimate", {
    body: {
      Id: cur.Estimate.Id,
      SyncToken: cur.Estimate.SyncToken,
      sparse: true,
      TxnStatus: status,
      ...(status === "Accepted"
        ? { AcceptedBy: (acceptedBy || "").slice(0, 100), AcceptedDate: new Date().toISOString().slice(0, 10) }
        : {}),
    },
  });
}

export async function sendEstimate(s: QboSecret, id: string, email: string): Promise<void> {
  await qbo(s, `/estimate/${encodeURIComponent(id)}/send`, { method: "POST", query: { sendTo: email } });
}
