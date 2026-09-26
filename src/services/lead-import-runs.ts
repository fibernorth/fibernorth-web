// Server side of the Leads -> Import panel: plan a bulk import or letter log
// (dry run, nothing written), apply exactly that kind of run, and undo a run.
// Admin SDK only; every write is awaited.
//
// Every applied run is recorded at importRuns/{runId}:
//   { kind, params, by, at, status, counts, leadIds, createdIds, entry,
//     before: { leadId: { lastContactAt, nextAction, nextActionAt } },
//     after:  { leadId: <what the run set> } }
// and each history line it adds carries `batchId: runId`, so "Undo this
// batch" can take out exactly those lines (arrayRemove of the stored entry)
// and put back the old dates where the lead still has what the run set.
//
// New leads get a document id derived from their externalId and are written
// with create(), so two runs at once (two tabs, a double tap) can't make two.

import { createHash } from "crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import campgrounds from "@/data/campground-recipients.json";
import contractors from "@/data/contractor-recipients.json";
// The mailing lists themselves (what went to the printer) decide who a
// letter is logged on.
import contractorsLetter1 from "../../marketing/contractors/recipients-contractors.json";
import contractorsCore from "../../marketing/contractors/recipients-master-core.json";
import campgroundsWave1 from "../../marketing/campgrounds/recipients-wave1-full.json";
import campgroundsCurrent from "../../marketing/campgrounds/recipients.json";
import { todayISO, type LeadActivity } from "@/lib/leads";
import type { QuoteRequest } from "@/lib/types";
import {
  IMPORT_EXAMPLES,
  letterExternalId,
  leadFromWebsiteQuote,
  letterLogPatch,
  mailingListIds,
  quoteNeedsLead,
  type BatchedActivity,
  type ImportCounts,
  type ImportParams,
  type ImportPreview,
  type ImportRunSummary,
  type LetterFields,
  type MailingRow,
} from "@/lib/lead-import";

const AT_A_TIME = 10;

/** Document id for a lead made by an import: stable for its externalId. */
export function importLeadDocId(externalId: string): string {
  return `imp_${createHash("sha256").update(externalId).digest("hex").slice(0, 24)}`;
}

/** Who got each letter. A letter with no list here can't be logged yet. */
function contractorList(letter: number): MailingRow[] | null {
  if (letter === 1) return contractorsLetter1 as MailingRow[]; // the 94 mailed Sept 4
  if (letter === 2) return contractorsCore as MailingRow[]; // the 217 core-county list
  return null;
}
function campgroundList(letter: number): MailingRow[] {
  return (letter === 1 ? campgroundsWave1 : campgroundsCurrent) as MailingRow[];
}

export class ImportError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

interface PlannedCreate {
  id: string;
  name: string;
  externalId: string;
  doc: Record<string, unknown>;
  /** Website quote this lead is made from (its leadId is set in the same transaction). */
  quoteId?: string;
}
interface PlannedUpdate {
  id: string;
  name: string;
}
interface Plan {
  params: ImportParams;
  entry: BatchedActivity | null;
  creates: PlannedCreate[];
  updates: PlannedUpdate[];
  skips: Array<{ name: string; reason: string }>;
  notOnList: number;
  total: number;
  recipients: number | null;
}

const isAlreadyExists = (e: unknown) => {
  const code = (e as { code?: unknown })?.code;
  return code === 6 || code === "already-exists" || /ALREADY_EXISTS/.test(String((e as Error)?.message));
};

async function inChunks<T>(items: T[], fn: (t: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += AT_A_TIME) await Promise.all(items.slice(i, i + AT_A_TIME).map(fn));
}

/**
 * Work out what a run would do against the leads as they are now. Writes
 * nothing. `batchId` and `now` are what the new docs and entries will carry.
 */
