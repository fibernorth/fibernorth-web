import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { proposalLines } from "@/lib/proposal";
import type { Proposal, QuoteRequest } from "@/lib/types";
import {
  basicAuth,
  isQboConnected,
  tokenErrorMessage,
  tokenPatch,
  usableAccessToken,
  type IntuitTokenResponse,
  type QboSecret,
} from "@/lib/quickbooks/tokens";
import { faultText, isNotFound, parseFault, type QboFaultInfo } from "@/lib/quickbooks/fault";
import {
  buildEstimate,
  cleanDisplayName,
  collisionDisplayName,
  newCustomerBody,
  qboEstimateUrl,
  qboQuoted,
  sameCustomerByName,
  wantedItemNames,
  type EstimateBody,
  type EstimateSource,
  type QboCustomerLite,
  type QboItemMap,
} from "@/lib/quickbooks/estimate";

// QuickBooks Online, server side only. Bill connects once (OAuth, Admin ->
// Settings); the tokens live in integrationSecrets/quickbooks, which the
// browser can't read. A quote goes over as an Estimate, from the button on
// the quote screen or by itself when a customer accepts online.

export const QBO_REDIRECT_PATH = "/api/quickbooks/callback";
export const QBO_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
export const QBO_SCOPE = "com.intuit.quickbooks.accounting";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const API_BASE = "https://quickbooks.api.intuit.com/v3/company";
const MINOR_VERSION = "75";
/** Per request. Acceptance waits on this, so it stays short. */
const FETCH_TIMEOUT_MS = 15_000;
/** A send in progress holds the quote this long, so two clicks make one estimate. */
const SEND_LOCK_MS = 90_000;

const store = (): Firestore => getFirestore(initializeAdminApp());
const secretRef = () => store().collection("integrationSecrets").doc("quickbooks");

export async function getQboSecret(): Promise<QboSecret> {
  const snap = await secretRef().get();
  return (snap.data() as QboSecret | undefined) ?? {};
}

export async function saveQboSecret(patch: Partial<QboSecret>): Promise<void> {
  await secretRef().set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
}

export class QboNotConnectedError extends Error {
  constructor() {
    super("QuickBooks isn't connected. Connect it in Settings.");
  }
}

export class QboBusyError extends Error {
  constructor() {
    super("This quote is already being sent to QuickBooks. Give it a minute.");
  }
}

export class QboApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fault: QboFaultInfo | null
  ) {
    super(message);
  }
}

/** Whether QuickBooks is connected and accepted quotes should go over by themselves. */
export async function quickBooksState(): Promise<{ connected: boolean; autoSend: boolean }> {
  const s = await getQboSecret();
  return { connected: isQboConnected(s), autoSend: s.autoSend !== false };
}

// ---- Status (integrationStatus/quickbooks) -----------------------------------

export interface QboSyncStatus {
  lastOkAt?: string;
  lastError?: string;
  lastErrorAt?: string;
}

/** Best effort: a failed status write never hides the real result. */
export async function recordQboStatus(result: { ok: true } | { ok: false; error: string } | { reset: true }): Promise<void> {
  const at = new Date().toISOString();
  const patch: QboSyncStatus =
    "reset" in result
      ? { lastError: "", lastErrorAt: "" }
      : result.ok
        ? { lastOkAt: at }
        : { lastError: result.error.slice(0, 500), lastErrorAt: at };
  try {
    await store().collection("integrationStatus").doc("quickbooks").set(patch, { merge: true });
  } catch (e) {
    console.error("integrationStatus/quickbooks write failed:", e);
  }
}

// ---- OAuth -------------------------------------------------------------------

function withTimeout(signal?: AbortSignal): AbortSignal {
  const t = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, t]) : t;
}

async function timed(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new QboApiError("QuickBooks didn't answer in time. Try again.", 0, null);
    }
    throw new QboApiError(`Couldn't reach QuickBooks: ${e instanceof Error ? e.message : String(e)}`, 0, null);
  }
}

