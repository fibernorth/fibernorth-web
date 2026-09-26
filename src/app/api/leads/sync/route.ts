import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { z } from "zod";
import { initializeAdminApp } from "@/services/firebase-admin";
import { FieldValue, getFirestore, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { sendLeadSlack } from "@/services/notifications";
import { rateLimit } from "@/lib/rate-limit";
import {
  COL_LABELS,
  SHEET_COLS,
  firmChanges,
  followUpFor,
  norm,
  seenChanged,
  seenFromRow,
  sheetDay,
  writeBackSet,
  type SheetCol,
} from "@/lib/sheet-sync";
import {
  SHEET_NOTE_MAX,
  STAGE_LABELS,
  formatLogForSheet,
  isForwardStage,
  nurturePatch,
  parseMoney,
  phoneKey,
  todayISO,
  sheetExternalId,
  sheetRowKey,
  stageFromSheet,
  type Lead,
  type LeadActivity,
  type LeadStage,
} from "@/lib/leads";

// Two-way sync with the marketing firm's Google Sheet lead tracker.
//
// An Apps Script on the sheet (marketing/tools/leads-sheet-sync.gs) POSTs
// every data row here. New rows become leads in the pipeline and ping Slack.
// The response carries Bill's pipeline status for each row so the script can
// write it back into the firm's tracker columns; only leads Bill has
// actually touched in the admin are written back.
//
// The sheet must stay accurate, so:
// - Rows are keyed by date+time+phone (email or name when there's no
//   phone). When a key is new, an existing sheet lead with the same phone,
//   email (or name+date) whose old key is no longer on the sheet is the same
//   row edited (a fixed phone typo, a reformatted Date column), not a new
//   lead. Every key a lead has had is kept in externalIds.
// - New leads get a document id derived from the key and are written with
//   create(), so a retried or overlapping request can't make two.
// - The firm's notes are never lost: each is kept in the history (via
//   "sheet") before anything replaces it, and never written back cut short.
// - Write-back only fills blanks or moves a status forward, EXCEPT in a cell
//   the script confirmed we wrote that still shows exactly what we wrote:
//   that one we may correct (undo an acceptance, reopen a lead, fix a sale).
// - "Sheet updated" is logged only for cells the script reports it actually
//   wrote (`applied`, sent back in a follow-up POST or with the next run).
//   An older copy of the script that doesn't report them still syncs; its
//   writes just aren't logged or treated as ours.
//
// Auth: shared secret in the X-Sync-Secret header, stored admin-only at
// integrationSecrets/leadsSync.secret (set it under Admin -> Settings).

export const dynamic = "force-dynamic";

const rowSchema = z.object({
  /** The script's own key for the row (newer scripts); results echo it. */
  key: z.string().trim().max(600).optional(),
  date: z.string().trim().max(40).default(""),
  time: z.string().trim().max(40).default(""),
  adSet: z.string().trim().max(200).default(""),
  creative: z.string().trim().max(200).default(""),
  serviceType: z.string().trim().max(100).default(""),
  isOwner: z.string().trim().max(100).default(""),
  name: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(40).default(""),
  email: z.string().trim().max(200).default(""),
  // A giant cell shouldn't fail the whole sync; keep the first 5000 characters.
  notes: z
    .string()
    .max(100_000)
    .default("")
    .transform((s) => s.trim().slice(0, SHEET_NOTE_MAX)),
  answered: z.string().trim().max(40).default(""),
  booked: z.string().trim().max(40).default(""),
  taken: z.string().trim().max(40).default(""),
  converted: z.string().trim().max(60).default(""),
  objection: z.string().trim().max(500).default(""),
  cash: z.string().trim().max(60).default(""),
  sale: z.string().trim().max(60).default(""),
});
type SheetRow = z.infer<typeof rowSchema>;

const appliedSchema = z.object({
  key: z.string().trim().min(1).max(600),
  col: z.enum(SHEET_COLS),
  /** What the cell shows after the write (its display value). */
  value: z.string().max(SHEET_NOTE_MAX + 100),
  /** When the script wrote it (ISO). */
  at: z.string().trim().min(1).max(40),
});
type Applied = z.infer<typeof appliedSchema>;

const bodySchema = z.object({
  source: z.literal("meta-ads").default("meta-ads"),
  rows: z.array(rowSchema).max(2000).default([]),
  applied: z.array(appliedSchema).max(20000).default([]),
});

function secretMatches(given: string, expected: string): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** Document id for a lead made from a sheet row: stable for the key. */
function sheetLeadDocId(key: string): string {
  return `sheet_${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

function disqualifyFor(row: Pick<SheetRow, "converted">, nowIso: string): Partial<Lead> {
  return {
    disqualifyReason: /^spam/i.test(row.converted.trim()) ? "spam" : "other",
    disqualifiedAt: nowIso,
  };
}

interface Entry {
  id: string;
  ref: DocumentReference;
  lead: Lead;
}

function keysOf(lead: Lead): string[] {
  return [lead.externalId || "", ...(lead.externalIds || [])].filter(Boolean);
}

/** The date part of a sheet key ("sheet:<date>|<time>|<tail>"). */
function keyDate(key: string): string {
  return key.startsWith("sheet:") ? key.slice(6).split("|")[0] || "" : "";
}

class SheetIndex {
  byId = new Map<string, Entry>();
  byKey = new Map<string, Entry>();
  byPhone = new Map<string, Entry[]>();
  byEmail = new Map<string, Entry[]>();
  byNameDate = new Map<string, Entry[]>();

  add(e: Entry) {
    this.byId.set(e.id, e);
    for (const k of keysOf(e.lead)) if (!this.byKey.has(k)) this.byKey.set(k, e);
    const push = (m: Map<string, Entry[]>, k: string) => {
      if (!k) return;
      const list = m.get(k) || [];
      if (!list.includes(e)) list.push(e);
      m.set(k, list);
    };
    push(this.byPhone, phoneKey(e.lead.phone || ""));
    push(this.byEmail, (e.lead.email || "").trim().toLowerCase());
    const name = (e.lead.name || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (name) for (const k of keysOf(e.lead)) push(this.byNameDate, `${name}|${keyDate(k)}`);
  }

  addKey(e: Entry, key: string) {
    e.lead.externalIds = [...new Set([...(e.lead.externalIds || []), ...keysOf(e.lead), key])];
    this.add(e);
  }
}

/** Every lead that came from the sheet (or is a Meta ads lead), once per run. */
async function loadIndex(db: Firestore): Promise<SheetIndex> {
  const leads = db.collection("leads");
  const [fromSheet, meta] = await Promise.all([
    leads.where("externalId", ">=", "sheet:").where("externalId", "<", "sheet;").get(),
    leads.where("source", "==", "meta-ads").get(),
  ]);
  const idx = new SheetIndex();
  for (const snap of [...fromSheet.docs, ...meta.docs]) {
    if (idx.byId.has(snap.id)) continue;
    idx.add({ id: snap.id, ref: snap.ref, lead: { id: snap.id, ...(snap.data() as Omit<Lead, "id">) } as Lead });
  }
  return idx;
}

/**
 * Record the cells the script confirmed it wrote: one "Sheet updated" line
 * per lead per batch, and the cell becomes ours (sheetOwned) until someone
 * else changes it. A confirmation already recorded (same or older `at`) is
 * skipped, so a resent batch doesn't log twice.
 */
async function recordApplied(applied: Applied[], idx: SheetIndex, nowIso: string): Promise<number> {
  const byLead = new Map<Entry, Applied[]>();
  for (const a of applied) {
    const e = idx.byKey.get(a.key);
    if (!e) continue;
    byLead.set(e, [...(byLead.get(e) || []), a]);
  }
  let n = 0;
  for (const [e, list] of byLead) {
    const owned: Record<string, { value: string; at: string }> = { ...(e.lead.sheetOwned || {}) };
    const fresh: Applied[] = [];
    for (const a of [...list].sort((x, y) => x.at.localeCompare(y.at))) {
      const prev = owned[a.col];
      if (prev && prev.at >= a.at) continue;
      owned[a.col] = { value: a.value, at: a.at };
      fresh.push(a);
    }
    if (fresh.length === 0) continue;
    // Latest value per column for the log line.
    const last = new Map<SheetCol, string>();
    for (const a of fresh) last.set(a.col, a.value);
    const text = [...last]
      .map(([c, v]) => {
        const shown = v.length > 120 ? `${v.slice(0, 117)}...` : v;
        return `${COL_LABELS[c]} → ${shown === "" ? "(blank)" : shown}`;
      })
      .join(", ");
    const note = last.get("notes");
    const update: Record<string, unknown> = {
      sheetOwned: owned,
      activity: FieldValue.arrayUnion({ ts: nowIso, type: "system", text: `Sheet updated: ${text}` }),
      updatedAt: nowIso,
    };
    if (note !== undefined) update.sheetNoteWritten = note;
    await e.ref.update(update);
    e.lead.sheetOwned = owned;
    if (note !== undefined) e.lead.sheetNoteWritten = note;
    n += fresh.length;
  }
  return n;
}

// ---- Safeguards ------------------------------------------------------------
// The secret lives in a sheet the marketing firm can edit, so a bad script or
// a leaked secret must not be able to rewrite the pipeline in one go.
/** Requests per window per secret. The script runs every 10 minutes plus on edits. */
const SYNC_RATE_LIMIT = { limit: 30, windowMs: 10 * 60_000 };
/** Most new leads one run may create (the rest come in on the next runs). */
const NEW_LEAD_CAP = 200;
/**
 * The breaker trips when one run would overwrite name / phone / email on
 * more than this many of the existing sheet leads.
 */
function contactChangeLimit(existingLeads: number): number {
  return Math.max(5, existingLeads * 0.2);
}

const CONTACT_FIELDS = ["name", "phone", "email"] as const;

interface RowPlan {
  patch: Record<string, unknown>;
  /** Keys to add to externalIds (arrayUnion). */
  missingKeys: string[];
  lines: LeadActivity[];
  /** Contact fields that would overwrite a value the lead already has. */
  contactOverwrites: string[];
}

/**
 * What one sheet row does to its lead, computed from the lead as given. The
 * write recomputes this from the doc read inside its transaction, so an edit
 * Bill saved a moment ago is what it is compared with.
 */
function planRow(lead: Lead, row: SheetRow, key: string, rekeyed: boolean, now: string, today: string): RowPlan {
  const patch: Record<string, unknown> = {};
  const lines: LeadActivity[] = [];
  const contactOverwrites: string[] = [];

  // Remember every key the row has had.
  const missingKeys = [...new Set([lead.externalId || "", key])].filter((k) => k && !(lead.externalIds || []).includes(k));
  if (rekeyed) {
    lines.push({ ts: now, type: "system", text: "Sheet row changed (phone, date or time edited); matched to this lead" });
  }

  // ---- The firm's notes: never lose one --------------------------------
  const history = lead.activity || [];
  const inHistory = (t: string) =>
    history.some(
      (a) =>
        a.text === t ||
        formatLogForSheet(a) === t ||
        // Older syncs cut sheet notes at 1000 characters.
        (a.via === "sheet" && a.text.length >= 1000 && t.startsWith(a.text))
    ) || lines.some((a) => a.text === t);
  const oldSource = norm(lead.sourceNotes);
  if (oldSource && !inHistory(oldSource)) {
    // Imported before notes went into the history: keep it there now.
    lines.push({ ts: lead.createdAt || now, type: "note", text: oldSource.slice(0, SHEET_NOTE_MAX), via: "sheet" });
  }
  const sheetNote = norm(row.notes);
  const ownedNote = lead.sheetOwned?.notes?.value;
  if (
    sheetNote &&
    sheetNote !== oldSource &&
    sheetNote !== norm(lead.sheetNoteWritten) &&
    sheetNote !== norm(ownedNote) &&
    !inHistory(sheetNote)
  ) {
    // A note typed on the sheet: bring it in as a log entry.
    lines.push({ ts: now, type: "note", text: sheetNote.slice(0, SHEET_NOTE_MAX), via: "sheet" });
    patch.sourceNotes = sheetNote;
  }

  // ---- Fields the firm still owns while Bill hasn't touched the lead ---
  if (!lead.touched) {
    // Their contact details win (a fixed phone typo, a corrected email),
    // and a changed one is logged so the old value isn't lost.
    for (const f of CONTACT_FIELDS) {
      if (!row[f] || row[f] === lead[f]) continue;
      patch[f] = row[f];
      if (norm(lead[f])) {
        contactOverwrites.push(f);
        lines.push({ ts: now, type: "system", text: `Marketing sheet changed the ${f}: ${norm(lead[f])} → ${row[f]}` });
      }
    }
    // Their tracker columns can move the stage forward.
    const sheetStage = stageFromSheet(row);
    if (isForwardStage(String(lead.stage || "new"), sheetStage)) {
      Object.assign(patch, { stage: sheetStage, ...followUpFor(sheetStage, today) });
      if (sheetStage === "not_a_lead") Object.assign(patch, disqualifyFor(row, now), { stageBeforeClose: lead.stage });
      if (sheetStage === "lost") patch.stageBeforeClose = lead.stage;
      lines.push({ ts: now, type: "stage", text: `Moved to ${STAGE_LABELS[sheetStage]} (from the sheet)` });
    } else if (
      ["contacted", "walk_scheduled", "walk_done", "quoted"].includes(String(lead.stage)) &&
      !lead.nextAction &&
      !lead.nextActionAt
    ) {
      // Imported mid-pipeline before Sept 26 with no next action: it was
      // never due. Put it on today's list once.
      Object.assign(patch, followUpFor(lead.stage as LeadStage, today));
    }
    if (row.objection && !lead.objection) patch.objection = row.objection;
    if (row.cash && !lead.cashCollected) patch.cashCollected = row.cash;
    if (row.sale && !lead.saleAmount) {
      patch.saleAmount = row.sale;
      patch.saleAmountNum = parseMoney(row.sale);
    }
  } else {
    // The sheet is the master list: the firm's corrections reach the CRM
    // even on a lead Bill has worked, and their status entries show in the
    // history. Bill's stage is never changed from here.
    const firm = firmChanges(lead, row);
    Object.assign(patch, firm.patch);
    for (const f of CONTACT_FIELDS) if (firm.patch[f] !== undefined && norm(lead[f])) contactOverwrites.push(f);
    for (const text of firm.lines) lines.push({ ts: now, type: "system", text });
  }
  const rowSeen = seenFromRow(row);
  if (seenChanged(lead, rowSeen)) patch.sheetSeen = rowSeen;
  if (lead.sheetMissing) {
    patch.sheetMissing = false;
    lines.push({ ts: now, type: "system", text: "Back on the marketing sheet" });
  }
  // A Long term lead with no cadence and no check-back date would never
  // come back around; give it the default once (fills blanks only).
  const stageNow = String(patch.stage ?? lead.stage);
  if (stageNow === "nurture" && !patch.stage && !lead.nextActionAt && !Number(lead.contactEveryDays || 0)) {
    Object.assign(patch, nurturePatch(lead, today));
  }
  return { patch, missingKeys, lines, contactOverwrites };
}

type Planned =
  | { kind: "result"; result: Record<string, unknown> }
  | { kind: "create"; row: SheetRow; key: string; replyKey: string }
  | { kind: "update"; row: SheetRow; key: string; replyKey: string; entry: Entry; rekeyed: boolean; plan: RowPlan };

export async function POST(request: Request) {
  const db = getFirestore(initializeAdminApp());

  const secretSnap = await db.collection("integrationSecrets").doc("leadsSync").get();
  const expected = (secretSnap.data()?.secret as string | undefined) || "";
  if (!expected) {
    return NextResponse.json(
      { error: "Lead sync isn't configured. Set the sync secret under Admin -> Settings." },
      { status: 409 }
    );
  }
  const given = request.headers.get("x-sync-secret") || "";
  if (!secretMatches(given, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Per secret (rateLimit hashes the key), shared across instances.
  const limited = await rateLimit({ bucket: "leads-sync", key: expected, ...SYNC_RATE_LIMIT });
  if (limited.limited) {
    return NextResponse.json({ error: "Too many sync requests. Try again in a few minutes." }, { status: 429 });
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad rows" }, { status: 400 });
  }

  const leads = db.collection("leads");
  const now = new Date().toISOString();
  const today = todayISO();
  let created = 0;
  let updated = 0;
  // On unless someone switches it off in Settings: Bill wants the marketing
  // firm's tracker kept current as leads move.
  const writeBackOn = secretSnap.data()?.writeBack !== false;

  const idx = await loadIndex(db);
  const existingLeads = idx.byId.size;
  const confirmed = parsed.data.applied.length ? await recordApplied(parsed.data.applied, idx, now) : 0;

  const rows = parsed.data.rows.filter((r) => r.name || r.phone || r.email);
  // Keys on the sheet right now: an old key still here means its row still
  // exists, so a lead holding it is not a candidate for a re-keyed row.
  const runKeys = new Set(rows.map((r) => sheetRowKey(r)));
  const seen = new Set<string>();
  const claimed = new Set<string>();
  const pings: Array<Promise<unknown>> = [];

  const fallbackMatch = (row: SheetRow): Entry | null => {
    const free = (list?: Entry[]) =>
      (list || []).find((e) => !claimed.has(e.id) && !keysOf(e.lead).some((k) => runKeys.has(k))) || null;
    const p = phoneKey(row.phone);
    const email = row.email.trim().toLowerCase();
    if (p) {
      const hit = free(idx.byPhone.get(p));
      if (hit) return hit;
    }
    if (email) {
      const hit = free(idx.byEmail.get(email));
      if (hit) return hit;
    }
    if (!p && !email) {
      const name = row.name.trim().toLowerCase().replace(/\s+/g, " ");
      if (name) return free(idx.byNameDate.get(`${name}|${row.date.trim()}`));
    }
    return null;
  };

  // ---- 1. Plan every row (nothing written) ---------------------------------
  const planned: Planned[] = [];
  for (const row of rows) {
    const key = sheetRowKey(row);
    // What the script will look the row up by: its own key, or (older
    // scripts) the date|time|phone key.
    const replyKey = row.key || sheetExternalId(row.date, row.time, row.phone);
    // Two rows with the same key would fight over one lead; use the first.
    if (seen.has(key)) {
      planned.push({ kind: "result", result: { externalId: replyKey, writeBack: "no", duplicate: true } });
      continue;
    }
    seen.add(key);

    let entry: Entry | null = idx.byKey.get(key) || null;
    let rekeyed = false;
    if (!entry) {
      entry = fallbackMatch(row);
      rekeyed = Boolean(entry);
    }
    if (!entry) {
      // The new lead's id is derived from the key; claim it so no later row
      // is matched to it.
      claimed.add(sheetLeadDocId(key));
      planned.push({ kind: "create", row, key, replyKey });
      continue;
    }
    // One lead per row per run. A second row landing on the same lead (the
    // old and fixed copy of a row both on the sheet) is left alone.
    if (claimed.has(entry.id)) {
      planned.push({ kind: "result", result: { externalId: replyKey, writeBack: "no", duplicate: true } });
      continue;
    }
    claimed.add(entry.id);
    const plan = planRow(entry.lead, row, key, rekeyed, now, today);
    if (plan.missingKeys.length) idx.addKey(entry, key);
    planned.push({ kind: "update", row, key, replyKey, entry, rekeyed, plan });
  }

  // ---- 2. Circuit breaker ---------------------------------------------------
  const creates = planned.filter((p) => p.kind === "create").length;
  const contactChanges = planned.filter((p) => p.kind === "update" && p.plan.contactOverwrites.length > 0).length;
  const reasons: string[] = [];
  if (contactChanges > contactChangeLimit(existingLeads)) {
    reasons.push(
      `would change the name, phone or email on ${contactChanges} of ${existingLeads} leads (the limit is ${Math.floor(contactChangeLimit(existingLeads))})`
    );
  }
  if (creates > NEW_LEAD_CAP) reasons.push(`would add ${creates} new leads (the limit is ${NEW_LEAD_CAP} a run)`);
  const tripped = reasons.length > 0;

  // ---- 3. Apply ---------------------------------------------------------------
  const results: Array<Record<string, unknown>> = [];
  let createdSoFar = 0;
  let capped = 0;
  for (const p of planned) {
    if (p.kind === "result") {
      results.push(p.result);
      continue;
    }
    const { row, key, replyKey } = p;
    let entry: Entry;
    let rekeyed = false;
    if (p.kind === "create") {
      if (createdSoFar >= NEW_LEAD_CAP) {
        capped += 1;
        results.push({ externalId: replyKey, writeBack: "no", deferred: true });
        continue;
      }
      const made = await createFromRow(row, key);
      if ("created" in made) {
        created += 1;
        createdSoFar += 1;
        idx.add(made.created);
        if (made.created.lead.stage === "new") {
          pings.push(
            sendLeadSlack({
              id: made.created.id,
              name: row.name,
              phone: row.phone,
              serviceType: row.serviceType,
              source: "Meta ads",
              notes: row.notes,
            })
          );
        }
        results.push({ externalId: replyKey, writeBack: "no" });
        continue;
      }
      // Someone else's request made it a moment ago: carry on as an update.
      entry = made.existing;
      idx.add(entry);
    } else {
      entry = p.entry;
      rekeyed = p.rekeyed;
    }

    // A tripped run changes no existing lead and writes nothing back.
    if (tripped) {
      results.push({ externalId: replyKey, writeBack: "no", held: true });
      continue;
    }

    // Read-modify-write from the doc as it is now, so an edit Bill saved
    // after this run loaded the leads is what the row is compared with.
    const ref = entry.ref;
    const fresh = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const lead = { id: snap.id, ...(snap.data() as Omit<Lead, "id">) } as Lead;
      const plan = planRow(lead, row, key, rekeyed, now, today);
      if (Object.keys(plan.patch).length === 0 && plan.lines.length === 0 && plan.missingKeys.length === 0) {
        return { lead, wrote: false };
      }
      const write: Record<string, unknown> = { ...plan.patch, updatedAt: now };
      if (plan.missingKeys.length) write.externalIds = FieldValue.arrayUnion(...plan.missingKeys);
      // Appended on the server; a whole-array rewrite could drop a log Bill
      // saved while this sync was running.
      if (plan.lines.length) write.activity = FieldValue.arrayUnion(...plan.lines);
      tx.update(ref, write);
      Object.assign(lead, plan.patch);
      lead.externalIds = [...new Set([...(lead.externalIds || []), ...plan.missingKeys])];
      lead.activity = [...(lead.activity || []), ...plan.lines];
      return { lead, wrote: true };
    });
    if (!fresh) {
      results.push({ externalId: replyKey, writeBack: "no" });
      continue;
    }
    if (fresh.wrote) updated += 1;
    entry.lead = fresh.lead;
    const lead = fresh.lead;

    if (!writeBackOn || !lead.touched) {
      results.push({ externalId: replyKey, writeBack: "no" });
      continue;
    }

    const set = writeBackSet(lead, row);
    if (Object.keys(set).length > 0) results.push({ externalId: replyKey, writeBack: "yes", set });
    else results.push({ externalId: replyKey, writeBack: "no" });
  }

  // ---- Is every Meta ads lead still on the sheet? ------------------------
  // The script sends the whole sheet each run, so a sheet lead that no row
  // matched has been removed from the firm's list. Flag it (never delete).
  // If most leads went missing at once, the request is partial or the sheet
  // is mid-edit: skip flagging rather than mark good leads. A tripped run
  // flags nothing either.
  const missing: Entry[] = [];
  for (const e of idx.byId.values()) {
    if (claimed.has(e.id)) continue;
    if (e.lead.source !== "meta-ads" && !keysOf(e.lead).some((k) => k.startsWith("sheet:"))) continue;
    missing.push(e);
  }
  const sheetLeads = claimed.size + missing.length;
  const trustMissing = !tripped && rows.length > 0 && missing.length <= Math.max(3, Math.floor(sheetLeads * 0.2));
  let flagged = 0;
  if (trustMissing) {
    for (const e of missing) {
      if (e.lead.sheetMissing) continue;
      await e.ref.update({
        sheetMissing: true,
        activity: FieldValue.arrayUnion({ ts: now, type: "system", text: "No longer on the marketing sheet" }),
        updatedAt: now,
      });
      flagged += 1;
    }
  }
  const trip = tripped
    ? {
        reason: `Sync paused: this run ${reasons.join(" and ")}. Only new leads were added (up to ${NEW_LEAD_CAP}); nothing else was changed. Check the marketing sheet; the next run tries again.`,
        at: now,
        counts: { existingLeads, contactChanges, creates, created, deferred: capped, rows: rows.length },
      }
    : null;
  await db
    .collection("integrationStatus")
    .doc("leadsSync")
    .set({
      lastSyncAt: now,
      sheetRows: parsed.data.rows.length,
      blankRows: parsed.data.rows.length - rows.length,
      duplicateRows: results.filter((r) => r.duplicate).length,
      matched: claimed.size,
      created,
      deferred: capped,
      missingCount: missing.length,
      missing: missing.slice(0, 25).map((e) => ({ id: e.id, name: e.lead.name || "" })),
      missingChecked: trustMissing,
      // Settings shows this when set: the circuit breaker held the run.
      tripped: trip,
    });

  // Serverless: anything not awaited may never run once we respond.
  await Promise.allSettled(pings);

  return NextResponse.json({
    ok: true,
    created,
    updated,
    confirmed,
    writeBackOn: writeBackOn && !tripped,
    flagged,
    ...(trip ? { tripped: trip } : {}),
    results,
  });

  async function createFromRow(row: SheetRow, key: string): Promise<{ created: Entry } | { existing: Entry }> {
    const stage = stageFromSheet(row);
    const activity: LeadActivity[] = [{ ts: now, type: "system", text: "Imported from the Meta ads lead sheet" }];
    if (row.notes) activity.push({ ts: now, type: "note", text: row.notes.slice(0, SHEET_NOTE_MAX), via: "sheet" });
    if (stage === "won") {
      // Won on the sheet: date the win from the row so it lands in the right month.
      const day = sheetDay(row.date);
      const ts = day ? `${day}T16:00:00.000Z` : now;
      activity.push({ ts: ts < now ? ts : now, type: "stage", text: "Moved to Won (from the sheet)" });
    }
    const doc: Omit<Lead, "id"> = {
      name: row.name,
      phone: row.phone,
      email: row.email,
      address: "",
      serviceType: row.serviceType,
      source: "meta-ads",
      externalId: key,
      externalIds: [key],
      sourceNotes: row.notes,
      adSet: row.adSet,
      creative: row.creative,
      isOwner: row.isOwner,
      leadAt: [row.date, row.time].filter(Boolean).join(" "),
      stage,
      ...followUpFor(stage, today),
      ...(stage === "not_a_lead" ? disqualifyFor(row, now) : {}),
      objection: row.objection,
      cashCollected: row.cash,
      saleAmount: row.sale,
      saleAmountNum: parseMoney(row.sale),
      notes: "",
      activity,
      sheetSeen: seenFromRow(row),
      touched: false,
      createdAt: now,
      updatedAt: now,
    };
    const ref = leads.doc(sheetLeadDocId(key));
    try {
      await ref.create(doc);
      return { created: { id: ref.id, ref, lead: { id: ref.id, ...doc } as Lead } };
    } catch (e) {
      const code = (e as { code?: unknown })?.code;
      if (code !== 6 && code !== "already-exists") throw e;
      const snap = await ref.get();
      return { existing: { id: ref.id, ref, lead: { id: ref.id, ...(snap.data() as Omit<Lead, "id">) } as Lead } };
    }
  }
}