async function plan(db: Firestore, params: ImportParams, batchId: string, now: string, by = ""): Promise<Plan> {
  const today = todayISO();
  const leads = db.collection("leads");
  const existing = new Map<string, { id: string; name: string; data: FirebaseFirestore.DocumentData }>();
  const leadIds = new Set<string>();
  const quoteIds = new Set<string>();
  (await leads.get()).forEach((d) => {
    leadIds.add(d.id);
    const data = d.data();
    if (typeof data.externalId === "string" && data.externalId) existing.set(data.externalId, { id: d.id, name: String(data.name || ""), data });
    if (typeof data.quoteId === "string" && data.quoteId) quoteIds.add(data.quoteId);
  });

  const out: Plan = { params, entry: null, creates: [], updates: [], skips: [], notOnList: 0, total: 0, recipients: null };

  if (params.source === "quotes") {
    const quotes = await db.collection("quoteRequests").orderBy("createdAt", "desc").get();
    const known = { externalIds: new Set(existing.keys()), leadIds, quoteIds };
    out.total = quotes.size;
    for (const q of quotes.docs) {
      const d = q.data();
      const name = String(d.name || d.address || q.id);
      if (!quoteNeedsLead({ id: q.id, leadId: typeof d.leadId === "string" ? d.leadId : "" }, known)) {
        out.skips.push({ name, reason: "already has a lead" });
        continue;
      }
      const lead = leadFromWebsiteQuote({ id: q.id, ...(d as Omit<QuoteRequest, "id">) }, now, today);
      const externalId = `quote:${q.id}`;
      out.creates.push({
        id: importLeadDocId(externalId),
        name,
        externalId,
        quoteId: q.id,
        doc: { ...lead, importBatchId: batchId, activity: stamp(lead.activity as LeadActivity[], batchId) },
      });
    }
    return out;
  }

  const letter = params.letter;
  const date = params.date || today;
  // `by` is set here, where the entry is built and stored on the run: undo
  // matches the stored entry object exactly.
  const entry: BatchedActivity | null = letter
    ? { ts: `${date}T12:00:00.000Z`, type: "letter", text: `Letter ${letter} mailed`, batchId, ...(by ? { by } : {}) }
    : null;
  out.entry = entry;

  const planExisting = (found: { id: string; name: string; data: FirebaseFirestore.DocumentData }) => {
    if (!entry) {
      out.skips.push({ name: found.name, reason: "already in the pipeline" });
      return;
    }
    const patch = letterLogPatch(letterFieldsOf(found.data), entry, date);
    if (!patch) out.skips.push({ name: found.name, reason: `${entry.text} already logged` });
    else out.updates.push({ id: found.id, name: found.name });
  };

  if (params.source === "contractors") {
    const got = letter ? contractorList(letter) : null;
    if (letter && !got) {
      throw new ImportError(`There is no mailing list for contractor letter ${letter} yet, so nothing was logged.`);
    }
    out.recipients = got?.length ?? null;
    const gotIds = got ? mailingListIds("contractor", got) : null;
    // 278 contractors: the 94 mailed letter 1 on Sept 4 plus verified
    // additions that have had nothing yet. Every 30 days check-in cadence.
    const list = contractors as Array<{ name: string; trade: string; address: string; mailedLetter1: boolean }>;
    out.total = list.length;
    for (const c of list) {
      const externalId = letterExternalId("contractor", c.name, c.address);
      const found = existing.get(externalId);
      const gotThisLetter = Boolean(gotIds?.has(externalId));
      if (!found) {
        const activity: LeadActivity[] = c.mailedLetter1
          ? [{ ts: "2026-09-04T12:00:00.000Z", type: "letter", text: "Letter 1 mailed" }]
          : [];
        if (entry && gotThisLetter && !activity.some((a) => a.text === entry.text)) activity.push(entry);
        const last = activity.length ? activity[activity.length - 1].ts.slice(0, 10) : "";
        const mailed = activity.length > 0;
        out.creates.push({
          id: importLeadDocId(externalId),
          name: c.name,
          externalId,
          doc: {
            name: c.name,
            phone: "",
            email: "",
            address: c.address,
            serviceType: `Sub / referral partner (${c.trade})`,
            source: "contractor-letter",
            externalId,
            stage: "nurture",
            contactEveryDays: 30,
            lastContactAt: last,
            nextAction: mailed ? "" : "Mail letter 1",
            nextActionAt: mailed ? "" : today,
            notes: "",
            activity: stamp(activity, batchId),
            touched: false,
            importBatchId: batchId,
            createdAt: now,
            updatedAt: now,
          },
        });
      } else if (entry && !gotThisLetter) {
        out.notOnList += 1;
        out.skips.push({ name: found.name, reason: `not on letter ${letter}'s list` });
      } else {
        planExisting(found);
      }
    }
    return out;
  }

  // Campgrounds
  const gotIds = letter ? mailingListIds("campground", campgroundList(letter)) : null;
  if (letter) out.recipients = campgroundList(letter).length;
  const list = campgrounds as Array<{ name: string; contact: string; address: string }>;
  out.total = list.length;
  for (const c of list) {
    const externalId = letterExternalId("campground", c.name, c.address);
    const found = existing.get(externalId);
    if (!found) {
      const activity: LeadActivity[] = [
        { ts: "2026-09-04T12:00:00.000Z", type: "letter", text: "Letter 1 mailed" },
        { ts: "2026-09-18T12:00:00.000Z", type: "letter", text: "Letter 2 mailed" },
      ];
      if (entry && gotIds?.has(externalId) && !activity.some((a) => a.text === entry.text)) activity.push(entry);
      const last = activity[activity.length - 1].ts.slice(0, 10);
      out.creates.push({
        id: importLeadDocId(externalId),
        name: c.name,
        externalId,
        doc: {
          name: c.name,
          contactName: c.contact && !/owner or manager/i.test(c.contact) ? c.contact : "",
          phone: "",
          email: "",
          address: c.address,
          serviceType: "Campground fiber / WiFi feed",
          source: "campground-letter",
          externalId,
          stage: "nurture",
          contactEveryDays: 14,
          lastContactAt: last,
          nextAction: "",
          nextActionAt: "",
          notes: "",
          activity: stamp(activity, batchId),
          touched: false,
          importBatchId: batchId,
          createdAt: now,
          updatedAt: now,
        },
      });
    } else if (entry && !gotIds?.has(externalId)) {
      out.notOnList += 1;
      out.skips.push({ name: found.name, reason: `not on letter ${letter}'s list` });
    } else {
      planExisting(found);
    }
  }
  return out;
}