async function postToken(s: QboSecret, form: Record<string, string>, signal?: AbortSignal): Promise<IntuitTokenResponse> {
  const res = await timed(() =>
    fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: basicAuth(s.clientId || "", s.clientSecret || ""),
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(form),
      signal: withTimeout(signal),
    })
  );
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new QboApiError(tokenErrorMessage(res.status, text), res.status, null);
  try {
    return JSON.parse(text) as IntuitTokenResponse;
  } catch {
    throw new QboApiError("QuickBooks sent back something unreadable for the token.", res.status, null);
  }
}

/** Callback step: trade the one-time code for tokens. */
export async function exchangeCode(s: QboSecret, code: string, redirectUri: string): Promise<IntuitTokenResponse> {
  return postToken(s, { grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

/**
 * A working access token. Uses the cached one while it has a couple of
 * minutes left; otherwise refreshes inside a transaction that re-reads the
 * doc first, so a refresh that another request just finished is used rather
 * than repeated, and the rotated refresh token is saved with it.
 * `stale` is a token QuickBooks just refused (401): never hand it back.
 */
export async function getAccessToken(opts: { stale?: string; signal?: AbortSignal } = {}): Promise<{ token: string; realmId: string }> {
  const s = await getQboSecret();
  if (!isQboConnected(s)) throw new QboNotConnectedError();
  const cached = usableAccessToken(s);
  if (cached && cached !== opts.stale) return { token: cached, realmId: s.realmId || "" };

  const db = store();
  const ref = db.collection("integrationSecrets").doc("quickbooks");
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = (snap.data() as QboSecret | undefined) ?? {};
    if (!isQboConnected(cur)) throw new QboNotConnectedError();
    const again = usableAccessToken(cur);
    if (again && again !== opts.stale) return { token: again, realmId: cur.realmId || "" };
    const res = await postToken(cur, { grant_type: "refresh_token", refresh_token: cur.refreshToken || "" }, opts.signal);
    const patch = tokenPatch(res, cur);
    tx.set(ref, { ...patch, updatedAt: new Date().toISOString() }, { merge: true });
    return { token: patch.accessToken, realmId: cur.realmId || "" };
  });
}

/** Revoke the login at Intuit (best effort) and forget it here either way. */
export async function disconnectQuickBooks(): Promise<{ revoked: boolean }> {
  const s = await getQboSecret();
  let revoked = false;
  const token = s.refreshToken || s.accessToken;
  if (token && s.clientId && s.clientSecret) {
    try {
      const res = await fetch(REVOKE_URL, {
        method: "POST",
        headers: {
          Authorization: basicAuth(s.clientId, s.clientSecret),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
        signal: withTimeout(),
      });
      revoked = res.ok;
    } catch (e) {
      console.error("QuickBooks revoke failed:", e);
    }
  }
  await saveQboSecret({
    refreshToken: "",
    refreshTokenExpiresAt: "",
    accessToken: "",
    accessTokenExpiresAt: "",
    realmId: "",
    companyName: "",
    connectedAt: "",
    pendingState: "",
    pendingStateAt: "",
  });
  return { revoked };
}

// ---- API ---------------------------------------------------------------------

function apiUrl(realmId: string, path: string): string {
  return `${API_BASE}/${encodeURIComponent(realmId)}/${path}${path.includes("?") ? "&" : "?"}minorversion=${MINOR_VERSION}`;
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new QboApiError(faultText(res.status, text), res.status, parseFault(text));
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new QboApiError("QuickBooks sent back something unreadable.", res.status, null);
  }
}

/** Company name for Settings, using a token straight from the callback. */
export async function fetchCompanyName(realmId: string, accessToken: string): Promise<string> {
  const res = await timed(() =>
    fetch(apiUrl(realmId, `companyinfo/${encodeURIComponent(realmId)}`), {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: withTimeout(),
    })
  );
  const json = await readJson<{ CompanyInfo?: { CompanyName?: string } }>(res);
  return json.CompanyInfo?.CompanyName || "";
}

/** A QuickBooks API call. Refreshes and retries once when the token is refused. */
export async function qboRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  let { token, realmId } = await getAccessToken({ signal });
  const send = (tok: string) =>
    timed(() =>
      fetch(apiUrl(realmId, path), {
        method,
        headers: {
          Authorization: `Bearer ${tok}`,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: withTimeout(signal),
      })
    );
  let res = await send(token);
  if (res.status === 401) {
    ({ token, realmId } = await getAccessToken({ stale: token, signal }));
    res = await send(token);
  }
  return readJson<T>(res);
}

/** Run a QuickBooks query ("select * from Item where ..."). */
export async function qboQuery<T>(sql: string, entity: string, signal?: AbortSignal): Promise<T[]> {
  const json = await qboRequest<{ QueryResponse?: Record<string, unknown> }>(
    "GET",
    `query?query=${encodeURIComponent(sql)}`,
    undefined,
    signal
  );
  const rows = json.QueryResponse?.[entity];
  return Array.isArray(rows) ? (rows as T[]) : [];
}

// ---- Sending a quote ---------------------------------------------------------

export interface QboSendResult {
  estimateId: string;
  docNumber: string;
  url: string;
  customerId: string;
  created: boolean;
  /** Built from the proposal the customer accepted, or the quote as it is now. */
  from: "accepted-proposal" | "quote";
}

interface QboEstimate {
  Id: string;
  SyncToken: string;
  DocNumber?: string;
  TxnStatus?: string;
  AcceptedBy?: string;
  AcceptedDate?: string;
  ExpirationDate?: string;
  CustomerMemo?: unknown;
  BillAddr?: unknown;
  ShipAddr?: unknown;
  SalesTermRef?: unknown;
}

/**
 * What goes on the estimate. An accepted quote is sent as the customer
 * accepted it: the proposals/{token} snapshot (its lines, contact and
 * address, signer), not the quote doc, which can have moved on since.
 * Anything else is sent as the quote stands now.
 */
async function estimateSource(
  db: Firestore,
  quoteId: string,
  quote: Omit<QuoteRequest, "id">,
  proposalToken?: string
): Promise<{ src: EstimateSource; from: QboSendResult["from"] }> {
  const accepted = (p: Proposal | undefined) => p && p.quoteId === quoteId && p.status === "accepted";
  let p: Proposal | undefined;
  for (const token of [proposalToken, quote.proposalId]) {
    if (p || !token) continue;
    const snap = await db.collection("proposals").doc(token).get();
    const data = snap.data() as Proposal | undefined;
    if (accepted(data)) p = data;
  }
  if (!p) {
    // An older version can be the accepted one (the customer took v1 after v2 went out).
    const all = await db.collection("proposals").where("quoteId", "==", quoteId).get();
    p = all.docs
      .map((d) => d.data() as Proposal)
      .filter(accepted)
      .sort((a, b) => b.version - a.version)[0];
  }
  const address = (a: string | undefined, ann: { address?: string } | null | undefined) =>
    (a || "").trim() || (quote.address || "").trim() || (ann?.address || "").trim();

  if (p) {
    return {
      from: "accepted-proposal",
      src: {
        quoteId,
        customer: {
          name: p.customer.name || quote.name || "",
          email: p.customer.email || "",
          phone: p.customer.phone || "",
          address: address(p.customer.address, p.annotation),
        },
        lines: p.lines,
        txnDate: p.sentAt || new Date().toISOString(),
        expiresAt: p.expiresAt || undefined,
        accepted: { name: p.acceptedName || p.customer.name || "", at: p.acceptedAt || new Date().toISOString() },
      },
    };
  }
  return {
    from: "quote",
    src: {
      quoteId,
      customer: {
        name: quote.name || "",
        email: quote.email || "",
        phone: quote.phone || "",
        address: address(quote.address, quote.mapAnnotation),
      },
      lines: proposalLines(quote.quoteLines, quote.quotedPrice),
      txnDate: new Date().toISOString(),
      accepted: null,
    },
  };
}

const DUPLICATE_NAME = "6240";

async function findOrCreateCustomer(c: EstimateSource["customer"], signal?: AbortSignal): Promise<string> {
  const email = (c.email || "").trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    try {
      const found = await qboQuery<QboCustomerLite>(
        `select * from Customer where PrimaryEmailAddr = ${qboQuoted(email)}`,
        "Customer",
        signal
      );
      if (found[0]) return found[0].Id;
    } catch (e) {
      // A query QuickBooks won't run shouldn't stop the send; the name lookup follows.
      if (!(e instanceof QboApiError && e.status === 400)) throw e;
      console.error("QuickBooks customer email lookup refused:", e.message);
    }
  }
  const name = cleanDisplayName(c.name) || cleanDisplayName(email) || cleanDisplayName(c.phone) || "Website customer";
  const byName = await qboQuery<QboCustomerLite>(`select * from Customer where DisplayName = ${qboQuoted(name)}`, "Customer", signal);
  if (byName[0] && sameCustomerByName(byName[0], email)) return byName[0].Id;

  const create = async (displayName: string) => {
    const json = await qboRequest<{ Customer?: { Id?: string } }>("POST", "customer", newCustomerBody(displayName, c), signal);
    if (!json.Customer?.Id) throw new QboApiError("QuickBooks didn't return the new customer.", 200, null);
    return json.Customer.Id;
  };
  const alt = collisionDisplayName(name, c.phone, email);
  if (!byName[0]) {
    try {
      return await create(name);
    } catch (e) {
      // The name belongs to an inactive customer, a vendor or an employee.
      if (!(e instanceof QboApiError && e.fault?.code === DUPLICATE_NAME) || alt === name) throw e;
    }
  }
  if (alt !== name) {
    const again = await qboQuery<QboCustomerLite>(`select * from Customer where DisplayName = ${qboQuoted(alt)}`, "Customer", signal);
    if (again[0]) return again[0].Id;
  }
  return create(alt);
}

