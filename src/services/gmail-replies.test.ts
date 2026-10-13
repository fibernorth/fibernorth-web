// The Gmail reply check against an in-memory Firestore and a fake Gmail
// (fetch mocked). No real Google calls.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FakeDb } from "@/test/fakedb";

let db: FakeDb;
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakedb")).fakeFirestoreModule(() => db));

import { makeDb } from "@/test/fakedb";
import { syncGmailReplies } from "@/services/gmail-replies";
import { REPLY_NEXT_ACTION } from "@/lib/gmail-replies";

interface Msg {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  internalDate: string;
}

let inbox: Msg[];
let queries: string[];
let metadataFetches: string[];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fakeGoogle(input: string | URL | Request): Promise<Response> {
  const url = new URL(String(input));
  if (url.hostname === "oauth2.googleapis.com") return Promise.resolve(json(200, { access_token: "tok" }));
  const path = url.pathname.replace("/gmail/v1/users/me", "");
  if (path === "/messages") {
    queries.push(url.searchParams.get("q") || "");
    return Promise.resolve(json(200, { messages: inbox.map((m) => ({ id: m.id })) }));
  }
  const id = decodeURIComponent(path.replace("/messages/", ""));
  metadataFetches.push(id);
  const m = inbox.find((x) => x.id === id);
  if (!m) return Promise.resolve(json(404, { error: { message: "Not found" } }));
  return Promise.resolve(
    json(200, {
      id: m.id,
      internalDate: m.internalDate,
      snippet: m.snippet,
      payload: { headers: [{ name: "From", value: m.from }, { name: "Subject", value: m.subject }] },
    })
  );
}

const T0 = new Date("2026-10-13T15:00:00Z");
const later = (min: number) => new Date(T0.getTime() + min * 60_000);

beforeEach(() => {
  db = makeDb();
  db.put("integrationSecrets", "googleCalendar", { clientId: "cid", clientSecret: "csec", refreshToken: "cal" });
  db.put("integrationSecrets", "gmail", { refreshToken: "gm", accountEmail: "bill@fibernorth.com" });
  db.put("leads", "jane", { name: "Jane", email: "Jane@Example.com", stage: "new", nextAction: "Call back", nextActionAt: "2026-10-20", activity: [] });
  db.put("leads", "wonjob", { name: "Won", email: "won@x.com", stage: "won", nextAction: "Schedule the job", nextActionAt: "2026-10-10", activity: [] });
  inbox = [
    { id: "m1", from: '"Jane" <jane@example.com>', subject: "Re: Your quote", snippet: "Yes please", internalDate: String(T0.getTime() - 60_000) },
    { id: "m2", from: "news@store.com", subject: "Sale", snippet: "50% off", internalDate: String(T0.getTime() - 30_000) },
    { id: "m3", from: "won@x.com", subject: "Re: start date", snippet: "Monday works", internalDate: String(T0.getTime() - 10_000) },
  ];
  queries = [];
  metadataFetches = [];
  vi.stubGlobal("fetch", vi.fn(fakeGoogle));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("syncGmailReplies", () => {
  it("logs a lead's reply as a response and records the run", async () => {
    const r = await syncGmailReplies({ now: T0 });
    expect(r).toMatchObject({ ok: true, skipped: false, scanned: 3, logged: 2 });
    expect(queries[0]).toBe(`in:inbox -from:me after:${T0.getTime() / 1000 - 3 * 86400}`);

    const jane = db.get("leads", "jane")!;
    expect(jane.stage).toBe("contacted");
    expect(jane.lastContactAt).toBe("2026-10-13");
    expect(jane.nextAction).toBe(REPLY_NEXT_ACTION);
    expect(jane.nextActionAt).toBe("2026-10-13");
    expect(jane.activity).toHaveLength(1);
    expect(jane.activity[0]).toMatchObject({ type: "email", dir: "in", via: "gmail", text: 'Replied by email: "Re: Your quote" Yes please' });

    // Won: logged, next action left alone.
    const won = db.get("leads", "wonjob")!;
    expect(won.activity).toHaveLength(1);
    expect(won.nextAction).toBe("Schedule the job");
    expect(won.stage).toBe("won");

    expect(db.get("gmailSeen", "m1")).toBeTruthy();
    expect(db.get("gmailSeen", "m2")).toBeUndefined();
    const st = db.get("integrationStatus", "gmail")!;
    expect(st.lastCheckedEpoch).toBe(T0.getTime() / 1000);
    expect(st.lastLogged).toBe(2);
    expect(st.totalLogged).toBe(2);
  });

  it("waits two minutes between runs", async () => {
    await syncGmailReplies({ now: T0 });
    expect(await syncGmailReplies({ now: later(1) })).toEqual({ ok: true, skipped: true, reason: "throttled" });
  });

  it("never logs the same message twice, and only re-reads unlogged ones", async () => {
    await syncGmailReplies({ now: T0 });
    metadataFetches = [];
    const r = await syncGmailReplies({ now: later(3) });
    expect(r).toMatchObject({ ok: true, skipped: false, logged: 0 });
    expect(metadataFetches).toEqual(["m2"]);
    expect(queries[1]).toBe(`in:inbox -from:me after:${T0.getTime() / 1000 - 300}`);
    expect(db.get("leads", "jane")!.activity).toHaveLength(1);
  });

  it("a message already logged is skipped without reading it again", async () => {
    db.put("gmailSeen", "m1", { at: "earlier" });
    const r = await syncGmailReplies({ now: T0 });
    expect(r).toMatchObject({ logged: 1 });
    expect(metadataFetches).not.toContain("m1");
    expect(db.get("leads", "jane")!.activity).toHaveLength(0);
  });

  it("does nothing when Gmail isn't connected", async () => {
    db.put("integrationSecrets", "gmail", { refreshToken: "" });
    expect(await syncGmailReplies({ now: T0 })).toEqual({ ok: true, skipped: true, reason: "not_connected" });
    expect(queries).toEqual([]);
  });

  it("records Google's error and lets the next run retry from the same point", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (String(input).startsWith("https://oauth2")) return json(400, { error: "invalid_grant" });
      throw new Error("unexpected");
    }));
    const r = await syncGmailReplies({ now: T0 });
    expect(r).toEqual({ ok: false, error: "Google token refresh failed (400): invalid_grant" });
    const st = db.get("integrationStatus", "gmail")!;
    expect(st.lastError).toMatch(/invalid_grant/);
    expect(st.lastCheckedEpoch).toBeUndefined();
  });
});
