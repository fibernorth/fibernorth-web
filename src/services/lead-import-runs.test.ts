// Letter logging and imports: dry run, apply, undo, against an in-memory Firestore.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FakeDb } from "@/test/fakedb-bulk";

let db: FakeDb;
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakedb-bulk")).fakeFirestoreModule(() => db));

import { makeDb } from "@/test/fakedb-bulk";
import { applyImport, importLeadDocId, listImportRuns, previewImport, undoImportRun } from "@/services/lead-import-runs";
import { confirmQuestion, letterExternalId, mailingListIds, runLabel, type MailingRow } from "@/lib/lead-import";
import contractorsCore from "../../marketing/contractors/recipients-master-core.json";

const by = "bill@fibernorth.com";
const leads = () => db.all("leads") as any[];
const letter2 = { source: "contractors" as const, letter: 2, date: "2026-10-02" };

async function importContractors() {
  const p = await previewImport(db as any, { source: "contractors" });
  return applyImport(db as any, { source: "contractors" }, { by, expect: p.counts });
}

describe("contractor import and letter 2", () => {
  beforeEach(() => {
    db = makeDb();
  });

  it("a dry run writes nothing and lists up to 20 names", async () => {
    const p = await previewImport(db as any, { source: "contractors" });
    expect(p.counts.create).toBe(278);
    expect(p.examples.create).toHaveLength(20);
    expect(leads()).toHaveLength(0);
    expect(db.all("importRuns")).toHaveLength(0);
  });

  it("creates with deterministic ids, so a second run adds nothing", async () => {
    const r = await importContractors();
    expect(r.created).toBe(278);
    const again = await previewImport(db as any, { source: "contractors" });
    expect(again.counts).toEqual({ create: 0, update: 0, skip: 278 });
    const one = leads()[0];
    expect(one.id).toBe(importLeadDocId(one.externalId));
  });

  it("two runs at once can't duplicate", async () => {
    const [a, b] = await Promise.all([
      applyImport(db as any, { source: "contractors" }, { by }),
      applyImport(db as any, { source: "contractors" }, { by }),
    ]);
    expect(leads()).toHaveLength(278);
    expect(a.created + b.created).toBe(278);
  });

  it("previews letter 2 with a confirm question, then logs it stamped with the batch", async () => {
    await importContractors();
    const p = await previewImport(db as any, letter2);
    expect(p.counts.update).toBe(217);
    expect(p.notOnList).toBe(278 - 217);
    expect(confirmQuestion(p)).toBe("Log letter 2 on 217 contractors dated Oct 2?");
    expect(leads().some((l) => l.activity.some((a: any) => a.text === "Letter 2 mailed"))).toBe(false);

    const r = await applyImport(db as any, letter2, { by, expect: p.counts });
    expect(r.updated).toBe(217);
    const run = db.get("importRuns", r.runId)!;
    expect(run).toMatchObject({ kind: "letter", by, status: "applied", counts: { update: 217 } });
    expect(run.leadIds).toHaveLength(217);
    const coreIds = mailingListIds("contractor", contractorsCore as MailingRow[]);
    const logged = leads().filter((l) => coreIds.has(l.externalId));
    for (const l of logged) {
      expect(l.activity).toContainEqual(expect.objectContaining({ ts: "2026-10-02T12:00:00.000Z", type: "letter", text: "Letter 2 mailed", batchId: r.runId }));
      expect(l.lastContactAt).toBe("2026-10-02");
    }
    expect(runLabel((await listImportRuns(db as any))[0])).toBe("Letter 2 logged on 217 contractors, dated Oct 2");
  });

  it("refuses to apply when the leads changed since the preview", async () => {
    await importContractors();
    const p = await previewImport(db as any, letter2);
    await applyImport(db as any, letter2, { by }); // another tab got there first
    await expect(applyImport(db as any, letter2, { by, expect: p.counts })).rejects.toThrow(/changed since the preview/);
  });

  it("undo takes out exactly the batch's lines and restores the dates, then a corrected date can be logged", async () => {
    await importContractors();
    const sample = leads().find((l) => mailingListIds("contractor", contractorsCore as MailingRow[]).has(l.externalId) && !l.lastContactAt)!;
    const withL1 = leads().find((l) => l.lastContactAt === "2026-09-04" && mailingListIds("contractor", contractorsCore as MailingRow[]).has(l.externalId))!;
    // Bill logs a real call on one lead after the batch: that date must stay.
    const wrong = await applyImport(db as any, { ...letter2, date: "2026-10-20" }, { by });
    const called = db.get("leads", withL1.id)!;
    db.put("leads", withL1.id, {
      ...called,
      lastContactAt: "2026-10-21",
      activity: [...called.activity, { ts: "2026-10-21T15:00:00.000Z", type: "call", text: "talked" }],
    });

    const u = await undoImportRun(db as any, wrong.runId, { by });
    expect(u.entriesRemoved).toBe(217);
    expect(u.skipped.map((s) => s.id)).toEqual([withL1.id]);
    const s = db.get("leads", sample.id)!;
    expect(s.activity.some((a: any) => a.text === "Letter 2 mailed")).toBe(false);
    expect(s.lastContactAt).toBe(""); // what it was before
    expect(s.nextAction).toBe("Mail letter 1");
    const c = db.get("leads", withL1.id)!;
    expect(c.lastContactAt).toBe("2026-10-21");
    expect(c.activity.map((a: any) => a.text)).toEqual(["Letter 1 mailed", "talked"]);
    await expect(undoImportRun(db as any, wrong.runId, { by })).rejects.toThrow(/already undone/);

    // Redo with the right date.
    const right = await applyImport(db as any, letter2, { by });
    expect(right.updated).toBe(217);
    expect(db.get("leads", sample.id)!.lastContactAt).toBe("2026-10-02");
  });

  it("undo of an import moves untouched new leads to the trash and keeps worked ones", async () => {
    const r = await importContractors();
    const worked = leads()[0];
    db.put("leads", worked.id, { ...db.get("leads", worked.id)!, touched: true, updatedAt: "2026-10-05T00:00:00.000Z" });
    const u = await undoImportRun(db as any, r.runId, { by });
    expect(u.leadsRemoved).toBe(277);
    expect(u.skipped).toEqual([{ id: worked.id, name: worked.name, reason: "worked on since the import, so it was kept" }]);
    expect(leads().map((l) => l.id)).toEqual([worked.id]);
    expect(db.all("trash")).toHaveLength(277);
    expect(db.all("trash")[0]).toMatchObject({ col: "leads", deletedBy: by.toLowerCase() });
  });
});