/** Look up each item by its full name, once per send. */
async function lookupItems(names: string[], signal?: AbortSignal): Promise<QboItemMap> {
  const found = await Promise.all(
    names.map(async (n) => {
      const rows = await qboQuery<{ Id: string; Name?: string; FullyQualifiedName?: string }>(
        `select * from Item where FullyQualifiedName = ${qboQuoted(n)}`,
        "Item",
        signal
      );
      return [n, rows[0]] as const;
    })
  );
  const out: QboItemMap = {};
  for (const [n, row] of found) if (row) out[n] = { id: row.Id, name: row.FullyQualifiedName || row.Name || n };
  return out;
}

async function getEstimate(id: string, signal?: AbortSignal): Promise<QboEstimate | null> {
  try {
    const json = await qboRequest<{ Estimate?: QboEstimate }>("GET", `estimate/${encodeURIComponent(id)}`, undefined, signal);
    return json.Estimate ?? null;
  } catch (e) {
    if (e instanceof QboApiError && isNotFound(e.status, e.fault)) return null;
    throw e;
  }
}

/**
 * The full update QuickBooks wants (sparse: false replaces the whole
 * estimate). Fields Bill may have set in QuickBooks that we don't send are
 * carried over, so an update doesn't blank them.
 */
export function estimateUpdateBody(body: EstimateBody, existing: QboEstimate): Record<string, unknown> {
  const keep = <K extends keyof QboEstimate>(k: K) => (existing[k] !== undefined ? { [k]: existing[k] } : {});
  return {
    ...keep("DocNumber"),
    ...keep("CustomerMemo"),
    ...keep("BillAddr"),
    ...keep("ShipAddr"),
    ...keep("SalesTermRef"),
    ...(body.ExpirationDate ? {} : keep("ExpirationDate")),
    ...(body.TxnStatus ? {} : { ...keep("TxnStatus"), ...keep("AcceptedBy"), ...keep("AcceptedDate") }),
    ...body,
    Id: existing.Id,
    SyncToken: existing.SyncToken,
    sparse: false,
  };
}

