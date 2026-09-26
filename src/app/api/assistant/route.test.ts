// The voice assistant's apply step: finished actions are recorded on the
// plan so an apply that was cut off resumes with the rest, created leads
// have a fixed id, and a retry doesn't repeat history lines.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDb, ArrayUnion, type FakeDb } from "@/test/fakedb-leads";

let db: FakeDb;
vi.mock("next/server", () => ({
  NextResponse: { json: (body: any, init?: any) => ({ status: init?.status ?? 200, body }) },
}));
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => db,
  FieldValue: { arrayUnion: (...items: unknown[]) => new ArrayUnion(items) },
}));
vi.mock("@/services/firebase-admin", () => ({ initializeAdminApp: () => ({}) }));
vi.mock("@/lib/api-auth", () => ({ verifyApiAuth: async () => ({ authorized: true, uid: "bill" }) }));
vi.mock("@/lib/google-calendar", () => ({ syncLeadEventById: async () => {} }));

import { POST } from "@/app/api/assistant/route";

async function apply(planId: string, keep: number[]) {
  const req = new Request("http://x/api/assistant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "apply", planId, keep }),
  });
  const r: any = await POST(req);
  return r;
}

const future = () => new Date(Date.now() + 10 * 60 * 1000).toISOString();

beforeEach(async () => {
  db = makeDb();
  await db.collection("leads").doc("pat").set({ name: "Pat", phone: "231-555-0100", email: "", stage: "new", activity: [] });
});

describe("assistant apply", () => {
  it("creates a lead with the plan's fixed id, once, and later actions find it", async () => {
    await db.collection("assistantPlans").doc("p1").set({
      uid: "bill",
      createdAt: new Date().toISOString(),
      expiresAt: future(),
      actions: [
        { tool: "create_lead", label: "Add Sue", input: { name: "Sue", phone: "231-555-0199", email: "", address: "", serviceType: "", source: "phone", notes: "", __placeholder: "new-1" } },
        { tool: "log_activity", label: "Log call", input: { leadId: "new-1", type: "call", text: "Talked" } },
      ],
    });
    const r = await apply("p1", [0, 1]);
    expect(r.body.results).toEqual(["Added Sue", "Logged call"]);
    const sue = db.all("leads").find((l: any) => l.name === "Sue") as any;
    expect(sue.id).toBe("p1-0");
    expect(sue.stage).toBe("contacted");
    const again = await apply("p1", [0, 1]);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("Already saved.");
    expect(db.all("leads")).toHaveLength(2);
  });

  it("resumes an apply that was cut off, without repeating what finished", async () => {
    await db.collection("assistantPlans").doc("p2").set({
      uid: "bill",
      createdAt: new Date().toISOString(),
      expiresAt: future(),
      startedAt: "2026-09-26T15:00:00.000Z",
      kept: [0, 1],
      done: [0],
      actions: [
        { tool: "log_activity", label: "Log text", input: { leadId: "pat", type: "text", text: "Sent address" } },
        { tool: "set_next_action", label: "Next", input: { leadId: "pat", text: "Call back", date: "2026-10-02" } },
      ],
    });
    // The first run's text line is already on the lead.
    await db.collection("leads").doc("pat").update({
      activity: new ArrayUnion([{ ts: "2026-09-26T15:00:00.000Z", type: "text", text: "Sent address", via: "voice" }]),
    });
    const r = await apply("p2", [0, 1]);
    expect(r.body.results).toEqual(["Next action set for 2026-10-02"]);
    const pat = db.all("leads").find((l: any) => l.id === "pat") as any;
    expect(pat.activity.filter((a: any) => a.text === "Sent address")).toHaveLength(1);
    expect(pat.nextActionAt).toBe("2026-10-02");
    const plan = db.all("assistantPlans")[0] as any;
    expect(plan.done).toEqual([0, 1]);
    expect(plan.completedAt).toBeTruthy();
  });

  it("a second tap while the first is still saving is turned away", async () => {
    await db.collection("assistantPlans").doc("p3").set({
      uid: "bill", createdAt: new Date().toISOString(), expiresAt: future(),
      startedAt: new Date().toISOString(), leaseUntil: future(), kept: [0], done: [],
      actions: [{ tool: "log_activity", label: "Log", input: { leadId: "pat", type: "note", text: "x" } }],
    });
    const r = await apply("p3", [0]);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/Still saving/);
  });

  it("a date that isn't a date is refused at apply time", async () => {
    await db.collection("assistantPlans").doc("p4").set({
      uid: "bill", createdAt: new Date().toISOString(), expiresAt: future(),
      actions: [{ tool: "set_next_action", label: "Next", input: { leadId: "pat", text: "Call", date: "whenever" } }],
    });
    const r = await apply("p4", [0]);
    expect(r.body.results[0]).toMatch(/^Failed: Next/);
    expect((db.all("leads")[0] as any).nextActionAt).toBeUndefined();
  });
});
