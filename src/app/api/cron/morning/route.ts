import { NextResponse } from "next/server";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { scanKeyMatches, secretMatches } from "@/lib/bid-feed-auth";
import { initializeAdminApp } from "@/services/firebase-admin";
import { loadReps, sendMorningLists } from "@/services/notifications";
import { buildMorningList, cronAuthorized, digestDecision, listFor, type DigestStatus } from "@/lib/sales-alerts";
import { todayISO, type Lead } from "@/lib/leads";
import type { QuoteRequest } from "@/lib/types";

// The morning list: a weekday email to each rep (every admin with their own
// fibernorth.com address, plus Bill) with what's due today. Run by the
// Vercel cron in vercel.json (11:45 UTC Mon-Fri: 6:45 AM EST, 7:45 AM EDT).
//
// Auth: with CRON_SECRET set, only `Authorization: Bearer <CRON_SECRET>`
// (Vercel's cron sends exactly that). Without it, only Vercel's cron call
// (x-vercel-cron header / vercel-cron user agent).
//
// Once a day: integrationStatus/morningDigest holds the day it was sent and
// to whom, so a repeat (a retry, a second call) sends nothing. A run that
// died part way is finished by a later one after 10 minutes, only to the
// people it missed. ?preview=1 returns the list without sending.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LEAD_FIELDS = [
  "name",
  "phone",
  "address",
  "stage",
  "nextAction",
  "nextActionAt",
  "nextActionAuto",
  "lastContactAt",
  "appointmentAt",
  "jobDoneAt",
  "jobScheduledAt",
  "isAccount",
  "private",
  "owner",
  "activity",
] as const;

const QUOTE_FIELDS = [
  "name",
  "phone",
  "createdAt",
  "leadId",
  "estimateStatus",
  "viewedAt",
  "sentAt",
  "expiresAt",
  "sentTotal",
  "quotedPrice",
  "optionClosedAt",
  "approvalStatus",
  "status",
  "leadPrivate",
  "jobDoneAt",
] as const;

async function bidFeedKeyMatches(store: Firestore, given: string): Promise<boolean> {
  if (scanKeyMatches(given)) return true;
  const expected = String((await store.collection("integrationSecrets").doc("bidFeed").get()).data()?.secret || "");
  return secretMatches(given, expected);
}

export async function GET(request: Request) {
  const ok = cronAuthorized(
    {
      authorization: request.headers.get("authorization"),
      vercelCron: request.headers.get("x-vercel-cron"),
      userAgent: request.headers.get("user-agent"),
    },
    process.env.CRON_SECRET
  );
  const store = getFirestore(initializeAdminApp());
  // Also accepted: the Bid feed key (Admin -> Settings -> Bid feed), the same
  // key the weekday bid-scan task already uses, so a scheduled task can run
  // this without a new secret. Production isn't on Vercel, so Vercel's cron
  // never calls it there.
  const bidKey = request.headers.get("x-bids-secret") || "";
  const bidOk = bidKey ? await bidFeedKeyMatches(store, bidKey) : false;
  if (!ok && !bidOk) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = todayISO();
  const preview = new URL(request.url).searchParams.get("preview") === "1";

  const loadList = async () => {
    const [leadSnap, quoteSnap] = await Promise.all([
      store.collection("leads").select(...LEAD_FIELDS).get(),
      store.collection("quoteRequests").where("estimateStatus", "in", ["draft", "viewed"]).select(...QUOTE_FIELDS).get(),
    ]);
    const leads = leadSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Lead, "id">) }) as Lead);
    const quotes = quoteSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<QuoteRequest, "id">) }) as QuoteRequest);
    return buildMorningList(leads, quotes, today);
  };

  if (preview) {
    const [list, reps] = await Promise.all([loadList(), loadReps()]);
    return NextResponse.json({
      ok: true,
      preview: true,
      today,
      to: reps.map((r) => ({ email: r.email, owner: r.owner, counts: counts(listFor(list, r)) })),
      list,
    });
  }

  const ref = store.collection("integrationStatus").doc("morningDigest");
  const nowIso = new Date().toISOString();
  const decision = await store.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = digestDecision(snap.data() as DigestStatus | undefined, today, Date.now());
    if (d.send) {
      tx.set(
        ref,
        { day: today, state: "sending", claimedAt: nowIso, ...(d.skip.length ? {} : { sentTo: [], failed: [] }) },
        { merge: true }
      );
    }
    return d;
  });
  if (!decision.send) return NextResponse.json({ ok: true, skipped: "Already sent today" });

  try {
    const [list, reps] = await Promise.all([loadList(), loadReps()]);
    const result = await sendMorningLists(list, reps, decision.skip, async (email) => {
      await ref.update({ sentTo: FieldValue.arrayUnion(email) });
    });
    await ref.set(
      { state: "done", finishedAt: new Date().toISOString(), failed: result.failed, counts: counts(list) },
      { merge: true }
    );
    return NextResponse.json({ ok: true, sent: result.sent, failed: result.failed, counts: counts(list) });
  } catch (err) {
    // Left "sending": a later call after the lease finishes the job.
    console.error("Morning list failed:", err);
    await ref.set({ error: err instanceof Error ? err.message : String(err), errorAt: new Date().toISOString() }, { merge: true }).catch(() => {});
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

function counts(list: ReturnType<typeof buildMorningList>) {
  return { due: list.due.length, opened: list.opened.length, drafts: list.drafts.length, toSchedule: list.toSchedule.length };
}
