import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { sendLeadSlack } from "@/services/notifications";
import {
  formatLogForSheet,
  latestLog,
  sheetExternalId,
  stageFromSheet,
  sheetColumnsFromLead,
  type Lead,
} from "@/lib/leads";

// Two-way sync with the marketing firm's Google Sheet lead tracker.
//
// An Apps Script on the sheet POSTs every data row here (idempotent: rows
// are keyed by date+time+phone). New rows become leads in the pipeline and
// ping Slack. The response carries Bill's pipeline status for each row so the
// script can write it back into the firm's tracker columns; only leads Bill
// has actually touched in the admin are written back, so the firm's own
// entries are never clobbered by an untouched import.
//
// Auth: shared secret in the X-Sync-Secret header, stored admin-only at
// integrationSecrets/leadsSync.secret (set it under Admin -> Settings).

export const dynamic = "force-dynamic";

const rowSchema = z.object({
  date: z.string().trim().max(40).default(""),
  time: z.string().trim().max(40).default(""),
  adSet: z.string().trim().max(200).default(""),
  creative: z.string().trim().max(200).default(""),
  serviceType: z.string().trim().max(100).default(""),
  isOwner: z.string().trim().max(100).default(""),
  name: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(40).default(""),
  email: z.string().trim().max(200).default(""),
  notes: z.string().trim().max(5000).default(""),
  answered: z.string().trim().max(40).default(""),
  booked: z.string().trim().max(40).default(""),
  taken: z.string().trim().max(40).default(""),
  converted: z.string().trim().max(60).default(""),
  objection: z.string().trim().max(500).default(""),
  cash: z.string().trim().max(60).default(""),
  sale: z.string().trim().max(60).default(""),
});

const bodySchema = z.object({
  source: z.literal("meta-ads").default("meta-ads"),
  rows: z.array(rowSchema).max(2000),
});

