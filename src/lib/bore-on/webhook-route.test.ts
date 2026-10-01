import { describe, it, expect, vi, beforeEach } from "vitest";
import { signBoreOnBody } from "./signature";

// The signed callback from Bore-ON, end to end through the route.
const quoteDocs = new Map<string, Record<string, unknown>>();
const state = { secrets: { webhookSecret: "s3cret", baseUrl: "https://bore-on.com", apiKey: "bo.c.x" } as Record<string, string | undefined>, readback: { result: {} } as unknown, limited: false };
const applied: unknown[] = [];

vi.mock("@/services/firebase-admin", () => ({ initializeAdminApp: () => ({}) }));
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({
    collection: () => ({ doc: (id: string) => ({ get: async () => ({ exists: quoteDocs.has(id), data: () => quoteDocs.get(id) }) }) }),
  }),
}));
vi.mock("@/lib/proposal-server", () => ({ rateLimited: () => state.limited }));
vi.mock("@/services/bore-on", () => ({
  loadBoreOnSecrets: async () => state.secrets,
  fetchBoreOnReadback: async () => state.readback,
  applyBoreOnReadback: async (_db: unknown, id: string, _q: unknown, _r: unknown, meta: unknown) => { applied.push({ id, meta }); return { repriced: true, total: 4200 }; },
}));

import { POST } from "@/app/api/bore-on/webhook/route";

const payload = (over: Record<string, unknown> = {}) => ({
  event: "design.designed", deliveryId: "d1:abc", designId: "des1", externalRef: "fibernorth:quote:q1",
  status: "designed", boreOnStatus: "in-review", url: "https://bore-on.com/design?id=des1",
  apiUrl: "https://bore-on.com/api/v1/designs/des1", updatedAt: "2026-10-01T12:00:00Z", ...over,
});

function call(body: unknown, opts: { secret?: string; timestamp?: string; raw?: string; signature?: string | null } = {}) {
  const raw = opts.raw ?? JSON.stringify(body);
  const ts = opts.timestamp ?? String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = { "x-boreon-timestamp": ts };
  const sig = opts.signature === undefined ? signBoreOnBody(opts.secret ?? "s3cret", ts, raw) : opts.signature;
  if (sig) headers["x-boreon-signature"] = sig;
  return POST(new Request("https://fibernorth.com/api/bore-on/webhook", { method: "POST", headers, body: raw }));
}

beforeEach(() => {
  quoteDocs.clear();
  quoteDocs.set("q1", { customerName: "Pat" });
  state.secrets = { webhookSecret: "s3cret", baseUrl: "https://bore-on.com", apiKey: "bo.c.x" };
  state.readback = { result: { boreLengthFt: 260 } };
  state.limited = false;
  applied.length = 0;
});

describe("Bore-ON callback route", () => {
  it("re-prices from a correctly signed callback", async () => {
    const res = await call(payload());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, repriced: true, total: 4200 });
    expect(applied).toEqual([{ id: "q1", meta: { event: "design.designed", deliveryId: "d1:abc", url: "https://bore-on.com/design?id=des1", updatedAt: "2026-10-01T12:00:00Z" } }]);
  });

  it("says callbacks are not configured until a secret is saved", async () => {
    state.secrets = {};
    const res = await call(payload());
    expect(res.status).toBe(409);
    expect(applied).toHaveLength(0);
  });

  it("refuses a missing, wrong, tampered or stale signature", async () => {
    expect((await call(payload(), { signature: null })).status).toBe(401);
    expect((await call(payload(), { secret: "other" })).status).toBe(401);
    const raw = JSON.stringify(payload());
    const ts = String(Math.floor(Date.now() / 1000));
    expect((await call(null, { raw: `${raw} `, timestamp: ts, signature: signBoreOnBody("s3cret", ts, raw) })).status).toBe(401);
    expect((await call(payload(), { timestamp: String(Math.floor(Date.now() / 1000) - 3600) })).status).toBe(401);
    expect(applied).toHaveLength(0);
  });

  it("refuses a signed body that is not JSON or not the shape", async () => {
    expect((await call(null, { raw: "{not json" })).status).toBe(400);
    expect((await call({ ...payload(), event: "design.exploded" })).status).toBe(400);
    expect((await call({ ...payload(), boreOnStatus: "weird" })).status).toBe(400);
  });

  it("answers 404 for a design that is not one of ours, or a quote that is gone", async () => {
    expect((await call(payload({ externalRef: "someone-else:1" }))).status).toBe(404);
    expect((await call(payload({ externalRef: "fibernorth:quote:gone" }))).status).toBe(404);
  });

  it("treats a repeated delivery as done without re-pricing", async () => {
    quoteDocs.set("q1", { boreOnDeliveryId: "d1:abc" });
    const res = await call(payload());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, duplicate: true });
    expect(applied).toHaveLength(0);
  });

  it("asks Bore-ON to retry when the design cannot be read back", async () => {
    state.readback = null;
    expect((await call(payload())).status).toBe(503);
    expect(applied).toHaveLength(0);
  });

  it("is rate limited", async () => {
    state.limited = true;
    expect((await call(payload())).status).toBe(429);
  });
});
