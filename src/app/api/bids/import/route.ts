import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { rateLimit } from "@/lib/rate-limit";
import { writeAudit } from "@/services/audit";
import { feedDocId, planFeedBid, type FeedBid } from "@/lib/bid-feed";

// Claude's daily bid scan posts the bids it finds here; they show on the
// Bid Board (Admin -> Bid Board) as "tracking".
// Auth: shared secret in the X-Bids-Secret header, stored admin-only at
// integrationSecrets/bidFeed.secret (set it under Admin -> Settings).
// Planning rules (what's created, what's updated, what's left alone) are in
// src/lib/bid-feed.ts.

const text = (max: number) => z.string().trim().max(max).optional().default("");

const bidSchema = z.object({
  key: z.string().trim().min(3).max(300),
  title: z.string().trim().min(1).max(300),
  agency: text(200),
  county: text(100),
  role: z.enum(["prime", "sub"]).optional().default("prime"),
  dueDate: z
    .string()
    .trim()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, "dueDate must be YYYY-MM-DD")
    .optional()
    .default(""),
  docsUrl: z
    .string()
    .trim()
    .max(1000)
    .refine((u) => !u || /^https:\/\//.test(u), "docsUrl must start with https://")
    .optional()
    .default(""),
  notes: text(2000),
  source: text(200),
});

const bodySchema = z.object({ bids: z.array(bidSchema).max(50) });

function secretMatches(given: string, expected: string): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

const ACTOR = { uid: "bid-scan", email: "bid-scan" };

export async function POST(request: Request) {
  const db = getFirestore(initializeAdminApp());

  const secretSnap = await db.collection("integrationSecrets").doc("bidFeed").get();
  const expected = (secretSnap.data()?.secret as string | undefined) || "";
  if (!expected) {
    return NextResponse.json(
      { error: "The bid feed isn't configured. Set the bid feed secret under Admin -> Settings." },
      { status: 409 }
    );
  }
  if (!secretMatches(request.headers.get("x-bids-secret") || "", expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit({ bucket: "bid-feed", key: expected, limit: 20, windowMs: 60 * 60_000 });
  if (limited.limited) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad bids", details: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }

  const now = new Date().toISOString();
  const results: Array<{ key: string; id: string; result: string; changed?: string[] }> = [];
  for (const b of parsed.data.bids as FeedBid[]) {
    const id = feedDocId(b.key);
    const ref = db.collection("bids").doc(id);
    const seenRef = db.collection("bidFeedSeen").doc(id);
    const out = await db.runTransaction(async (tx) => {
      const [snap, seen] = await Promise.all([tx.get(ref), tx.get(seenRef)]);
      const plan = planFeedBid(b, snap.exists ? (snap.data() as Record<string, unknown>) : null, seen.exists, now);
      if (plan.kind === "create") {
        tx.set(ref, plan.doc);
        tx.set(seenRef, { key: b.key, firstSeenAt: now });
        await writeAudit(
          { actor: ACTOR, action: "bid.create", target: { col: "bids", id }, before: null, after: plan.doc, note: "Found by the bid scan" },
          { db, writer: tx }
        );
        return { result: "created" };
      }
      if (plan.kind === "update") {
        const before = snap.data() as Record<string, unknown>;
        tx.update(ref, plan.patch);
        await writeAudit(
          {
            actor: ACTOR,
            action: "bid.update",
            target: { col: "bids", id },
            before: Object.fromEntries(plan.changed.map((f) => [f, before[f] ?? null])),
            after: Object.fromEntries(plan.changed.map((f) => [f, plan.patch[f]])),
            note: "Updated by the bid scan",
          },
          { db, writer: tx }
        );
        return { result: "updated", changed: plan.changed };
      }
      return { result: plan.reason };
    });
    results.push({ key: b.key, id, ...out });
  }

  const count = (r: string) => results.filter((x) => x.result === r).length;
  await db
    .collection("integrationStatus")
    .doc("bidFeed")
    .set({ lastImportAt: now, created: count("created"), updated: count("updated"), received: results.length }, { merge: true });

  return NextResponse.json({ ok: true, created: count("created"), updated: count("updated"), results });
}