describe("website quotes", () => {
  beforeEach(() => {
    db = makeDb();
    db.put("quoteRequests", "Q1", { name: "Pat", createdAt: "2026-09-01T00:00:00Z", status: "new" });
    db.put("quoteRequests", "Q2", { name: "Lee", createdAt: "2026-09-02T00:00:00Z", status: "new", leadId: "L9" });
    db.put("leads", "L9", { name: "Lee", quoteId: "Q2" });
  });

  it("previews, applies with the quote link in the same commit, and undoes", async () => {
    const p = await previewImport(db as any, { source: "quotes" });
    expect(p.counts).toEqual({ create: 1, update: 0, skip: 1 });
    expect(confirmQuestion(p)).toBe("Add 1 lead from website quotes?");
    const r = await applyImport(db as any, { source: "quotes" }, { by, expect: p.counts });
    const id = importLeadDocId("quote:Q1");
    expect(db.get("quoteRequests", "Q1")!.leadId).toBe(id);
    expect(db.get("leads", id)!.externalId).toBe("quote:Q1");
    await undoImportRun(db as any, r.runId, { by });
    expect(db.get("leads", id)).toBeUndefined();
    expect(db.get("quoteRequests", "Q1")!.leadId).toBeUndefined();
  });
});

describe("campground letter", () => {
  it("externalIds on the list match the import", () => {
    expect(letterExternalId("campground", "A B", "1 Main St")).toBe("campground:a-b:1-main-st");
  });
});
