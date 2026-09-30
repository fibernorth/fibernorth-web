// Jobs under a contractor account: createLead with parentLeadId.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FakeDb } from "@/test/fakedb";

let db: FakeDb;
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakedb")).fakeFirestoreModule(() => db));
vi.mock("@/services/firebase-admin", () => ({ initializeAdminApp: () => ({}) }));
vi.mock("@/lib/server-action-auth", () => ({
  verifyServerActionCaller: async () => ({ uid: "u1", email: "bill@fibernorth.com", owner: true }),
}));

import { createLead } from "@/actions/leads";

beforeEach(async () => {
  db = (await import("@/test/fakedb")).makeDb();
  db.put("leads", "C1", { name: "Popp Excavating", phone: "231-555-0100", email: "office@popp.test", stage: "won", activity: [] });
});

describe("jobs under a contractor", () => {
  it("adds a job lead linked to the contractor, with its phone, and notes it on both", async () => {
    const r = await createLead(
      { name: "Popp Excavating: 12 Elm St", address: "12 Elm St", phone: "231-555-0100", email: "office@popp.test", parentLeadId: "C1" },
      "t"
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const job = db.get("leads", r.id)!;
    expect(job).toMatchObject({ parentLeadId: "C1", stage: "new", nextAction: "Set up the job", address: "12 Elm St" });
    expect(JSON.stringify(job.activity)).toContain("New job for Popp Excavating");
    expect(JSON.stringify(db.get("leads", "C1")!.activity)).toContain("New job added: Popp Excavating: 12 Elm St");
  });

  it("the same phone as the contractor isn't a duplicate for a job, but still is for a plain lead", async () => {
    const plain = await createLead({ name: "Someone", phone: "231-555-0100" }, "t");
    expect(plain.ok).toBe(false);
    const job = await createLead({ name: "Job", phone: "231-555-0100", parentLeadId: "C1" }, "t");
    expect(job.ok).toBe(true);
  });

  it("refuses a contractor that doesn't exist", async () => {
    const r = await createLead({ name: "Job", parentLeadId: "NOPE" }, "t");
    expect(r.ok).toBe(false);
  });
});
