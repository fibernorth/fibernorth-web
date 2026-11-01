import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { rateLimit } from "@/lib/rate-limit";
import type { Lead } from "@/lib/leads";
import {
  accountDoc,
  addToIndex,
  buildIndex,
  feedBodySchema,
  feedRow,
  findAccount,
  findLead,
  jarvisAccountId,
  jarvisLeadId,
  planLead,
  type FeedLead,
  type LeadPlan,
} from "@/lib/jarvis-feed";
import { todayISO } from "@/lib/leads";

// Jarvis (Bill's scheduled Claude assistant) logs and reads leads here, the
// way the daily bid scan feeds the Bid Board. Matching and stage rules are in
// src/lib/jarvis-feed.ts.
//
// POST  { leads: [...], force?: boolean }  upsert up to 50 leads
// GET   ?since=<ISO time>                  leads changed after that time
//
// Auth: shared secret in the X-Jarvis-Secret header, stored admin-only at
// integrationSecrets/jarvisFeed.secret (set it under Admin -> Settings).

export const dynamic = "force-dynamic";

const RATE = { limit: 60, windowMs: 10 * 60_000 };
const GET_LIMIT = 500;

function secretMatches(given: string, expected: string): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** null = allowed; otherwise the response to send. */
async function gate(request: Request, db: Firestore): Promise<NextResponse | null> {
  const given = request.headers.get("x-jarvis-secret") || "";
  const snap = await db.collection("integrationSecrets").doc("jarvisFeed").get();
  const expected = (snap.data()?.secret as string | undefined) || "";
  if (!secretMatches(given, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit({ bucket: "jarvis-feed", key: given, ...RATE });
  if (limited.limited) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }
  return null;
}

const alreadyExists = (e: unknown) => {
  const code = (e as { code?: unknown })?.code;
  return code === 6 || code === "already-exists";
};

interface Result {
  key: string;
  id?: string;
  result: "created" | "updated" | "unchanged" | "rejected";
  matchedBy?: string;
  changed?: string[];
  company?: { id: string; created: boolean };
  held?: string;
  reason?: string;
}

export async function POST(request: Request) {
  const db = getFirestore(initializeAdminApp());
  const denied = await gate(request, db);
  if (denied) return denied;

  let parsed;
  try {
    parsed = feedBodySchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad leads", details: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }

  const now = new Date().toISOString();
  const today = todayISO();
  const force = parsed.data.force;
  const col = db.collection("leads");

  const all = await col.get();
  const idx = buildIndex(all.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Lead, "id">) }) as Lead));
  const claimed = new Set<string>();
  const results: Result[] = [];

  /** Apply a plan to a lead that exists, from the doc as it is inside the transaction. */
  const updateExisting = async (id: string, f: FeedLead, parentLeadId: string | undefined) => {
    const ref = col.doc(id);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const lead = { id: snap.id, ...(snap.data() as Omit<Lead, "id">) } as Lead;
      const plan = planLead(f, lead, { now, today, force, parentLeadId });
      if (plan.kind === "update") {
        const write: Record<string, unknown> = { ...plan.patch, updatedAt: now };
        // Appended on the server so a log Bill saved meanwhile isn't dropped.
        if (plan.lines.length) write.activity = FieldValue.arrayUnion(...plan.lines);
        tx.update(ref, write);
        const merged = { ...lead, ...plan.patch, updatedAt: now, activity: [...(lead.activity || []), ...plan.lines] } as Lead;
        return { plan, lead: merged };
      }
      return { plan, lead };
    });
  };

  for (const f of parsed.data.leads) {
    // A company with a job: the company is a contractor account, this is a job under it.
    let parentLeadId: string | undefined;
    let company: Result["company"];
    if (f.company && f.job) {
      const found = findAccount(idx, f.company);
      if (found) {
        parentLeadId = found.id;
        company = { id: found.id, created: false };
      } else {
        const id = jarvisAccountId(f.company);
        const doc = accountDoc(f, now);
        try {
          await col.doc(id).create(doc);
        } catch (e) {
          if (!alreadyExists(e)) throw e;
        }
        addToIndex(idx, { id, ...doc } as Lead);
        parentLeadId = id;
        company = { id, created: true };
      }
    }

    const match = findLead(idx, f, { parentLeadId, claimed });
    let out: { plan: LeadPlan; lead: Lead } | null = null;
    let id: string;
    let matchedBy: string | undefined;

    if (match) {
      id = match.lead.id;
      matchedBy = match.by;
      out = await updateExisting(id, f, parentLeadId);
    } else {
      id = jarvisLeadId(f.key);
      const plan = planLead(f, null, { now, today, force, parentLeadId });
      if (plan.kind === "rejected") {
        results.push({ key: f.key, result: "rejected", reason: plan.reason });
        continue;
      }
      if (plan.kind === "create") {
        try {
          await col.doc(id).create(plan.doc);
          out = { plan, lead: { id, ...plan.doc } as Lead };
        } catch (e) {
          if (!alreadyExists(e)) throw e;
          // A retry or overlapping request made it first: carry on as an update.
          matchedBy = "key";
          out = await updateExisting(id, f, parentLeadId);
        }
      }
    }
    if (!out) {
      results.push({ key: f.key, result: "rejected", reason: "Lead disappeared; send it again" });
      continue;
    }
    const { plan, lead } = out;
    if (plan.kind === "rejected") {
      results.push({ key: f.key, id, result: "rejected", reason: plan.reason });
      continue;
    }
    claimed.add(id);
    addToIndex(idx, lead);
    results.push({
      key: f.key,
      id,
      result: plan.kind === "create" ? "created" : plan.kind === "update" ? "updated" : "unchanged",
      ...(matchedBy && matchedBy !== "key" ? { matchedBy } : {}),
      ...(plan.kind === "update" ? { changed: plan.changed } : {}),
      ...(company ? { company } : {}),
      ...("held" in plan && plan.held ? { held: plan.held } : {}),
    });
  }

  const count = (r: string) => results.filter((x) => x.result === r).length;
  await db
    .collection("integrationStatus")
    .doc("jarvisFeed")
    .set(
      { lastImportAt: now, created: count("created"), updated: count("updated"), received: results.length },
      { merge: true }
    );

  return NextResponse.json({
    ok: true,
    created: count("created"),
    updated: count("updated"),
    unchanged: count("unchanged"),
    rejected: count("rejected"),
    results,
  });
}

