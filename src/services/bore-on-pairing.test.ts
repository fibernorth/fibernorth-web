import { describe, it, expect, vi, beforeEach } from "vitest";

// An in-memory database, enough for integrationSecrets and the audit log.
const store = new Map<string, Record<string, unknown>>();
const DELETE = Symbol("delete");
let auditId = 0;

const ref = (path: string) => ({
  path,
  async get() { const d = store.get(path); return { exists: !!d, data: () => (d ? { ...d } : undefined) }; },
  async set(data: Record<string, unknown>, opts?: { merge?: boolean }) {
    const next = opts?.merge ? { ...(store.get(path) ?? {}) } : {};
    for (const [k, v] of Object.entries(data)) { if (v === DELETE) delete next[k]; else next[k] = v; }
    store.set(path, next);
  },
  async delete() { store.delete(path); },
});
const db = { collection: (c: string) => ({ doc: (id?: string) => ref(`${c}/${id ?? `auto${++auditId}`}`) }) } as never;

vi.mock("firebase-admin/firestore", () => ({ FieldValue: { delete: () => DELETE } }));
vi.mock("@/services/audit", async (orig) => {
  const real = await orig<typeof import("@/services/audit")>();
  return { ...real, writeAudit: vi.fn(async (input: unknown) => { store.set(`auditLog/${++auditId}`, input as Record<string, unknown>); }) };
});

import { completePairing, disconnectBoreOn, startPairing } from "./bore-on-pairing";
import { challengeFor, PAIRING_REDIRECT_URI } from "@/lib/bore-on/pairing";

const owner = { uid: "u1", email: "bill@fibernorth.com" };
const KEY = `bo.company1.${"a".repeat(48)}`;
const SECRET = "f".repeat(64);

/** Bore-ON's exchange, as a fetch: checks what the contract says it checks. */
function boreOn(opts: { challenge: string; status?: number; body?: unknown; seen?: { body?: Record<string, string>; url?: string } }) {
  return (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (opts.seen) { opts.seen.body = body; opts.seen.url = url; }
    const ok = challengeFor(body.code_verifier) === opts.challenge && body.redirect_uri === PAIRING_REDIRECT_URI;
    if (!ok) return new Response("{}", { status: 400 });
    return new Response(JSON.stringify(opts.body ?? { baseUrl: "https://evil.example", apiKey: KEY, webhookSecret: SECRET, companyName: "KSA", keyId: "k1" }), { status: opts.status ?? 200 });
  }) as unknown as typeof fetch;
}

async function start() {
  const { url } = await startPairing(db, owner);
  const consent = new URL(url);
  return { state: consent.searchParams.get("state")!, challenge: consent.searchParams.get("code_challenge")!, consent };
}

beforeEach(() => { store.clear(); });

