// Follow-up schedule: suggested next touches for a lead. Nothing here sends
// anything. It works out what Bill should do next and when, the lead card
// shows it with a one-tap button, and when he logs a touch the next step
// becomes the lead's next action (unless he set his own for a later day).
//
// Three tracks:
// - New leads (hand-added, website, ads): day 0 call and text, day 1 call,
//   day 3 text. Stops once he has talked to them (stage leaves "new").
//   Letter lists (campground / contractor) are prospects on their own
//   mailing cadence and are left out.
// - Quoted leads, counted from the day the quote went out: day 2 text,
//   day 5 call, day 12 email, and the day before the quote expires.
// - Won jobs marked done: ask for a Google review 2 days later.
//
// Which step is next comes from the lead's history: each logged touch
// (call, attempt, text, email, walk, a quote re-send) after the start covers
// the first open step whose window it falls in, and a late touch also covers
// any step that was due on or before it, so a missed day doesn't pile up.
//
// Pure: no Firebase, no clock. Pass today (Detroit YYYY-MM-DD).

import { quoteFirstExpiredDay } from "@/lib/proposal";
import { addDays, localDateOf, type Lead, type LeadActivity } from "@/lib/leads";

export type CadenceKind = "call" | "text" | "email" | "call+text";
export type CadenceTrack = "new" | "quote" | "review";

export interface CadenceStep {
  /** YYYY-MM-DD the step is due. */
  date: string;
  kind: CadenceKind;
  /** Short, becomes the lead's next action: "Text about the quote". */
  label: string;
  /** Starter to prefill: a key in LEAD_TEXT_TEMPLATES and/or LEAD_EMAIL_TEMPLATES. */
  templateKey: string;
  track: CadenceTrack;
  /** Stable id for the step, e.g. "quote:d5". */
  key: string;
}

type LeadForCadence = Pick<Lead, "stage"> &
  Partial<Pick<Lead, "source" | "phone" | "email" | "activity" | "quote" | "createdAt" | "leadAt" | "jobDoneAt">>;

interface Plan {
  track: CadenceTrack;
  /** Instant the track starts (touches must come after it). */
  startTs: string;
  /** First day a touch counts toward the first step. */
  firstWindow: string;
  steps: Array<Omit<CadenceStep, "track">>;
}

/** Touches that count as working the schedule. */
const TOUCH_TYPES: ReadonlyArray<LeadActivity["type"]> = ["call", "attempt", "text", "email", "walk", "quote"];

/** Lead sources that are mailing lists, not inbound leads. */
const LETTER_SOURCES = new Set(["campground-letter", "contractor-letter"]);

/** A new lead older than this with no touches is left to Bill, not the schedule. */
const NEW_TRACK_MAX_AGE_DAYS = 21;

/** Quote badges that still want a follow-up. */
const OPEN_QUOTE_STATUSES = new Set(["sent", "viewed"]);

/** YYYY-MM-DD the quote stops being good (its link says expired from this day). */
export function quoteExpiryDate(quote: Lead["quote"] | undefined): string | null {
  if (!quote?.sentAt) return null;
  return quoteFirstExpiredDay(quote);
}

function reviewPlan(lead: LeadForCadence): Plan | null {
  if (!lead.jobDoneAt) return null;
  const done = lead.jobDoneAt.length > 10 ? localDateOf(lead.jobDoneAt) : lead.jobDoneAt;
  return {
    track: "review",
    // A touch on the job-done day itself (the "Job done" note, a thank-you
    // call) doesn't count as the review ask.
    startTs: `${done}T23:59:59.999Z`,
    firstWindow: addDays(done, 1),
    steps: [{ key: "review:d2", date: addDays(done, 2), kind: "text", label: "Ask for Google review", templateKey: "review" }],
  };
}

/**
 * The schedules that apply, in order. A won job runs the review ask once
 * it's done, and a quote still out on it (a second site) runs the quote
 * schedule; the first with a step left wins.
 */
function plansFor(lead: LeadForCadence, today: string): Plan[] {
  const stage = String(lead.stage || "");
  const out: Plan[] = [];
  if (stage === "won") {
    const review = reviewPlan(lead);
    if (review) out.push(review);
  }
  const quote = quotePlan(lead, today);
  if (quote) out.push(quote);
  if (stage !== "won") {
    const fresh = newPlan(lead, today);
    if (fresh && out.length === 0) out.push(fresh);
  }
  return out;
}