export async function GET(request: Request) {
  const db = getFirestore(initializeAdminApp());
  const denied = await gate(request, db);
  if (denied) return denied;

  const since = new URL(request.url).searchParams.get("since") || "";
  if (!since || Number.isNaN(Date.parse(since))) {
    return NextResponse.json({ error: "since must be an ISO time, e.g. 2026-11-01T00:00:00Z" }, { status: 400 });
  }
  const sinceIso = new Date(since).toISOString();

  const snap = await db.collection("leads").where("updatedAt", ">", sinceIso).orderBy("updatedAt").limit(GET_LIMIT).get();
  const leads = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Lead, "id">) }) as Lead).filter((l) => !l.private);

  const parents = new Map<string, Lead | null>();
  for (const l of leads) {
    const pid = l.parentLeadId;
    if (!pid || pid === l.id || parents.has(pid)) continue;
    const p = await db.collection("leads").doc(pid).get();
    parents.set(pid, p.exists ? ({ id: p.id, ...(p.data() as Omit<Lead, "id">) } as Lead) : null);
  }
  const rows = leads.map((l) => feedRow(l, l.parentLeadId ? (parents.get(l.parentLeadId) ?? null) : null));
  return NextResponse.json({
    ok: true,
    count: rows.length,
    // Full page: ask again with since = the last row's updatedAt.
    truncated: snap.size >= GET_LIMIT,
    leads: rows,
  });
}