describe("connect to Bore-ON", () => {
  it("start keeps the verifier here and sends only its challenge", async () => {
    const { consent, challenge } = await start();
    const pending = store.get("integrationSecrets/boreOnPairing")!;
    expect(`${consent.origin}${consent.pathname}`).toBe("https://bore-on.com/connect/crm");
    expect(consent.search).not.toContain(String(pending.verifier));
    expect(challengeFor(String(pending.verifier))).toBe(challenge);
    expect(pending.startedBy).toEqual(owner);
  });

  it("uses the base address already saved, when it is a good one", async () => {
    store.set("integrationSecrets/boreOn", { baseUrl: "https://staging.bore-on.example/" });
    expect((await start()).consent.origin).toBe("https://staging.bore-on.example");
    store.set("integrationSecrets/boreOn", { baseUrl: "http://insecure.example" });
    expect((await start()).consent.origin).toBe("https://bore-on.com");
  });

  it("connects: trades the code, stores the key and secret, audits without values, forgets the pending record", async () => {
    const { state, challenge } = await start();
    const seen: { body?: Record<string, string>; url?: string } = {};
    const outcome = await completePairing(db, new URLSearchParams(`code=bp.company1.abc&state=${state}`), boreOn({ challenge, seen }));
    expect(outcome).toBe("connected");
    expect(seen.url).toBe("https://bore-on.com/api/v1/pairing/exchange");
    expect(seen.body!.code).toBe("bp.company1.abc");

    const saved = store.get("integrationSecrets/boreOn")!;
    // The base we STARTED with, never the one the response named.
    expect(saved).toMatchObject({ baseUrl: "https://bore-on.com", apiKey: KEY, webhookSecret: SECRET, connectedCompany: "KSA", connectedKeyId: "k1" });
    expect(store.has("integrationSecrets/boreOnPairing")).toBe(false);

    const audit = [...store.entries()].find(([k]) => k.startsWith("auditLog/"))![1] as { note: string; after: Record<string, unknown>; actor: { uid: string } };
    expect(audit.actor.uid).toBe("u1");
    expect(audit.note).toMatch(/connected through Bore-ON pairing \(KSA\)/);
    expect(JSON.stringify(audit)).not.toContain(KEY);
    expect(JSON.stringify(audit)).not.toContain(SECRET);
    expect(audit.after.apiKey).toBe("(set)");
  });

  it("is single use: the same return a second time is refused", async () => {
    const { state, challenge } = await start();
    const params = new URLSearchParams(`code=bp.company1.abc&state=${state}`);
    expect(await completePairing(db, params, boreOn({ challenge }))).toBe("connected");
    expect(await completePairing(db, params, boreOn({ challenge }))).toBe("state");
  });

  it("refuses a return it did not start: wrong state, none, or a stale start", async () => {
    const { challenge } = await start();
    expect(await completePairing(db, new URLSearchParams("code=bp.c.x&state=" + "z".repeat(48)), boreOn({ challenge }))).toBe("state");
    expect(await completePairing(db, new URLSearchParams("code=bp.c.x"), boreOn({ challenge }))).toBe("state");
    store.clear();
    expect(await completePairing(db, new URLSearchParams("code=bp.c.x&state=" + "z".repeat(48)), boreOn({ challenge }))).toBe("state");

    const { state } = await start();
    const pending = store.get("integrationSecrets/boreOnPairing")!;
    store.set("integrationSecrets/boreOnPairing", { ...pending, startedAt: new Date(Date.now() - 11 * 60_000).toISOString() });
    expect(await completePairing(db, new URLSearchParams(`code=bp.c.x&state=${state}`), boreOn({ challenge }))).toBe("state");
    expect(store.has("integrationSecrets/boreOn")).toBe(false);
  });

  it("reports a cancel in Bore-ON and stores nothing", async () => {
    const { state, challenge } = await start();
    expect(await completePairing(db, new URLSearchParams(`error=access_denied&state=${state}`), boreOn({ challenge }))).toBe("denied");
    expect(store.has("integrationSecrets/boreOn")).toBe(false);
    expect(store.has("integrationSecrets/boreOnPairing")).toBe(false);
  });

  it("stores nothing when Bore-ON refuses, is unreachable, or answers with a malformed key", async () => {
    let { state, challenge } = await start();
    expect(await completePairing(db, new URLSearchParams(`code=bp.c.x&state=${state}`), (async () => new Response("{}", { status: 400 })) as unknown as typeof fetch)).toBe("exchange");
    ({ state, challenge } = await start());
    expect(await completePairing(db, new URLSearchParams(`code=bp.c.x&state=${state}`), (async () => { throw new Error("down"); }) as unknown as typeof fetch)).toBe("unreachable");
    ({ state, challenge } = await start());
    expect(await completePairing(db, new URLSearchParams(`code=bp.c.x&state=${state}`), boreOn({ challenge, body: { apiKey: "short", webhookSecret: "short" } }))).toBe("exchange");
    expect(store.has("integrationSecrets/boreOn")).toBe(false);
  });

  it("proves it started the pairing: a wrong verifier gets nothing", async () => {
    const { state } = await start();
    const wrongChallenge = challengeFor("someone-elses-verifier-xxxxxxxxxxxxxxxxxxxxxxxxxxxx");
    expect(await completePairing(db, new URLSearchParams(`code=bp.c.x&state=${state}`), boreOn({ challenge: wrongChallenge }))).toBe("exchange");
    expect(store.has("integrationSecrets/boreOn")).toBe(false);
  });

  it("disconnect forgets the key and secret, keeps the base address, and audits without values", async () => {
    const { state, challenge } = await start();
    await completePairing(db, new URLSearchParams(`code=bp.c.x&state=${state}`), boreOn({ challenge }));
    await disconnectBoreOn(db, owner);
    const saved = store.get("integrationSecrets/boreOn")!;
    expect(saved.baseUrl).toBe("https://bore-on.com");
    for (const k of ["apiKey", "webhookSecret", "connectedAt", "connectedCompany", "connectedKeyId"]) expect(saved).not.toHaveProperty(k);
    const audits = [...store.entries()].filter(([k]) => k.startsWith("auditLog/")).map(([, v]) => JSON.stringify(v));
    expect(audits.join("")).not.toContain(KEY);
    expect(audits.join("")).toContain("disconnected from Bore-ON");
  });
});