function stamp(activity: LeadActivity[], batchId: string): BatchedActivity[] {
  return activity.map((a) => ({ ...a, batchId }));
}

function letterFieldsOf(d: FirebaseFirestore.DocumentData | undefined): {
  activity: LeadActivity[];
  lastContactAt?: string;
  nextAction?: string;
  nextActionAt?: string;
} {
  return {
    activity: (d?.activity as LeadActivity[]) || [],
    lastContactAt: typeof d?.lastContactAt === "string" ? d.lastContactAt : undefined,
    nextAction: typeof d?.nextAction === "string" ? d.nextAction : undefined,
    nextActionAt: typeof d?.nextActionAt === "string" ? d.nextActionAt : undefined,
  };
}

function preview(p: Plan): ImportPreview {
  const names = (xs: Array<{ name: string }>) => xs.slice(0, IMPORT_EXAMPLES).map((x) => x.name);
  return {
    dryRun: true,
    params: p.params,
    counts: { create: p.creates.length, update: p.updates.length, skip: p.skips.length },
    examples: {
      create: names(p.creates),
      update: names(p.updates),
      skip: p.skips.slice(0, IMPORT_EXAMPLES).map((s) => `${s.name} (${s.reason})`),
    },
    notOnList: p.notOnList,
    total: p.total,
    recipients: p.recipients,
  };
}

/** Dry run: what the run would do, nothing written. */
export async function previewImport(db: Firestore, params: ImportParams): Promise<ImportPreview> {
  return preview(await plan(db, params, "preview", new Date().toISOString()));
}

export interface ApplyResult {
  runId: string;
  counts: ImportCounts;
  created: number;
  updated: number;
  skipped: Array<{ name: string; reason: string }>;
  notOnList: number;
}

/**
 * Apply a run. `expect` is the preview's create/update counts: when the
 * pipeline has changed since the preview (another run, an edit), nothing is
 * written and the caller is asked to check again.
 */