function quotePlan(lead: LeadForCadence, today: string): Plan | null {
  const stage = String(lead.stage || "");
  const q = lead.quote;
  if (
    q?.sentAt &&
    OPEN_QUOTE_STATUSES.has(q.status) &&
    !["lost", "not_a_lead", "nurture"].includes(stage)
  ) {
    const sent = localDateOf(q.sentAt);
    const expires = quoteExpiryDate(q)!;
    if (today >= expires) return null;
    const base: Array<Omit<CadenceStep, "track">> = [
      { key: "quote:d2", date: addDays(sent, 2), kind: "text", label: "Text about the quote", templateKey: "quote-followup" },
      { key: "quote:d5", date: addDays(sent, 5), kind: "call", label: "Call about the quote", templateKey: "quote-followup" },
      { key: "quote:d12", date: addDays(sent, 12), kind: "email", label: "Email a quote follow-up", templateKey: "quote-followup" },
    ];
    const lastDay = addDays(expires, -1);
    // Nothing on or after the expiring day except the expiring reminder itself.
    const steps = base.filter((s) => s.date < lastDay);
    if (lastDay > sent) {
      steps.push({ key: "quote:expiring", date: lastDay, kind: "email", label: "Quote expires tomorrow: remind them", templateKey: "quote-expiring" });
    }
    return { track: "quote", startTs: q.sentAt, firstWindow: addDays(sent, 1), steps };
  }
  return null;
}

function newPlan(lead: LeadForCadence, today: string): Plan | null {
  const stage = String(lead.stage || "");
  if (stage === "new" && !LETTER_SOURCES.has(String(lead.source || ""))) {
    const startIso = lead.createdAt || lead.leadAt || "";
    if (!startIso) return null;
    const start = localDateOf(startIso);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
    const touched = (lead.activity || []).some((a) => TOUCH_TYPES.includes(a.type));
    if (!touched && addDays(start, NEW_TRACK_MAX_AGE_DAYS) < today) return null;
    return {
      track: "new",
      // Midnight-ish of the day it came in, so a same-day call counts even
      // when createdAt is a later-typed timestamp.
      startTs: new Date(`${start}T00:00:00Z`).toISOString(),
      firstWindow: start,
      steps: [
        { key: "new:d0", date: start, kind: "call+text", label: "Call, then text if no answer", templateKey: "new-first" },
        { key: "new:d1", date: addDays(start, 1), kind: "call", label: "Call again", templateKey: "missed" },
        { key: "new:d3", date: addDays(start, 3), kind: "text", label: "Text: still want a quote?", templateKey: "missed" },
      ],
    };
  }

  return null;
}

/** Swap a step's channel when the lead has no way to use it. */
function fitToContact(
  step: Omit<CadenceStep, "track">,
  track: CadenceTrack,
  lead: LeadForCadence
): Omit<CadenceStep, "track"> {
  const hasPhone = (lead.phone || "").replace(/\D/g, "").length >= 7;
  const hasEmail = (lead.email || "").includes("@");
  const keepLabel = step.key === "quote:expiring" || track === "review";
  if (step.kind === "email" && !hasEmail && hasPhone) {
    return { ...step, kind: "text", label: keepLabel ? step.label : "Text about the quote" };
  }
  if (step.kind !== "email" && !hasPhone && hasEmail) {
    const label = keepLabel ? step.label : track === "quote" ? "Email about the quote" : "Email: tried to reach you";
    const templateKey = step.templateKey === "new-first" ? "missed" : step.templateKey;
    return { ...step, kind: "email", label, templateKey };
  }
  return step;
}

/**
 * The next suggested step for a lead, or null when no schedule applies or
 * every step is covered. `today` only matters for expiry and for leaving
 * old untouched leads alone.
 */
export function nextCadenceStep(lead: LeadForCadence, today: string): CadenceStep | null {
  for (const plan of plansFor(lead, today)) {
    const step = stepOf(plan, lead);
    if (step) return step;
  }
  return null;
}

