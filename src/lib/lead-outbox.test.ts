import { describe, it, expect } from "vitest";
import { OUTBOX_KEY, enqueueSave, flushOutbox, isNetworkError, readOutbox } from "./lead-outbox";

function memory() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
}

const broken = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

const act = { ts: "2026-09-25T15:00:00.000Z", type: "call" as const, text: "talked" };

describe("lead outbox", () => {
  it("queues and sends in order, then empties", async () => {
    const s = memory();
    expect(enqueueSave({ leadId: "a", patch: {}, activity: act }, s)).toBe(true);
    expect(enqueueSave({ leadId: "b", patch: { nextAction: "Call back" }, activity: null }, s)).toBe(true);
    expect(readOutbox(s).map((i) => i.leadId)).toEqual(["a", "b"]);
    const seen: string[] = [];
    const r = await flushOutbox(async (i) => {
      seen.push(i.leadId);
      return { ok: true };
    }, s);
    expect(seen).toEqual(["a", "b"]);
    expect(r).toEqual({ sent: 2, dropped: [], left: 0 });
    expect(s.raw.has(OUTBOX_KEY)).toBe(false);
  });

  it("stops at a network error and keeps the rest", async () => {
    const s = memory();
    enqueueSave({ leadId: "a", patch: {}, activity: act }, s);
    enqueueSave({ leadId: "b", patch: {}, activity: act }, s);
    const r = await flushOutbox(async () => {
      throw new TypeError("Failed to fetch");
    }, s);
    expect(r.left).toBe(2);
  });

  it("drops a save the server refuses and reports it", async () => {
    const s = memory();
    enqueueSave({ leadId: "gone", patch: {}, activity: act }, s);
    const r = await flushOutbox(async () => ({ ok: false, error: "Lead not found" }), s);
    expect(r.left).toBe(0);
    expect(r.dropped[0].error).toBe("Lead not found");
  });

  it("survives blocked or missing storage", async () => {
    expect(readOutbox(broken)).toEqual([]);
    expect(enqueueSave({ leadId: "a", patch: {}, activity: null }, broken)).toBe(false);
    expect(readOutbox(null)).toEqual([]);
    const s = memory();
    s.setItem(OUTBOX_KEY, "{not json");
    expect(readOutbox(s)).toEqual([]);
  });

  it("tells a dropped signal from a refusal", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"), true)).toBe(true);
    expect(isNetworkError(new TypeError("Load failed"), true)).toBe(true);
    expect(isNetworkError(new Error("Not authorized"), true)).toBe(false);
    expect(isNetworkError(new Error("anything"), false)).toBe(true);
  });
});
