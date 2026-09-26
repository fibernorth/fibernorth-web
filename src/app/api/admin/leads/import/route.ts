import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue, getFirestore, type WriteBatch } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyApiAuth } from "@/lib/api-auth";
import campgrounds from "@/data/campground-recipients.json";
import contractors from "@/data/contractor-recipients.json";
// The mailing lists themselves (what went to the printer) decide who a
// letter is logged on.
import contractorsLetter1 from "../../../../../../marketing/contractors/recipients-contractors.json";
import contractorsCore from "../../../../../../marketing/contractors/recipients-master-core.json";
import campgroundsWave1 from "../../../../../../marketing/campgrounds/recipients-wave1-full.json";
import campgroundsCurrent from "../../../../../../marketing/campgrounds/recipients.json";
import { todayISO, type LeadActivity } from "@/lib/leads";
import type { QuoteRequest } from "@/lib/types";
import {
  letterExternalId,
  leadFromWebsiteQuote,
  letterLogPatch,
  mailingListIds,
  quoteNeedsLead,
  type MailingRow,
} from "@/lib/lead-import";

// One-click imports so every contact FiberNorth already has lives in the
// pipeline. All idempotent (keyed by externalId) so re-running is safe.
//
//   { source: "quotes" }                         every quoteRequests doc without a lead -> lead
//   { source: "campgrounds" }                    the 106 campground letter recipients
//   { source: "campgrounds", letter: 3, date }   log "Letter 3 mailed" on that letter's list
//   { source: "contractors", letter: 2, date }   log "Letter 2 mailed" on that letter's list

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  source: z.enum(["quotes", "campgrounds", "contractors"]),
  letter: z.number().int().min(1).max(6).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Who got each letter. A letter with no list here can't be logged yet. */
function contractorList(letter: number): MailingRow[] | null {
  if (letter === 1) return contractorsLetter1 as MailingRow[]; // the 94 mailed Sept 4
  if (letter === 2) return contractorsCore as MailingRow[]; // the 217 core-county list
  return null;
}
function campgroundList(letter: number): MailingRow[] {
  return (letter === 1 ? campgroundsWave1 : campgroundsCurrent) as MailingRow[];
}

/** Firestore batches in chunks of at most 400 writes. */
function batcher(db: FirebaseFirestore.Firestore) {
  let batch: WriteBatch = db.batch();
  let ops = 0;
  return {
    /** `n` = writes fn makes; they always land in the same batch. */
    async add(fn: (b: WriteBatch) => void, n = 1) {
      if (ops > 0 && ops + n > 400) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
      fn(batch);
      ops += n;
    },
    async flush() {
      if (ops > 0) await batch.commit();
      batch = db.batch();
      ops = 0;
    },
  };
}