function stepOf(plan: Plan, lead: LeadForCadence): CadenceStep | null {
  if (plan.steps.length === 0) return null;
  const touches = (lead.activity || [])
    .filter((a) => TOUCH_TYPES.includes(a.type) && a.ts > plan.startTs)
    .map((a) => localDateOf(a.ts))
    .sort();

  let i = 0;
  let lastUsed = "";
  for (const day of touches) {
    if (i >= plan.steps.length) break;
    const windowStart = i === 0 ? plan.firstWindow : addDays(plan.steps[i - 1].date, 1);
    const earliest = lastUsed ? (addDays(lastUsed, 1) > windowStart ? addDays(lastUsed, 1) : windowStart) : windowStart;
    if (day >= earliest) {
      i++;
      lastUsed = day;
      // Late touch: anything that was due by then is covered too.
      while (i < plan.steps.length && plan.steps[i].date <= day) i++;
    }
  }
  if (i >= plan.steps.length) return null;
  return { ...fitToContact(plan.steps[i], plan.track, lead), track: plan.track };
}

/** Next-action texts the app itself sets; the schedule may replace them. */
const SYSTEM_NEXT_ACTIONS = new Set(["Follow up on quote", "Check back"]);

/**
 * May the schedule replace this lead's next action? Yes when there is none,
 * it is due today or overdue, the schedule set it, or it is one of the app's
 * own defaults. A next action Bill typed or tapped for a later day stays.
 */
export function canReplaceNextAction(
  lead: Partial<Pick<Lead, "nextAction" | "nextActionAt" | "nextActionAuto">>,
  today: string
): boolean {
  const at = lead.nextActionAt || "";
  if (!at || at <= today) return true;
  if (lead.nextActionAuto === true) return true;
  if (!(lead.nextAction || "").trim()) return true;
  return SYSTEM_NEXT_ACTIONS.has((lead.nextAction || "").trim());
}

/**
 * Next-action fields to write after a save, decided against the fresh lead
 * on the server. `patch` is what the card sent, `computed` what the save
 * rules already added (contact date, stage move), `activity` the new
 * history line if any.
 *
 * - Bill set a next action himself in this save: keep it, and mark it his.
 * - Job marked done: the review ask replaces whatever was there.
 * - A touch was logged: the next step goes in, unless Bill's own next
 *   action is still ahead.
 */
export function cadencePatch(
  fresh: LeadForCadence & Partial<Pick<Lead, "nextAction" | "nextActionAt" | "nextActionAuto">>,
  patch: Partial<Lead>,
  computed: Partial<Lead>,
  activity: LeadActivity | undefined,
  today: string
): Partial<Lead> {
  if ("nextAction" in patch || "nextActionAt" in patch) return { nextActionAuto: false };
  const stageAfter = String(computed.stage ?? patch.stage ?? fresh.stage ?? "");
  // "Job done" taken back: the review ask no longer applies; back to scheduling.
  const jobUndone = "jobDoneAt" in patch && !patch.jobDoneAt && Boolean(fresh.jobDoneAt);
  if (jobUndone && stageAfter === "won" && !("nextAction" in computed)) {
    const current = (fresh.nextAction || "").trim();
    if (fresh.nextActionAuto || !current || current === "Ask for Google review") {
      return { nextAction: "Schedule the job", nextActionAt: today, nextActionAuto: false };
    }
    return {};
  }
  const jobDone = Boolean(patch.jobDoneAt) && !fresh.jobDoneAt;
  const touch = Boolean(activity && TOUCH_TYPES.includes(activity.type));
  if (!jobDone && !touch) return {};

  const after: LeadForCadence = {
    ...fresh,
    ...patch,
    ...computed,
    activity: activity ? [...(fresh.activity || []), activity] : fresh.activity,
  };
  const step = nextCadenceStep(after, today);
  if (step && (jobDone || canReplaceNextAction(fresh, today))) {
    return { nextAction: step.label, nextActionAt: step.date, nextActionAuto: true };
  }
  // The schedule just ran out (they talked, or the last step is done) and
  // the schedule's own step is still showing: ask Bill for the next move,
  // unless the save already set a check-back.
  if (!step && fresh.nextActionAuto && !("nextActionAt" in computed)) {
    // A finished job with the review ask done has nothing left to do.
    if (after.stage === "won" && after.jobDoneAt) {
      return { nextAction: "", nextActionAt: "", nextActionAuto: false };
    }
    return { nextAction: "Set the next step", nextActionAt: today, nextActionAuto: false };
  }
  return {};
}
