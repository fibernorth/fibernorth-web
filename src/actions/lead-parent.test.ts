// Putting an existing lead under a contractor account, and taking it out.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FakeDb } from "@/test/fakedb";

let db: FakeDb;
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakedb")).fakeFirestoreModule(() => db));
vi.mock("@/services/firebase-admin", () => ({ initializeAdminApp: () => ({}) }));
vi.mock("@/lib/server-action-auth", () => ({
  verifyServerActionCaller: async () => ({ uid: "u1", email: "Bill@fibernorth.com", owner: true }),
  verifyOwnerCaller: async () => ({ uid: "u1", email: "Bill@fibernorth.com", owner: true }),
}));

import { setLeadParent } from "@/actions/leads";

const texts = (id: string) => ((db.get("leads", id)!.activity || []) as Array<{ text: string; by?: string }>).map((a) => a.text);

beforeEach(async () => {
  db = (await import("@/test/fakedb")).makeDb();
  db.put("leads", "C1", { name: "Popp Excavating", isAccount: true, stage: "won", activity: [] });
  db.put("leads", "C2", { name: "Wojan", stage: "contacted", activity: [] });
  db.put("leads", "L1", { name: "12 Elm St", stage: "new", activity: [] });
  db.put("leads", "J1", { name: "Popp: 4 Oak", stage: "new", parentLeadId: "C1", activity: [] });
});

describe("setLeadParent", () => {
  it("puts a lead under an account, with a history line on both and an audit entry", async () => {
    expect(await setLeadParent("L1", "C1", "t")).toEqual({ ok: true });
    const l = db.get("leads", "L1")!;
    expect(l.parentLeadId).toBe("C1");
    expect(l.updatedAt).toBeTruthy();
    expect(texts("L1")).toContain("Moved under Popp Excavating");
    expect(texts("C1")).toContain("12 Elm St added as a job");
    expect((l.activity as Array<{ by?: string }>)[0].by).toBe("bill@fibernorth.com");
    expect([...db.data.auditLog.values()].some((a) => a.action === "lead.setParent")).toBe(true);
  });

  it("refuses a target that isn't a contractor account", async () => {
    const r = await setLeadParent("L1", "C2", "t");
    expect(r).toEqual({ ok: false, error: "Mark Wojan as a contractor account first." });
    expect(db.get("leads", "L1")!.parentLeadId).toBeUndefined();
    expect(texts("C2")).toEqual([]);
  });

  it("refuses an account, or a lead with jobs, as the job", async () => {
    db.put("leads", "C3", { name: "Big Co", isAccount: true, activity: [] });
    const acct = await setLeadParent("C3", "C1", "t");
    expect(acct.ok).toBe(false);
    // C2 isn't flagged, but it has a job of its own.
    db.put("leads", "J2", { name: "Wojan: 400 S", parentLeadId: "C2", activity: [] });
    const withJobs = await setLeadParent("C2", "C1", "t");
    expect(withJobs).toMatchObject({ ok: false, error: expect.stringContaining("has jobs of its own") });
    expect(db.get("leads", "C2")!.parentLeadId).toBeUndefined();
  });

  it("refuses itself, a missing (trashed) lead, and a job as the target", async () => {
    expect((await setLeadParent("C1", "C1", "t")).ok).toBe(false);
    expect((await setLeadParent("GONE", "C1", "t")).ok).toBe(false);
    expect((await setLeadParent("L1", "J1", "t")).ok).toBe(false);
  });

  it("takes a job back out from under its account", async () => {
    expect(await setLeadParent("J1", "", "t")).toEqual({ ok: true });
    expect(db.get("leads", "J1")!.parentLeadId).toBeUndefined();
    expect(texts("J1")).toContain("Taken out from under Popp Excavating");
    expect(texts("C1")).toContain("Popp: 4 Oak removed from jobs");
  });
});
