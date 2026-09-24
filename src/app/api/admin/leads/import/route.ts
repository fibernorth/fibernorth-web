import { NextResponse } from "next/server";
import { z } from "zod";
import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyApiAuth } from "@/lib/api-auth";
import campgrounds from "@/data/campground-recipients.json";
import contractors from "@/data/contractor-recipients.json";
import type { LeadActivity } from "@/lib/leads";

// One-click imports so every contact FiberNorth already has lives in the
// pipeline. All idempotent (keyed by externalId) so re-running is safe.
//
//   { source: "quotes" }                      every quoteRequests doc -> lead
//   { source: "campgrounds" }                 the 106 campground letter recipients
//   { source: "campgrounds", letter: 3, date } log "Letter 3 mailed" on all of them

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  source: z.enum(["quotes", "campgrounds", "contractors"]),
  letter: z.number().int().min(1).max(6).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
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

  const existing = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  const snap = await leads.get();
  snap.forEach((d) => {
    const ext = d.get("externalId") as string | undefined;
    if (ext) existing.set(ext, d);
  });

  let created = 0;
  let updated = 0;

  if (parsed.data.source === "quotes") {
    const quotes = await db.collection("quoteRequests").orderBy("createdAt", "desc").get();
    const batch = db.batch();
    for (const q of quotes.docs) {
      const externalId = `quote:${q.id}`;
      if (existing.has(externalId)) continue;
      const d = q.data();
      const status = String(d.status || "new");
      const stage =
        status === "quoted" ? "quoted" : status === "contacted" ? "contacted" : status === "closed" ? "lost" : "new";
      const createdAt = String(d.createdAt || now);
      batch.set(leads.doc(), {
        name: d.name || "",
        phone: d.phone || "",
        email: d.email || "",
        address: d.address || "",
        serviceType: d.serviceType || "",
        source: "website",
        externalId,
        quoteId: q.id,
        sourceNotes: d.description || "",
        notes: d.notes || "",
        leadAt: createdAt,
        stage,
        nextAction: stage === "new" ? "Call back" : "",
        nextActionAt: stage === "new" ? now.slice(0, 10) : "",
        activity: [{ ts: createdAt, type: "system", text: "Quote request from the website (imported)" }],
        touched: false,
        createdAt,
        updatedAt: now,
      });
      created += 1;
    }
    await batch.commit();
    return NextResponse.json({ created, updated });
  }

  const letter = parsed.data.letter;
  const date = parsed.data.date || now.slice(0, 10);

  if (parsed.data.source === "contractors") {
    // 278 contractors: the 94 mailed letter 1 on Sept 4 plus verified
    // additions that have had nothing yet. Every 30 days check-in cadence.
    const list = contractors as Array<{ name: string; trade: string; address: string; mailedLetter1: boolean }>;
    let cb = db.batch();
    let cops = 0;
    for (const c of list) {
      const externalId = `contractor:${slug(c.name)}:${slug(c.address).slice(0, 24)}`;
      const found = existing.get(externalId);
      const letterActivity: LeadActivity | null = letter
        ? { ts: `${date}T12:00:00.000Z`, type: "letter", text: `Letter ${letter} mailed` }
        : null;
      if (!found) {
        const activity: LeadActivity[] = c.mailedLetter1
          ? [{ ts: "2026-09-04T12:00:00.000Z", type: "letter", text: "Letter 1 mailed" }]
          : [];
        if (letterActivity && c.mailedLetter1) activity.push(letterActivity);
        const last = activity.length ? activity[activity.length - 1].ts.slice(0, 10) : "";
        cb.set(leads.doc(), {
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
          nextAction: c.mailedLetter1 ? "" : "Mail letter 1",
          nextActionAt: c.mailedLetter1 ? "" : now.slice(0, 10),
          notes: "",
          activity,
          touched: false,
          createdAt: now,
          updatedAt: now,
        });
        created += 1;
      } else if (letterActivity) {
        const prev = (found.get("activity") as LeadActivity[]) || [];
        if (prev.some((a) => a.type === "letter" && a.text === letterActivity.text)) continue;
        cb.update(found.ref, {
          activity: [...prev, letterActivity],
          lastContactAt: date,
          nextAction: "",
          nextActionAt: "",
          updatedAt: now,
        });
        updated += 1;
      } else {
        continue;
      }
      cops += 1;
      if (cops >= 400) {
        await cb.commit();
        cb = db.batch();
        cops = 0;
      }
    }
    if (cops > 0) await cb.commit();
    return NextResponse.json({ created, updated, total: list.length });
  }

  // Campgrounds
  const list = campgrounds as Array<{ name: string; contact: string; address: string }>;
  let batch = db.batch();
  let ops = 0;
  const flush = async () => {
    if (ops > 0) await batch.commit();
    batch = db.batch();
    ops = 0;
  };

  for (const c of list) {
    const externalId = `campground:${slug(c.name)}:${slug(c.address).slice(0, 24)}`;
    const found = existing.get(externalId);
    const letterActivity: LeadActivity | null = letter
      ? { ts: `${date}T12:00:00.000Z`, type: "letter", text: `Letter ${letter} mailed` }
      : null;

    if (!found) {
      const activity: LeadActivity[] = [
        { ts: "2026-09-04T12:00:00.000Z", type: "letter", text: "Letter 1 mailed" },
        { ts: "2026-09-18T12:00:00.000Z", type: "letter", text: "Letter 2 mailed" },
      ];
      if (letterActivity && letter && letter > 2) activity.push(letterActivity);
      const last = activity[activity.length - 1].ts.slice(0, 10);
      batch.set(leads.doc(), {
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
      });
      created += 1;
    } else if (letterActivity) {
      const prev = (found.get("activity") as LeadActivity[]) || [];
      if (prev.some((a) => a.type === "letter" && a.text === letterActivity.text)) continue;
      batch.update(found.ref, {
        activity: [...prev, letterActivity],
        lastContactAt: date,
        updatedAt: now,
      });
      updated += 1;
    } else {
      continue;
    }
    ops += 1;
    if (ops >= 400) await flush();
  }
  await flush();

  return NextResponse.json({ created, updated, total: list.length });
}