export async function applyImport(
  db: Firestore,
  params: ImportParams,
  opts: { by: string; expect?: { create: number; update: number } }
): Promise<ApplyResult> {
  const runRef = db.collection("importRuns").doc();
  const runId = runRef.id;
  const now = new Date().toISOString();
  const p = await plan(db, params, runId, now, opts.by);
  if (opts.expect && (opts.expect.create !== p.creates.length || opts.expect.update !== p.updates.length)) {
    throw new ImportError(
      `The leads changed since the preview (now ${p.creates.length} to add and ${p.updates.length} to update). Nothing was written; check again.`,
      409
    );
  }
  const kind = params.letter ? "letter" : "import";
  // The run doc goes first, so every line stamped with its id can be found
  // and undone even if this request dies part way.
  await runRef.set({
    kind,
    params: { source: params.source, letter: params.letter ?? null, date: params.letter ? params.date || todayISO() : null },
    by: opts.by,
    at: now,
    status: "running",
    entry: p.entry,
    counts: { create: 0, update: 0, skip: 0 },
    leadIds: [],
    createdIds: [],
    before: {},
    after: {},
  });

  const skipped = [...p.skips];
  const createdIds: string[] = [];
  const updatedIds: string[] = [];
  const before: Record<string, LetterFields> = {};
  const after: Record<string, LetterFields> = {};
  const leads = db.collection("leads");

  try {
    await inChunks(p.creates, async (c) => {
      const ref = leads.doc(c.id);
      try {
        if (c.quoteId) {
          const qRef = db.collection("quoteRequests").doc(c.quoteId);
          const made = await db.runTransaction(async (tx) => {
            const [q, l] = await Promise.all([tx.get(qRef), tx.get(ref)]);
            if (l.exists) return false;
            const leadId = q.get("leadId");
            if (!q.exists || (typeof leadId === "string" && leadId)) return false;
            tx.create(ref, c.doc);
            // The quote's link back goes in the same commit, so a proposal
            // sent later carries the leadId.
            tx.update(qRef, { leadId: ref.id });
            return true;
          });
          if (!made) {
            skipped.push({ name: c.name, reason: "added by another run meanwhile" });
            return;
          }
        } else {
          await ref.create(c.doc);
        }
        createdIds.push(c.id);
      } catch (e) {
        if (!isAlreadyExists(e)) throw e;
        skipped.push({ name: c.name, reason: "added by another run meanwhile" });
      }
    });

    const entry = p.entry;
    if (entry) {
      const date = entry.ts.slice(0, 10);
      await inChunks(p.updates, async (u) => {
        const ref = leads.doc(u.id);
        const done = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists) return null;
          const fresh = letterFieldsOf(snap.data());
          const patch = letterLogPatch(fresh, entry, date);
          if (!patch) return null;
          tx.update(ref, { ...patch, activity: FieldValue.arrayUnion(entry), updatedAt: now });
          return {
            before: {
              lastContactAt: fresh.lastContactAt ?? null,
              nextAction: fresh.nextAction ?? null,
              nextActionAt: fresh.nextActionAt ?? null,
            },
            after: patch,
          };
        });
        if (!done) {
          skipped.push({ name: u.name, reason: `${entry.text} already logged` });
          return;
        }
        updatedIds.push(u.id);
        before[u.id] = done.before;
        after[u.id] = done.after;
      });
    }
  } finally {
    const counts = { create: createdIds.length, update: updatedIds.length, skip: skipped.length };
    await runRef.update({
      status: "applied",
      counts,
      leadIds: updatedIds,
      createdIds,
      before,
      after,
      skippedNames: skipped.slice(0, 50).map((s) => `${s.name} (${s.reason})`),
    });
  }

  return {
    runId,
    counts: { create: createdIds.length, update: updatedIds.length, skip: skipped.length },
    created: createdIds.length,
    updated: updatedIds.length,
    skipped,
    notOnList: p.notOnList,
  };
}

export interface UndoResult {
  runId: string;
  entriesRemoved: number;
  datesRestored: number;
  leadsRemoved: number;
  skipped: Array<{ id: string; name: string; reason: string }>;
}

/**
 * Undo a run: take its history line off every lead it logged on (the exact
 * stored entry), put back lastContactAt / nextAction / nextActionAt where the
 * lead still has what the run set, and move leads the run created to the
 * trash if nobody has touched them since. Anything else is reported.
 */