export async function POST(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response;

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const db = getFirestore(initializeAdminApp());
  const leads = db.collection("leads");
  const now = new Date().toISOString();
  const today = todayISO();

  const existing = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  const leadIds = new Set<string>();
  const quoteIds = new Set<string>();
  const snap = await leads.get();
  snap.forEach((d) => {
    leadIds.add(d.id);
    const ext = d.get("externalId") as string | undefined;
    if (ext) existing.set(ext, d);
    const qid = d.get("quoteId") as string | undefined;
    if (qid) quoteIds.add(qid);
  });

  let created = 0;
  let updated = 0;
  const writes = batcher(db);

  if (parsed.data.source === "quotes") {
    const quotes = await db.collection("quoteRequests").orderBy("createdAt", "desc").get();
    const known = { externalIds: new Set(existing.keys()), leadIds, quoteIds };
    let skipped = 0;
    for (const q of quotes.docs) {
      const d = q.data();
      if (!quoteNeedsLead({ id: q.id, leadId: typeof d.leadId === "string" ? d.leadId : "" }, known)) {
        skipped += 1;
        continue;
      }
      // The lead and the quote's link back to it go in the same batch, so a
      // proposal sent later carries the leadId and accept/decline/view reach
      // the lead.
      const leadRef = leads.doc();
      const lead = leadFromWebsiteQuote({ id: q.id, ...(d as Omit<QuoteRequest, "id">) }, now, today);
      await writes.add((b) => {
        b.set(leadRef, lead);
        b.update(q.ref, { leadId: leadRef.id });
      }, 2);
      created += 1;
    }
    await writes.flush();
    return NextResponse.json({ created, updated, skipped });
  }

  const letter = parsed.data.letter;
  const date = parsed.data.date || today;
  const letterActivity: LeadActivity | null = letter
    ? { ts: `${date}T12:00:00.000Z`, type: "letter", text: `Letter ${letter} mailed` }
    : null;

  /** Log the letter on an existing lead that got it. */
  const logLetter = async (found: FirebaseFirestore.QueryDocumentSnapshot, entry: LeadActivity) => {
    const patch = letterLogPatch(
      {
        activity: (found.get("activity") as LeadActivity[]) || [],
        lastContactAt: found.get("lastContactAt") as string | undefined,
        nextAction: found.get("nextAction") as string | undefined,
      },
      entry,
      date
    );
    if (!patch) return;
    await writes.add((b) => b.update(found.ref, { ...patch, activity: FieldValue.arrayUnion(entry), updatedAt: now }));
    updated += 1;
  };

  if (parsed.data.source === "contractors") {
    const got = letter ? contractorList(letter) : null;
    if (letter && !got) {
      return NextResponse.json(
        { error: `There is no mailing list for contractor letter ${letter} yet, so nothing was logged.` },
        { status: 400 }
      );
    }
    const gotIds = got ? mailingListIds("contractor", got) : null;
    // 278 contractors: the 94 mailed letter 1 on Sept 4 plus verified
    // additions that have had nothing yet. Every 30 days check-in cadence.
    const list = contractors as Array<{ name: string; trade: string; address: string; mailedLetter1: boolean }>;
    let notOnList = 0;
    for (const c of list) {
      const externalId = letterExternalId("contractor", c.name, c.address);
      const found = existing.get(externalId);
      const gotThisLetter = Boolean(gotIds?.has(externalId));
      if (!found) {
        const activity: LeadActivity[] = c.mailedLetter1
          ? [{ ts: "2026-09-04T12:00:00.000Z", type: "letter", text: "Letter 1 mailed" }]
          : [];
        if (letterActivity && gotThisLetter && !activity.some((a) => a.text === letterActivity.text)) {
          activity.push(letterActivity);
        }
        const last = activity.length ? activity[activity.length - 1].ts.slice(0, 10) : "";
        const mailed = activity.length > 0;
        await writes.add((b) =>
          b.set(leads.doc(), {
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
            activity,
            touched: false,
            createdAt: now,
            updatedAt: now,
          })
        );
        created += 1;
      } else if (letterActivity) {
        if (!gotThisLetter) {
          notOnList += 1;
          continue;
        }
        await logLetter(found, letterActivity);
      }
    }
    await writes.flush();
    return NextResponse.json({ created, updated, total: list.length, notOnList, recipients: got?.length ?? null });
  }

  // Campgrounds
  const gotIds = letter ? mailingListIds("campground", campgroundList(letter)) : null;
  const list = campgrounds as Array<{ name: string; contact: string; address: string }>;
  let notOnList = 0;
  for (const c of list) {
    const externalId = letterExternalId("campground", c.name, c.address);
    const found = existing.get(externalId);

    if (!found) {
      const activity: LeadActivity[] = [
        { ts: "2026-09-04T12:00:00.000Z", type: "letter", text: "Letter 1 mailed" },
        { ts: "2026-09-18T12:00:00.000Z", type: "letter", text: "Letter 2 mailed" },
      ];
      if (letterActivity && gotIds?.has(externalId) && !activity.some((a) => a.text === letterActivity.text)) {
        activity.push(letterActivity);
      }
      const last = activity[activity.length - 1].ts.slice(0, 10);
      await writes.add((b) =>
        b.set(leads.doc(), {
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
          activity,
          touched: false,
          createdAt: now,
          updatedAt: now,
        })
      );
      created += 1;
    } else if (letterActivity) {
      if (!gotIds?.has(externalId)) {
        notOnList += 1;
        continue;
      }
      await logLetter(found, letterActivity);
    }
  }
  await writes.flush();

  return NextResponse.json({ created, updated, total: list.length, notOnList });
}