async function sendInner(
  db: Firestore,
  quoteId: string,
  quote: Omit<QuoteRequest, "id">,
  opts: { proposalToken?: string; signal?: AbortSignal }
): Promise<QboSendResult> {
  const { src, from } = await estimateSource(db, quoteId, quote, opts.proposalToken);
  const [customerId, items] = await Promise.all([
    findOrCreateCustomer(src.customer, opts.signal),
    lookupItems(wantedItemNames(src.lines), opts.signal),
  ]);
  const body = buildEstimate(src, items, { customerId });

  const existing = quote.qboEstimateId ? await getEstimate(quote.qboEstimateId, opts.signal) : null;
  if (existing?.TxnStatus === "Closed") {
    throw new Error(
      `Estimate #${existing.DocNumber || existing.Id} is closed in QuickBooks (already invoiced), so it was left alone. Make changes in QuickBooks.`
    );
  }
  const json = await qboRequest<{ Estimate?: QboEstimate }>(
    "POST",
    "estimate",
    existing ? estimateUpdateBody(body, existing) : body,
    opts.signal
  );
  const est = json.Estimate;
  if (!est?.Id) throw new QboApiError("QuickBooks didn't return the estimate.", 200, null);
  return {
    estimateId: est.Id,
    docNumber: est.DocNumber || "",
    url: qboEstimateUrl(est.Id),
    customerId,
    created: !existing,
    from,
  };
}