export async function undoImportRun(db: Firestore, runId: string, opts: { by: string }): Promise<UndoResult> {
  const runRef = db.collection("importRuns").doc(runId);
  const runSnap = await runRef.get();
  if (!runSnap.exists) throw new ImportError("That batch wasn't found.", 404);
  const run = runSnap.data() as {
    at: string;
    status: string;
    undoneAt?: string;
    entry: BatchedActivity | null;
    leadIds: string[];
    createdIds: string[];
    before: Record<string, LetterFields>;
    after: Record<string, LetterFields>;
  };
  if (run.undoneAt) throw new ImportError("That batch was already undone.", 409);
  if (run.status === "running") throw new ImportError("That batch is still running. Try again in a minute.", 409);

  const now = new Date().toISOString();
  const leads = db.collection("leads");
  const out: UndoResult = { runId, entriesRemoved: 0, datesRestored: 0, leadsRemoved: 0, skipped: [] };
  const entry = run.entry;

  if (entry) {
    await inChunks(run.leadIds || [], async (id) => {
      const ref = leads.doc(id);
      const r = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { gone: true as const };
        const d = snap.data() || {};
        const has = ((d.activity as BatchedActivity[]) || []).some((a) => a.batchId === entry.batchId && a.text === entry.text && a.ts === entry.ts);
        const set = run.after?.[id] || {};
        const old = run.before?.[id] || {};
        const patch: Record<string, unknown> = {};
        const kept: string[] = [];
        for (const [f, v] of Object.entries(set) as Array<[keyof LetterFields, string | null | undefined]>) {
          if ((d[f] ?? null) === (v ?? null)) {
            const prev = old[f];
            patch[f] = prev === null || prev === undefined ? FieldValue.delete() : prev;
          } else kept.push(f);
        }
        if (!has && Object.keys(patch).length === 0) return { name: String(d.name || id), nothing: true as const };
        tx.update(ref, { ...patch, activity: FieldValue.arrayRemove(entry), updatedAt: now });
        return { name: String(d.name || id), removed: has, restored: Object.keys(patch).length > 0, kept };
      });
      if ("gone" in r) {
        out.skipped.push({ id, name: id, reason: "lead no longer exists" });
        return;
      }
      if ("nothing" in r) {
        out.skipped.push({ id, name: r.name, reason: "line already gone and dates changed since" });
        return;
      }
      if (r.removed) out.entriesRemoved += 1;
      if (r.restored) out.datesRestored += 1;
      if (r.kept.length) {
        out.skipped.push({ id, name: r.name, reason: `kept the newer ${r.kept.join(", ")} (changed since the batch)` });
      }
    });
  }

  await inChunks(run.createdIds || [], async (id) => {
    const ref = leads.doc(id);
    const r = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false, name: id, reason: "already removed" };
      const d = snap.data() || {};
      const name = String(d.name || id);
      const quoteRef = typeof d.quoteId === "string" && d.quoteId ? db.collection("quoteRequests").doc(d.quoteId) : null;
      const quote = quoteRef ? await tx.get(quoteRef) : null;
      if (d.updatedAt !== run.at || d.touched) {
        return { ok: false, name, reason: "worked on since the import, so it was kept" };
      }
      // Soft remove: the whole lead goes to the trash, restorable by hand.
      // Same shape as every other trash entry (src/services/trash.ts), so it
      // shows on the Trash page and can be restored there.
      tx.set(db.collection("trash").doc(`leads__${id}`), {
        col: "leads",
        id,
        data: d,
        deletedAt: now,
        deletedBy: opts.by.toLowerCase(),
        deletedByUid: "",
        note: `Undo of import batch ${runId}`,
      });
      tx.delete(ref);
      if (quoteRef && quote?.exists && quote.get("leadId") === id) tx.update(quoteRef, { leadId: FieldValue.delete() });
      return { ok: true, name, reason: "" };
    });
    if (r.ok) out.leadsRemoved += 1;
    else out.skipped.push({ id, name: r.name, reason: r.reason });
  });

  await runRef.update({
    undoneAt: now,
    undoneBy: opts.by,
    undo: {
      entriesRemoved: out.entriesRemoved,
      datesRestored: out.datesRestored,
      leadsRemoved: out.leadsRemoved,
      skipped: out.skipped.slice(0, 100),
    },
  });
  return out;
}

/** The latest runs for the panel's Undo list. */
export async function listImportRuns(db: Firestore, n = 8): Promise<ImportRunSummary[]> {
  const snap = await db.collection("importRuns").orderBy("at", "desc").limit(n).get();
  return snap.docs.map((d) => {
    const r = d.data();
    return {
      id: d.id,
      kind: r.kind === "letter" ? "letter" : "import",
      source: r.params?.source ?? "",
      letter: r.params?.letter ?? null,
      date: r.params?.date ?? null,
      by: String(r.by || ""),
      at: String(r.at || ""),
      status: String(r.status || ""),
      counts: r.counts ?? { create: 0, update: 0, skip: 0 },
      undoneAt: r.undoneAt ?? null,
      undo: r.undo ?? null,
    };
  });
}
