/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDb, ArrayUnion, type FakeDb } from "@/test/fakedb-leads";

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { arrayUnion: (...items: unknown[]) => new ArrayUnion(items) },
}));

import { cleanLeadPatch, saveLeadServer } from "@/services/lead-writes";

let db: FakeDb;
const lead = () => db.all("leads")[0] as any;
beforeEach(() => {
  db = makeDb();
});

describe("saveLeadServer stage rules", () => {
  it("a queued save can't undo a customer's acceptance (expectStage)", async () => {
    await db.collection("leads").doc("a").set({ name: "A", stage: "won", quote: { status: "accepted", total: 1, version: 1 } });
    await expect(
      saveLeadServer(db as any, "a", { stage: "walk_done" }, { ts: "2026-09-26T12:00:00.000Z", type: "stage", text: "Moved to Walked" }, { expectStage: "walk_scheduled" })
    ).rejects.toThrow(/Stage not changed/);
    expect(lead().stage).toBe("won");
    expect(lead().activity).toBeUndefined();
  });

  it("the dropdown can't leave Won while the acceptance stands", async () => {
    await db.collection("leads").doc("a").set({ name: "A", stage: "won", quote: { status: "accepted", total: 1, version: 1 } });
    await expect(saveLeadServer(db as any, "a", { stage: "quoted" }, undefined, { expectStage: "won" })).rejects.toThrow(/Undo acceptance/);
  });

  it("close out remembers the stage; Reopen goes back to it and onto today's list", async () => {
    await db.collection("leads").doc("a").set({ name: "A", stage: "walk_done", nextAction: "Send quote", nextActionAt: "2026-09-30" });
    await saveLeadServer(db as any, "a", { stage: "lost", objection: "Price", nextAction: "", nextActionAt: "" }, { ts: "2026-09-26T12:00:00.000Z", type: "stage", text: "Said no: Price" });
    expect(lead()).toMatchObject({ stage: "lost", stageBeforeClose: "walk_done", nextAction: "" });
    const reopen = { ts: "2026-09-27T12:00:00.000Z", type: "stage" as const, text: "Reopened" };
    await saveLeadServer(db as any, "a", {}, reopen, { reopen: true, expectStage: "lost" });
    expect(lead()).toMatchObject({ stage: "walk_done", nextAction: "Check back", stageBeforeClose: "" });
    expect(lead().nextActionAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(lead().activity.at(-1).text).toBe("Reopened (back to Walked)");
    // A replayed Reopen does nothing.
    await saveLeadServer(db as any, "a", {}, reopen, { reopen: true, expectStage: "lost" });
    expect(lead().activity.filter((x: any) => /Reopened/.test(x.text))).toHaveLength(1);
  });

  it("Not a lead from the dropdown gets a reason; leaving it clears the reason", async () => {
    await db.collection("leads").doc("a").set({ name: "A", stage: "new", nextAction: "Call back", nextActionAt: "2026-09-26" });
    await saveLeadServer(db as any, "a", { stage: "not_a_lead" });
    expect(lead()).toMatchObject({ stage: "not_a_lead", disqualifyReason: "other", nextAction: "", nextActionAt: "" });
    await saveLeadServer(db as any, "a", { stage: "contacted" });
    expect(lead()).toMatchObject({ stage: "contacted", disqualifyReason: "", disqualifiedAt: "" });
  });
});

describe("cleanLeadPatch", () => {
  it("refuses an unknown stage or a bad date, keeps good ones", () => {
    expect(() => cleanLeadPatch({ stage: "maybe" })).toThrow(/Unknown stage/);
    expect(() => cleanLeadPatch({ nextActionAt: "Friday" })).toThrow(/date/);
    expect(() => cleanLeadPatch({ appointmentAt: "2026-02-30" })).toThrow(/date/);
    expect(() => cleanLeadPatch({ appointmentTime: "2pm" })).toThrow(/time/);
    expect(cleanLeadPatch({ stage: "won", nextActionAt: "2026-10-02", appointmentTime: "14:30", jobDoneAt: "" })).toEqual({
      stage: "won",
      nextActionAt: "2026-10-02",
      appointmentTime: "14:30",
      jobDoneAt: "",
    });
    // Control keys and server-owned fields never pass through.
    expect(cleanLeadPatch({ expectStage: "won", reopen: true, sheetOwned: {}, stageBeforeClose: "won" })).toEqual({});
  });
});