function secretMatches(given: string, expected: string): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

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
  const results: Array<Record<string, unknown>> = [];
  let created = 0;
  let updated = 0;
  // On unless someone switches it off in Settings: Bill wants the marketing
  // firm's tracker kept current as leads move.
  const writeBackOn = secretSnap.data()?.writeBack !== false;
  const seen = new Set<string>();

  for (const row of parsed.data.rows) {
    if (!row.name && !row.phone && !row.email) continue;
    const externalId = sheetExternalId(row.date, row.time, row.phone);
    // Two rows with the same key would fight over one lead; use the first.
    if (seen.has(externalId)) {
      results.push({ externalId, writeBack: "no", duplicate: true });
      continue;
    }
    seen.add(externalId);

    const existing = await leads.where("externalId", "==", externalId).limit(1).get();

    if (existing.empty) {
      const stage = stageFromSheet(row);
      const doc: Omit<Lead, "id"> = {
        name: row.name,
        phone: row.phone,
        email: row.email,
        address: "",
        serviceType: row.serviceType,
        source: "meta-ads",
        externalId,
        sourceNotes: row.notes,
        adSet: row.adSet,
        creative: row.creative,
        isOwner: row.isOwner,
        leadAt: [row.date, row.time].filter(Boolean).join(" "),
        stage,
        nextAction: stage === "new" ? "Call back" : "",
        nextActionAt: stage === "new" ? now.slice(0, 10) : "",
        objection: row.objection,
        cashCollected: row.cash,
        saleAmount: row.sale,
        notes: "",
        activity: [
          { ts: now, type: "system", text: "Imported from the Meta ads lead sheet" },
        ],
        touched: false,
        createdAt: now,
        updatedAt: now,
      };
      const ref = await leads.add(doc);
      created += 1;
      if (stage === "new") {
        sendLeadSlack({
          id: ref.id,
          name: row.name,
          phone: row.phone,
          serviceType: row.serviceType,
          source: "Meta ads",
          notes: row.notes,
        }).catch(() => {});
      }
      results.push({ externalId, writeBack: "no" });
      continue;
    }

    const snap = existing.docs[0];
    const lead = { id: snap.id, ...(snap.data() as Omit<Lead, "id">) } as Lead;

    // Keep the firm's notes column and any blanks we can fill current; never
    // touch pipeline fields Bill owns.
    const patch: Record<string, unknown> = {};
    const latest = latestLog(lead);
    const latestText = latest ? formatLogForSheet(latest) : "";
    const sheetNote = (row.notes || "").trim();
    // A Notes cell that is neither what we last wrote nor what we already
    // imported is a new note typed on the sheet: bring it in as a log entry.
    if (
      sheetNote &&
      sheetNote !== latestText &&
      sheetNote !== (lead.sheetNoteWritten || "").trim() &&
      sheetNote !== (lead.sourceNotes || "").trim()
    ) {
      const entry = { ts: now, type: "note" as const, text: sheetNote.slice(0, 1000), via: "sheet" as const };
      patch.sourceNotes = sheetNote;
      patch.activity = [...(lead.activity || []), entry];
      lead.activity = patch.activity as Lead["activity"];
    }
    if (!lead.email && row.email) patch.email = row.email;
    if (!lead.phone && row.phone) patch.phone = row.phone;
    if (!lead.name && row.name) patch.name = row.name;
    if (Object.keys(patch).length > 0) {
      await snap.ref.update({ ...patch, updatedAt: now });
      updated += 1;
    }

    if (!writeBackOn || !lead.touched) {
      results.push({ externalId, writeBack: "no" });
      continue;
    }

    // Conservative write-back: only fill blanks or move a status forward.
    // Never clear a cell, never downgrade a Yes, never touch money/objection
    // cells the firm already filled in. Each change is logged on the lead.
    const want = sheetColumnsFromLead(lead);
    const have = {
      answered: row.answered,
      booked: row.booked,
      taken: row.taken,
      converted: row.converted,
      objection: row.objection,
      cash: row.cash,
      sale: row.sale,
    };
    const set: Record<string, string> = {};
    const rank = (v: string) => {
      const s = (v || "").trim().toLowerCase();
      if (!s) return 0;
      if (s === "no") return 1;
      if (s.startsWith("long")) return 2;
      if (s.startsWith("y")) return 3;
      return 1;
    };
    for (const col of ["answered", "booked", "taken", "converted"] as const) {
      const w = want[col];
      const h = have[col];
      if (!w) continue; // we have nothing to say
      if (w === h) continue;
      if (rank(w) > rank(h)) set[col] = w; // forward only
    }
    for (const col of ["objection", "cash", "sale"] as const) {
      if (want[col] && !have[col]) set[col] = want[col];
    }
    // Notes column always shows the latest log entry from the CRM.
    const newest = latestLog(lead);
    if (newest) {
      const text = formatLogForSheet(newest);
      if (text && text !== sheetNote) set.notes = text;
    }

    if (Object.keys(set).length > 0) {
      const labels: Record<string, string> = {
        notes: "NOTES",
        answered: "Lead Answered",
        booked: "Booked Appointment",
        taken: "Taken Appointment",
        converted: "Client Converted",
        objection: "Objection",
        cash: "Cash Collected",
        sale: "Total Sale",
      };
      // The script may skip a cell (dropdown mismatch, edited mid-sync), in
      // which case we'll send the same set again next run. Log it once.
      const setKey = JSON.stringify(set);
      if (setKey !== lead.sheetLastSet) {
        const text = Object.entries(set)
          .map(([k, v]) => `${labels[k]} → ${v}`)
          .join(", ");
        await snap.ref.update({
          activity: [...(lead.activity || []), { ts: now, type: "system", text: `Sheet updated: ${text}` }],
          sheetLastSet: setKey,
          ...(set.notes ? { sheetNoteWritten: set.notes } : {}),
          updatedAt: now,
        });
      }
      results.push({ externalId, writeBack: "yes", set });
    } else {
      results.push({ externalId, writeBack: "no" });
    }
  }

  return NextResponse.json({ ok: true, created, updated, writeBackOn, results });
}