async function logOnLead(db: Firestore, quoteId: string, quote: Omit<QuoteRequest, "id">, text: string, at: string) {
  try {
    const leadRef = quote.leadId
      ? db.collection("leads").doc(quote.leadId)
      : (await db.collection("leads").where("quoteId", "==", quoteId).limit(1).get()).docs[0]?.ref;
    const leadSnap = leadRef ? await leadRef.get() : null;
    if (leadRef && leadSnap?.exists) {
      await leadRef.update({
        activity: FieldValue.arrayUnion({ ts: at, type: "system", text }),
        updatedAt: at,
      });
    }
  } catch (err) {
    console.error("Lead QuickBooks note failed:", err);
  }
}

/**
 * Create the quote's estimate in QuickBooks, or update the one it already
 * made. Saves the estimate's id/number/link on the quote (or the error), notes
 * it on the lead, and records the result for Settings. Throws with a message
 * fit to show Bill.
 */
export async function sendQuoteToQuickBooks(
  quoteId: string,
  opts: { proposalToken?: string; signal?: AbortSignal } = {}
): Promise<QboSendResult> {
  if (!isQboConnected(await getQboSecret())) throw new QboNotConnectedError();
  const db = store();
  const qRef = db.collection("quoteRequests").doc(quoteId);
  const startedAt = new Date().toISOString();
  const quote = await db.runTransaction(async (tx) => {
    const snap = await tx.get(qRef);
    if (!snap.exists) throw new Error("Quote not found");
    const q = snap.data() as Omit<QuoteRequest, "id">;
    const held = q.qboSendingAt ? Date.now() - new Date(q.qboSendingAt).getTime() : Infinity;
    if (held >= 0 && held < SEND_LOCK_MS) throw new QboBusyError();
    tx.update(qRef, { qboSendingAt: startedAt });
    return q;
  });

  try {
    const out = await sendInner(db, quoteId, quote, opts);
    const at = new Date().toISOString();
    await qRef.update({
      qboEstimateId: out.estimateId,
      qboDocNumber: out.docNumber,
      qboCustomerId: out.customerId,
      qboUrl: out.url,
      qboSentAt: at,
      qboError: "",
      qboErrorAt: "",
      qboSendingAt: "",
    });
    await recordQboStatus({ ok: true });
    const label = out.docNumber ? `Estimate #${out.docNumber}` : "Estimate";
    await logOnLead(db, quoteId, quote, `${label} ${out.created ? "created" : "updated"} in QuickBooks`, at);
    return out;
  } catch (e) {
    const message = e instanceof Error && e.message ? e.message : "QuickBooks send failed";
    const at = new Date().toISOString();
    try {
      await qRef.update({ qboError: message.slice(0, 500), qboErrorAt: at, qboSendingAt: "" });
    } catch (err) {
      console.error("Couldn't save the QuickBooks error on the quote:", err);
    }
    if (!(e instanceof QboNotConnectedError)) await recordQboStatus({ ok: false, error: message });
    throw e;
  }
}
