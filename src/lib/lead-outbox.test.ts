import { describe, it, expect } from "vitest";
import {
  OUTBOX_KEY,
  baseValuesFor,
  clearExpired,
  describeOutboxItem,
  enqueueSave,
  flushOutbox,
  isNetworkError,
  patchToSend,
  readExpired,
  readOutbox,
} from "./lead-outbox";

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
    expect(r).toEqual({ sent: 2, dropped: [], left: 0, expired: [] });
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

describe("stale offline saves", () => {
  const day = 24 * 60 * 60 * 1000;

  it("doesn't send saves older than a day; keeps them for the notice until dismissed", async () => {
    const s = memory();
    const now = new Date("2026-09-26T12:00:00.000Z");
    enqueueSave({ leadId: "old", leadName: "Ellis", patch: { nextAction: "Call back" }, activity: act }, s, new Date(now.getTime() - day - 1000));
    enqueueSave({ leadId: "new", patch: {}, activity: act }, s, new Date(now.getTime() - day + 60_000));
    const seen: string[] = [];
    const r = await flushOutbox(
      async (i) => {
        seen.push(i.leadId);
        return { ok: true };
      },
      s,
      now
    );
    expect(seen).toEqual(["new"]);
    expect(r.expired.map((i) => i.leadId)).toEqual(["old"]);
    expect(r.left).toBe(0);
    expect(readExpired(s).map((i) => i.leadId)).toEqual(["old"]);
    expect(describeOutboxItem(r.expired[0])).toMatch(/^Ellis \(.+\): "talked"; nextAction: Call back$/);
    // A second flush doesn't report it again; dismissing clears it.
    expect((await flushOutbox(async () => ({ ok: true }), s, now)).expired).toEqual([]);
    clearExpired(s);
    expect(readExpired(s)).toEqual([]);
  });

  it("captures base values for the changed fields and sends them with the patch", async () => {
    const lead = { id: "a", nextAction: "Call back", nextActionAt: "2026-09-25", stage: "contacted" };
    const patch = { nextAction: "Send quote", nextActionAt: "2026-09-27", notes: "x", expectStage: "contacted" };
    const base = baseValuesFor(lead, patch);
    expect(base).toEqual({ nextAction: "Call back", nextActionAt: "2026-09-25", notes: null });
    const s = memory();
    enqueueSave({ leadId: "a", patch, base, activity: null }, s);
    let sentPatch: Record<string, unknown> = {};
    await flushOutbox(async (i) => {
      sentPatch = patchToSend(i);
      return { ok: true };
    }, s);
    expect(sentPatch).toEqual({ ...patch, base });
    // Items queued before this shipped have no base and go out unchanged.
    expect(patchToSend({ patch: { notes: "y" } })).toEqual({ notes: "y" });
  });
});
