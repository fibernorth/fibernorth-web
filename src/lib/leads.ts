// Lead pipeline shared types and helpers (client + server safe: no Firebase
// imports here).
//
// A lead is any person who might buy something from FiberNorth: a website
// quote, a Meta ad lead from the marketing firm's sheet, a campground or
// contractor from the letter campaigns, an ACS internet inquiry. They all
// move through the same stages so Bill has one list to work from.

export const LEAD_STAGES = [
  "new",
  "attempted",
  "contacted",
  "walk_scheduled",
  "walk_done",
  "quoted",
  "won",
  "nurture",
  "lost",
  "not_a_lead",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const STAGE_LABELS: Record<LeadStage, string> = {
  new: "New",
  attempted: "New (tried to contact)",
  contacted: "Contacted",
  walk_scheduled: "Walk scheduled",
  walk_done: "Walked",
  quoted: "Quoted",
  won: "Won",
  nurture: "Long term",
  lost: "Lost (said no)",
  not_a_lead: "Not a lead",
};

/** How many leads sit in each stage. Stages with none are present at 0. */
export function countByStage(leads: Array<{ stage?: string }>): Record<LeadStage, number> {
  const out = Object.fromEntries(LEAD_STAGES.map((s) => [s, 0])) as Record<LeadStage, number>;
  for (const l of leads) {
    const s = l.stage as LeadStage;
    if (s in out) out[s] += 1;
  }
  return out;
}

/** Stages that count in conversion math. "Not a lead" never was one. */
export const METRIC_STAGES: LeadStage[] = LEAD_STAGES.filter((s) => s !== "not_a_lead");

/** Stages that are closed and drop off every working list. */
export const CLOSED_STAGES: LeadStage[] = ["won", "lost", "not_a_lead"];

export const DISQUALIFY_REASONS = [
  "spam",
  "wrong_service",
  "out_of_area",
  "tire_kicker",
  "duplicate",
  "other",
] as const;
export type DisqualifyReason = (typeof DISQUALIFY_REASONS)[number];
export const DISQUALIFY_LABELS: Record<DisqualifyReason, string> = {
  spam: "Spam / fake",
  wrong_service: "Wrong service",
  out_of_area: "Out of area",
  tire_kicker: "Just shopping, no project",
  duplicate: "Duplicate",
  other: "Other",
};

/** Common reasons a real lead said no. */
export const LOST_REASONS = [
  "Price",
  "Went with someone else",
  "Timing / not this year",
  "Did it themselves",
  "No response",
] as const;

export const OPEN_STAGES: LeadStage[] = [
  "new",
  "attempted",
  "contacted",
  "walk_scheduled",
  "walk_done",
  "quoted",
];

export const LEAD_SOURCES = [
  "meta-ads",
  "website",
  "google-ads",
  "campground-letter",
  "contractor-letter",
  "referral",
  "phone",
  "other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const SOURCE_LABELS: Record<LeadSource, string> = {
  "meta-ads": "Meta ads",
  website: "Website",
  "google-ads": "Google ads",
  "campground-letter": "Campground letter",
  "contractor-letter": "Contractor letter",
  referral: "Referral",
  phone: "Phone call",
  other: "Other",
};

export interface LeadActivity {
  ts: string; // ISO
  /**
   * "attempt" = called, no answer or left a voicemail (not a conversation).
   * "walk" = the site walk happened. "walk_booked" = a walk was put on the
   * calendar (not a conversation, not a walk).
   */
  type:
    | "note"
    | "call"
    | "attempt"
    | "text"
    | "email"
    | "walk"
    | "walk_booked"
    | "letter"
    | "quote"
    | "stage"
    | "system";
  text: string;
  /** Where the entry came from when not typed in the CRM ("sheet" = the firm's Notes column) */
  via?: "sheet" | "voice";
  /** Email of the person whose action wrote this line (set by the server). */
  by?: string;
}

/** "bill" from "bill@fibernorth.com", for the history list. */
export function shortBy(by: string | undefined | null): string {
  if (!by) return "";
  const at = by.indexOf("@");
  return at > 0 ? by.slice(0, at) : by;
}

export const ACTIVITY_TYPES: ReadonlyArray<LeadActivity["type"]> = [
  "note",
  "call",
  "attempt",
  "text",
  "email",
  "walk",
  "walk_booked",
  "letter",
  "quote",
  "stage",
  "system",
];

/** Label for a history line's type ("call attempt", "walk booked"). */
export function activityTypeLabel(t: LeadActivity["type"] | string): string {
  if (t === "attempt") return "call attempt";
  if (t === "walk_booked") return "walk booked";
  return String(t);
}

/**
 * Before Sept 26 2026, booking a walk was logged as type "walk" with the text
 * "Walk scheduled for ...". Those lines mean booked, not walked.
 */
function isLegacyWalkBooking(a: LeadActivity): boolean {
  return a.type === "walk" && /^Walk scheduled for\b/.test(a.text || "");
}

/** The site walk actually happened. */
export function isWalkDone(a: LeadActivity): boolean {
  return a.type === "walk" && !isLegacyWalkBooking(a);
}

/** A walk was booked (the new type, or the old "Walk scheduled for" lines). */
export function isWalkBooked(a: LeadActivity): boolean {
  return a.type === "walk_booked" || isLegacyWalkBooking(a);
}

/** Activity types that mean Bill actually talked to the person. */
export const TALKED_TYPES: ReadonlyArray<LeadActivity["type"]> = ["call", "walk"];

/** A call logged as a call whose note says nobody picked up. */
const MISSED_CALL = /\b(vm|voice ?mail|left (a |him a |her a )?(message|msg)|no answer|didn'?t answer|did not answer|wrong number|not in service|disconnected)\b/i;

function isTalk(a: LeadActivity): boolean {
  if (a.type === "call" && MISSED_CALL.test(a.text || "")) return false;
  return TALKED_TYPES.includes(a.type) && !isLegacyWalkBooking(a);
}

/** Log entries a person wrote (not stage changes or system lines). */
const LOG_TYPES: ReadonlyArray<LeadActivity["type"]> = [
  "note",
  "call",
  "attempt",
  "text",
  "email",
  "walk",
  "walk_booked",
  "letter",
  "quote",
];

export function latestLog(lead: Pick<Lead, "activity">): LeadActivity | null {
  const logs = (lead.activity || []).filter((a) => LOG_TYPES.includes(a.type));
  if (logs.length === 0) return null;
  return logs.reduce((a, b) => (b.ts >= a.ts ? b : a));
}

/** Longest sheet note we keep (the firm's cell is never cut when written back). */
export const SHEET_NOTE_MAX = 5000;

/** How the latest log appears in the sheet's Notes column. */
export function formatLogForSheet(a: LeadActivity): string {
  if (a.via === "sheet") return a.text;
  const [, m, d] = localDateOf(a.ts).split("-").map(Number);
  const md = `${m}/${d}`;
  const kind =
    a.type === "note" || a.type === "walk_booked"
      ? ""
      : a.type === "attempt"
        ? "Call: "
        : `${a.type[0].toUpperCase()}${a.type.slice(1)}: `;
  return `${md} ${kind}${a.text}`.slice(0, 1000);
}

export function hasTalked(lead: Pick<Lead, "activity">): boolean {
  return (lead.activity || []).some(isTalk);
}

/** Activity types that count as actually reaching out to the person. */
export const CONTACT_TYPES: ReadonlyArray<LeadActivity["type"]> = [
  "call",
  "text",
  "email",
  "walk",
  "letter",
  "quote",
];

function isContact(a: LeadActivity): boolean {
  return CONTACT_TYPES.includes(a.type) && !isLegacyWalkBooking(a);
}

/**
 * Activity types where we reached out but it is not a conversation on its
 * own: a no-answer call or voicemail, a text, an email, a letter. (A call
 * logged as a call whose note says nobody picked up counts too.)
 */
export const OUTREACH_TYPES: ReadonlyArray<LeadActivity["type"]> = ["attempt", "text", "email", "letter"];

/** We tried to reach them (no-answer call, voicemail, text, email, letter) without talking. */
export function isOutreach(a: LeadActivity): boolean {
  if (isTalk(a)) return false;
  return OUTREACH_TYPES.includes(a.type) || a.type === "call";
}

/** A touch: we reached out (answered or not) or talked to them. */
export function isTouch(a: LeadActivity): boolean {
  return isOutreach(a) || isTalk(a);
}

/** We tried to reach them at least once (any outreach or conversation). */
export function hasTried(lead: Pick<Lead, "activity">): boolean {
  return (lead.activity || []).some(isTouch);
}

/** Stages that still read "not contacted": nobody has talked to them yet. */
export const NOT_CONTACTED_STAGES: LeadStage[] = ["new", "attempted"];

/**
 * The automatic stage move for a logged activity, forward only:
 * - New + outreach with no conversation (voicemail, text, email, letter):
 *   "New (tried to contact)".
 * - New or tried + a real conversation (a call where they picked up, a
 *   walk): "Contacted".
 * Any later stage is left alone.
 */
export function autoStageFor(stage: string | undefined, activity: LeadActivity): LeadStage | null {
  const s = String(stage || "new");
  if (isTalk(activity)) return NOT_CONTACTED_STAGES.includes(s as LeadStage) ? "contacted" : null;
  if (isOutreach(activity)) return s === "new" ? "attempted" : null;
  return null;
}

import { addBusinessDays, isPastDue } from "@/lib/business-days";
export { addBusinessDays, businessDaysBetween, isBusinessDay, isPastDue, nextBusinessDay } from "@/lib/business-days";

export function addDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Fields to update when an activity is logged: bumps lastContactAt for real
 * contact (forward only: a save queued offline never rewinds it), and if the
 * lead has a contact frequency and no sooner check-back already set,
 * schedules the next check-back from today. Closed leads (won, lost, not a
 * lead) get no check-back: their next action belongs to the job, or nothing.
 */
export function contactPatch(
  lead: Pick<Lead, "contactEveryDays" | "nextActionAt" | "nextAction"> &
    Partial<Pick<Lead, "lastContactAt">> & { stage?: Lead["stage"] },
  activity: LeadActivity,
  today: string
): Partial<Lead> {
  // "Contacted" means Bill actually talked to them: a call or a site walk.
  // Reaching out with no conversation is "New (tried to contact)".
  const moveTo = autoStageFor(lead.stage, activity);
  if (!isContact(activity)) return moveTo ? { stage: moveTo } : {};
  const patch: Partial<Lead> = {};
  const day = localDateOf(activity.ts);
  const had = lead.lastContactAt || "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(day) && (!had || day > had)) patch.lastContactAt = day;
  if (moveTo) patch.stage = moveTo;
  if (CLOSED_STAGES.includes(lead.stage as LeadStage)) return patch;
  const every = Number(lead.contactEveryDays || 0);
  if (every > 0) {
    // Contact frequencies count business days.
    const due = addBusinessDays(today, every);
    const current = lead.nextActionAt || "";
    if (!current || isPastDue(current, today) || current > due) {
      patch.nextActionAt = due;
      if (!lead.nextAction || !current || isPastDue(current, today)) patch.nextAction = "Check back";
    }
  }
  return patch;
}

/** True when a lead is past its contact frequency in business days (or never contacted with one set). */
export function isStale(
  lead: Pick<Lead, "contactEveryDays" | "lastContactAt" | "stage"> & Partial<Pick<Lead, "appointmentAt">>,
  today: string
): boolean {
  const every = Number(lead.contactEveryDays || 0);
  if (every <= 0) return false;
  if (CLOSED_STAGES.includes(lead.stage as LeadStage)) return false;
  if ((lead as { isAccount?: boolean }).isAccount) return false;
  // A site walk is already booked: the walk is the next contact.
  if (hasUpcomingWalk(lead, today)) return false;
  if (!lead.lastContactAt) return true;
  return addBusinessDays(lead.lastContactAt, every) < today;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  serviceType: string;
  source: LeadSource | string;
  /** Stable id from the originating system, e.g. sheet:<date>|<time>|<phone> */
  externalId?: string;
  /** Every sheet row key this lead has had (a fixed phone typo or a date
   * format change gives the row a new key). */
  externalIds?: string[];
  /** Marketing firm's own notes column, kept separate from ours */
  sourceNotes?: string;
  /** Last NOTES text the sync sent to the sheet (so it isn't re-imported). */
  sheetNoteWritten?: string;
  /** Last set of sheet cells the sync sent, as JSON (older sync versions). */
  sheetLastSet?: string;
  /**
   * Sheet cells the script CONFIRMED it wrote, per column: the value the
   * sheet showed after the write and when. While a cell still shows exactly
   * that value it is ours, so the sync may correct it (even to a lower value
   * or blank). Cells the firm typed stay forward-only.
   */
  sheetOwned?: Record<string, { value: string; at: string }>;
  /** What the marketing sheet row showed at the last sync (to spot the firm's edits). */
  sheetSeen?: Partial<Record<string, string>>;
  /** A Meta ads lead whose row is no longer on the marketing sheet. */
  sheetMissing?: boolean;
  adSet?: string;
  creative?: string;
  isOwner?: string;
  leadAt?: string; // when the lead came in (ISO or sheet date)
  stage: LeadStage | string;
  nextAction?: string;
  nextActionAt?: string; // YYYY-MM-DD: the check-back date
  /**
   * True when the follow-up schedule (src/lib/cadence.ts) set the next
   * action. Anything Bill sets by hand clears it, and the schedule never
   * replaces a hand-set next action that is still in the future.
   */
  nextActionAuto?: boolean;
  /** Last real contact (call/text/email/walk/letter/quote), YYYY-MM-DD */
  lastContactAt?: string;
  /** How often this person should hear from us, in days; 0/blank = no schedule */
  contactEveryDays?: number;
  /** Who we talk to there, when the lead is a business */
  contactName?: string;
  appointmentAt?: string; // YYYY-MM-DD
  appointmentTime?: string; // HH:MM local, optional (blank = all-day)
  calendarEventId?: string;
  calendarEventUrl?: string;
  objection?: string;
  cashCollected?: string;
  /** Free text as typed (and as the sheet shows it), e.g. "$4,250" */
  saleAmount?: string;
  /** saleAmount as a number for totals; null when it can't be read */
  saleAmountNum?: number | null;
  notes?: string;
  activity?: LeadActivity[];
  quoteId?: string;
  /** How many quotes hang off this lead (a contractor with several job sites); absent = 0 or 1 */
  quoteCount?: number;
  /** Design Center link, mirrored from the quote when it is sent to Bore-ON */
  boreOnUrl?: string;
  /** Why a lead was marked "Not a lead" */
  disqualifyReason?: DisqualifyReason | string;
  disqualifiedAt?: string;
  /** Stage the lead was in when it was closed out (lost / not a lead), for Reopen. */
  stageBeforeClose?: string;
  /** Denormalized badge for the latest quote on this lead */
  quote?: {
    status: string;
    total: number | null;
    version: number;
    sentAt?: string;
    /** ISO; set on sends since Sept 2026 (older badges: sentAt + 30 days) */
    expiresAt?: string;
    viewedAt?: string;
    url?: string;
  };
  /** Won job finished on site (YYYY-MM-DD). Starts the review ask. */
  jobDoneAt?: string;
  /** Won job put on the FiberNorth Jobs calendar: first day, last day (YYYY-MM-DD), event. */
  jobScheduledAt?: string;
  jobEndAt?: string;
  jobEventId?: string;
  jobEventLink?: string;
  /** Lead id of the partner (usually a contractor) who sent this job. */
  referredBy?: string;
  /**
   * Lead id of the contractor account this is a job for. The contractor
   * is the customer; each job is its own lead (stage, quotes, walk, job).
   */
  parentLeadId?: string;
  /**
   * A contractor account: they keep calling with work, so every job is
   * its own lead under them. The account itself is never due or stale.
   */
  isAccount?: boolean;
  /** Leads marked "not the same person" (same phone or email on purpose). */
  notDuplicateOf?: string[];
  /** Partner's cut of the sale, in percent. Blank = 10. */
  referralFeePct?: number;
  referralFeeStatus?: "owed" | "paid";
  /** YYYY-MM-DD the referral fee was paid. */
  referralFeePaidAt?: string;
  /** Set once an admin edits the lead; gates write-back to the sheet */
  touched?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export function digitsOnly(phone: string): string {
  return (phone || "").replace(/\D+/g, "");
}

/**
 * Old sheet row key: date + time + phone digits. Still what a pre-Sept-26
 * copy of the Apps Script uses to find rows, so results for rows without a
 * `key` are keyed this way.
 */
export function sheetExternalId(date: string, time: string, phone: string): string {
  return `sheet:${(date || "").trim()}|${(time || "").trim()}|${digitsOnly(phone)}`;
}

/**
 * Sheet row key: date + time + phone digits, or the email (then the name)
 * when the phone is blank, so two people with no phone at the same minute
 * don't share a key. Identical to sheetExternalId when there is a phone.
 * Must match keyFor() in marketing/tools/leads-sheet-sync.gs.
 */
export function sheetRowKey(row: { date?: string; time?: string; phone?: string; email?: string; name?: string }): string {
  const digits = digitsOnly(row.phone || "");
  const email = (row.email || "").trim().toLowerCase();
  const name = (row.name || "").trim().toLowerCase().replace(/\s+/g, " ");
  const tail = digits ? digits : email ? `e:${email}` : `n:${name}`;
  return `sheet:${(row.date || "").trim()}|${(row.time || "").trim()}|${tail}`;
}

/** Last 10 digits of a phone (drops a leading 1 / country code), or "". */
export function phoneKey(phone: string): string {
  const d = digitsOnly(phone);
  return d.length >= 7 ? d.slice(-10) : "";
}

/** Order stages move in, for "forward only" moves from the sheet. */
const STAGE_RANK: Record<LeadStage, number> = {
  new: 0,
  attempted: 0.5,
  contacted: 1,
  walk_scheduled: 2,
  walk_done: 3,
  quoted: 4,
  nurture: 5,
  lost: 6,
  not_a_lead: 6,
  won: 7,
};

/** True when `to` is further along than `from` (closing counts as forward). */
export function isForwardStage(from: string, to: string): boolean {
  const a = STAGE_RANK[from as LeadStage];
  const b = STAGE_RANK[to as LeadStage];
  if (a === undefined || b === undefined) return false;
  return b > a;
}

/**
 * Stage from the marketing firm's tracker columns: used when a row is first
 * imported, and again on each sync while Bill hasn't touched the lead
 * (forward moves only).
 */
export function stageFromSheet(row: {
  answered?: string;
  booked?: string;
  taken?: string;
  converted?: string;
}): LeadStage {
  const yes = (v?: string) => /^y/i.test((v || "").trim());
  const conv = (row.converted || "").trim().toLowerCase();
  if (/^not a lead|^spam/.test(conv)) return "not_a_lead";
  // "No", "No - price", "Not interested": a real person who said no.
  if (/^no\b|not interested/.test(conv)) return "lost";
  if (yes(row.converted)) return "won";
  if (conv.startsWith("long")) return "nurture";
  if (yes(row.taken)) return "walk_done";
  if (yes(row.booked)) return "walk_scheduled";
  if (yes(row.answered)) return "contacted";
  return "new";
}

/**
 * Lead Answered: "Yes" only once the person responded: a call where Bill
 * talked to them, a walk booked or done, or a sale. A voicemail, text, email,
 * letter or a quote sent with no reply is "No". Untouched: blank. The stage
 * alone never says Yes (Contacted or Quoted can be all one-way).
 */
export function answeredCell(lead: Pick<Lead, "stage" | "activity" | "appointmentAt">): string {
  const acts = lead.activity || [];
  const s = lead.stage as LeadStage;
  const responded =
    hasTalked(lead) ||
    acts.some((a) => isWalkBooked(a) || isWalkDone(a)) ||
    Boolean(lead.appointmentAt) ||
    s === "walk_scheduled" ||
    s === "walk_done" ||
    s === "won";
  if (responded) return "Yes";
  const tried = acts.some((a) => a.type === "attempt" || CONTACT_TYPES.includes(a.type));
  return tried ? "No" : "";
}

/**
 * Map a pipeline lead back onto the firm's tracker columns:
 * Lead Answered · Booked Appointment · Taken Appointment · Client Converted ·
 * Objection · Cash Collected · Total Sale (LTV).
 */
export function sheetColumnsFromLead(lead: Lead): {
  answered: string;
  booked: string;
  taken: string;
  converted: string;
  objection: string;
  cash: string;
  sale: string;
} {
  const s = lead.stage as LeadStage;
  if (s === "not_a_lead") {
    const reason = lead.disqualifyReason
      ? DISQUALIFY_LABELS[lead.disqualifyReason as DisqualifyReason] ?? lead.disqualifyReason
      : "";
    return {
      answered: answeredCell(lead),
      booked: "",
      taken: "",
      converted: "No",
      objection: lead.objection || `Not a lead${reason ? `: ${reason}` : ""}`,
      cash: lead.cashCollected || "",
      sale: lead.saleAmount || "",
    };
  }
  const answered = answeredCell(lead);
  // Booked / Taken come from the walk itself (a walk date, a booked or done
  // walk in the history, or the walk stages Bill picked), never from a later
  // stage: emailing a quote to someone nobody met is not a taken appointment.
  const acts = lead.activity || [];
  const walked = s === "walk_done" || acts.some(isWalkDone);
  const bookedYes = walked || s === "walk_scheduled" || Boolean(lead.appointmentAt) || acts.some(isWalkBooked);
  // New (tried to contact) is still "not contacted" on the sheet, like New.
  const booked = bookedYes ? "Yes" : s === "new" || s === "attempted" || s === "contacted" ? "" : "No";
  const taken = walked ? "Yes" : "";
  const converted =
    s === "won"
      ? "Yes"
      : s === "nurture"
        ? "Long Term Follow Up"
        : s === "lost"
          ? "No"
          : "";
  return {
    answered,
    booked,
    taken,
    converted,
    objection: lead.objection || "",
    cash: lead.cashCollected || "",
    sale: lead.saleAmount || "",
  };
}

/** Bill works in Michigan; every "today" and log date is Detroit time. */
export const LEAD_TIME_ZONE = "America/Detroit";

const ymdFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: LEAD_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD for an instant, in Detroit time. */
export function localDateOf(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return typeof iso === "string" ? iso.slice(0, 10) : "";
  return ymdFormat.format(d);
}

/** Today's date (YYYY-MM-DD) in Detroit time, not UTC. */
export function todayISO(now: Date = new Date()): string {
  return localDateOf(now);
}

/** Default check-in cadence for "Long term" leads. */
/** Business days (about six weeks). */
export const NURTURE_EVERY_DAYS = 30;

/**
 * Fields to add when a lead moves to Long term: a cadence (45 days unless one
 * is set) and a check-back date, so the lead comes back around in Due.
 * A next action already set for a later day is kept.
 */
export function nurturePatch(
  lead: Pick<Lead, "contactEveryDays" | "nextAction" | "nextActionAt">,
  today: string
): Partial<Lead> {
  const hasEvery = Number(lead.contactEveryDays || 0) > 0;
  const every = hasEvery ? Number(lead.contactEveryDays) : NURTURE_EVERY_DAYS;
  const patch: Partial<Lead> = {};
  if (!hasEvery) patch.contactEveryDays = every;
  const current = lead.nextActionAt || "";
  if (!current || current <= today) {
    patch.nextActionAt = addBusinessDays(today, every);
    patch.nextAction = "Check back";
  }
  return patch;
}

/** Stages whose next action shows up in Due. */
export const DUE_STAGES: LeadStage[] = [...OPEN_STAGES, "nurture"];

/**
 * True when a lead belongs on the Due list today: open and long-term leads
 * whose check-back date has come (or brand-new leads with no date). Won jobs
 * never are: unscheduled ones are on "To schedule", scheduled and finished
 * ones are on the jobs calendar.
 */
export function isDue(
  lead: Pick<Lead, "stage" | "nextAction" | "nextActionAt"> & Partial<Pick<Lead, "lastContactAt" | "appointmentAt" | "jobDoneAt">>,
  today: string
): boolean {
  // A contractor account is worked through its jobs, not on its own.
  if ((lead as { isAccount?: boolean }).isAccount) return false;
  // A finished job is never due, whatever next action is left on it.
  if (lead.jobDoneAt) return false;
  // Approved work isn't chased from Due: it waits on "To schedule" until it's
  // on the jobs calendar, then the calendar has it (Bill: no constant
  // reminders on approved jobs, scheduled ones least of all).
  if (lead.stage === "won") return false;
  const at = followUpOf(lead, today).at;
  if (!DUE_STAGES.includes(lead.stage as LeadStage)) return false;
  if (at) return at <= today;
  return NOT_CONTACTED_STAGES.includes(lead.stage as LeadStage);
}

/** Business days after a contact before checking back, when nothing else is set. */
export const CONTACT_CHECK_BACK_DAYS = 3;

/** An open lead with a site walk booked for today or later. */
export function hasUpcomingWalk(lead: { stage?: string; appointmentAt?: string }, today: string): boolean {
  const walk = lead.appointmentAt || "";
  return /^\d{4}-\d{2}-\d{2}$/.test(walk) && walk >= today && OPEN_STAGES.includes(lead.stage as LeadStage);
}

/**
 * The follow-up as it stands, reading the lead's status:
 * - A site walk is booked: the walk is the next contact, so nothing is due
 *   or overdue before it (a follow-up Bill set for before the walk stays).
 * - A call, text or email on or after the follow-up date takes care of it:
 *   "Check back" a few business days after that contact instead of overdue.
 * - Won jobs keep their own next action ("Schedule the job"); closed leads
 *   (lost, not a lead) are never due.
 */
export function followUpOf(
  lead: Pick<Lead, "stage" | "nextAction" | "nextActionAt"> & Partial<Pick<Lead, "lastContactAt" | "appointmentAt">>,
  today = ""
): { action: string; at: string; handled: boolean } {
  const at = lead.nextActionAt || "";
  const last = lead.lastContactAt || "";
  if (today && hasUpcomingWalk(lead, today)) {
    const walk = lead.appointmentAt as string;
    const billsEarlierStep = at && at >= today && at < walk;
    // No follow-up date at all: nothing to add (the walk shows on its own).
    if (!at) return { action: lead.nextAction || "", at: "", handled: false };
    if (!billsEarlierStep) return { action: "Site walk", at: walk, handled: true };
  }
  if (at && last && last >= at && DUE_STAGES.includes(lead.stage as LeadStage)) {
    return { action: "Check back", at: addBusinessDays(last, CONTACT_CHECK_BACK_DAYS), handled: true };
  }
  return { action: lead.nextAction || "", at, handled: false };
}

/** A won job that still has something to do (usually "Schedule the job"). */
export function isToSchedule(
  lead: Pick<Lead, "stage" | "nextAction"> & Partial<Pick<Lead, "jobDoneAt" | "nextActionAuto" | "jobScheduledAt">>
): boolean {
  // Already on the jobs calendar: nothing left to schedule.
  if (lead.jobScheduledAt) return false;
  // Accounts schedule through their jobs.
  if ((lead as { isAccount?: boolean }).isAccount) return false;
  // A finished job's next action is the review ask, not scheduling; a
  // follow-up the schedule set (a second site's quote) isn't either.
  return (
    lead.stage === "won" &&
    !lead.jobDoneAt &&
    lead.nextActionAuto !== true &&
    Boolean((lead.nextAction || "").trim())
  );
}

/**
 * Read a typed money amount ("$4,250", "4250.00", "4.2k") as a number.
 * Returns null for blank or unreadable text.
 */
export function parseMoney(text: string | number | null | undefined): number | null {
  if (typeof text === "number") return Number.isFinite(text) ? text : null;
  const s = String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/[$,\s]/g, "")
    .replace(/usd$/, "");
  if (!s) return null;
  const m = s.match(/^(-?\d+(?:\.\d+)?)(k)?$/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] ? 1000 : 1);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** The sale as a number: saleAmountNum, else the typed saleAmount parsed. */
export function saleValue(lead: Pick<Lead, "saleAmount" | "saleAmountNum">): number | null {
  if (typeof lead.saleAmountNum === "number" && Number.isFinite(lead.saleAmountNum)) return lead.saleAmountNum;
  return parseMoney(lead.saleAmount);
}

/** Whole days from one YYYY-MM-DD to another (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400000);
}

/** One-tap check-back dates: Next day, Fri, Next wk, 2 wks, all on business days. */
export function quickNextDates(today: string): Array<{ label: string; date: string }> {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 Sun .. 5 Fri
  const toFri = (5 - dow + 7) % 7 || 7;
  return [
    { label: dow === 5 || dow === 6 ? "Mon" : "Tomorrow", date: addBusinessDays(today, 1) },
    { label: "Fri", date: addBusinessDays(addDays(today, toFri), 0) },
    { label: "Next wk", date: addBusinessDays(addDays(today, 7), 0) },
    { label: "2 wks", date: addBusinessDays(addDays(today, 14), 0) },
  ];
}

export interface TodaySummary {
  walks: Lead[];
  due: number;
  newLeads: Lead[];
  quotes: Array<{ lead: Lead; what: "opened" | "accepted" }>;
}

/**
 * The morning view: today's site walks (by time), how many leads are due,
 * leads that came in since yesterday, and quotes opened or accepted in the
 * last few days.
 */
export function todaySummary(leads: Lead[], today: string, quoteDays = 3): TodaySummary {
  const closedOut = (l: Lead) => l.stage === "lost" || l.stage === "not_a_lead";
  const walks = leads
    .filter((l) => l.appointmentAt === today && !closedOut(l))
    .sort((a, b) => (a.appointmentTime || "99").localeCompare(b.appointmentTime || "99"));
  const since = addDays(today, -1);
  const newLeads = leads
    .filter((l) => NOT_CONTACTED_STAGES.includes(l.stage as LeadStage) && l.createdAt && localDateOf(l.createdAt) >= since)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const quoteSince = addDays(today, -quoteDays);
  const quotes: TodaySummary["quotes"] = [];
  for (const l of leads) {
    if (closedOut(l)) continue;
    // Accepted only if nothing undid it since: an undo, or a newer version
    // sent or emailed out, means the customer hasn't accepted what's out now.
    const quoteLines = (l.activity || []).filter((a) => a.type === "quote").sort((x, y) => x.ts.localeCompare(y.ts));
    const lastAccept = quoteLines.filter((a) => /ACCEPTED/.test(a.text)).pop();
    const accepted =
      !!lastAccept &&
      localDateOf(lastAccept.ts) >= quoteSince &&
      !quoteLines.some((a) => a.ts > lastAccept.ts && /undone| sent to |emailed again/i.test(a.text));
    if (accepted) quotes.push({ lead: l, what: "accepted" });
    else if (l.quote?.status === "viewed" && l.quote.viewedAt && localDateOf(l.quote.viewedAt) >= quoteSince)
      quotes.push({ lead: l, what: "opened" });
  }
  return { walks, due: leads.filter((l) => isDue(l, today)).length, newLeads, quotes };
}

/** Google Maps directions link for an address (opens the Maps app on a phone). */
export function directionsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address.trim())}`;
}

/** sms: link with a short opener; works on iPhone and Android. */
export function smsUrl(phone: string, body?: string): string {
  const to = phone.replace(/[^\d+]/g, "");
  return body ? `sms:${to}?&body=${encodeURIComponent(body)}` : `sms:${to}`;
}

/** A save the server won't make; the message is shown to Bill as-is. */
export class LeadSaveRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadSaveRefused";
  }
}

type FreshForRules = Pick<Lead, "stage" | "contactEveryDays" | "nextAction" | "nextActionAt"> &
  Partial<
    Pick<
      Lead,
      | "lastContactAt"
      | "quote"
      | "jobDoneAt"
      | "referralFeeStatus"
      | "referralFeePaidAt"
      | "disqualifyReason"
      | "stageBeforeClose"
      | "activity"
    >
  >;

const CLOSE_OUT_STAGES: string[] = ["lost", "not_a_lead"];

/**
 * What happens when the stage changes, whoever changes it (the card's
 * dropdown, the close-out chips, Reopen, the voice assistant). Decided on the
 * server against the fresh lead.
 *
 * - Entering Won: next action "Schedule the job" for today (a hand-set one
 *   in the same save wins), not the schedule's.
 * - Entering Lost / Not a lead: next action cleared; the stage it came from
 *   is kept for Reopen. Not a lead always gets a reason ("other" if none).
 * - Leaving Not a lead: the disqualify reason and date are cleared.
 * - Leaving Won while a customer's acceptance stands: refused; Undo
 *   acceptance on the quote is the way out (it fixes the quote and sale too).
 *   A paid referral fee is kept and a warning is logged.
 */
export function stageRules(
  fresh: FreshForRules,
  patch: Partial<Lead>,
  today: string,
  nowIso: string
): { patch: Partial<Lead>; notes: LeadActivity[] } {
  const out: Partial<Lead> = {};
  const notes: LeadActivity[] = [];
  const from = String(fresh.stage || "new");
  const to = patch.stage === undefined ? from : String(patch.stage);
  if (to === from) return { patch: out, notes };
  const setsNext = "nextAction" in patch || "nextActionAt" in patch;

  if (from === "won") {
    if (fresh.quote?.status === "accepted") {
      throw new LeadSaveRefused(
        "A customer accepted a quote on this lead. Use Undo acceptance on the quote first, then change the stage."
      );
    }
    if (fresh.jobDoneAt) out.jobDoneAt = "";
    if (fresh.referralFeeStatus === "paid") {
      notes.push({
        ts: nowIso,
        type: "system",
        text: `Left Won with the referral fee already paid${
          fresh.referralFeePaidAt ? ` (${fresh.referralFeePaidAt})` : ""
        }. The fee record is kept; settle it with the partner.`,
      });
    }
  }

  if (to === "won" && !setsNext) {
    out.nextAction = "Schedule the job";
    out.nextActionAt = today;
    out.nextActionAuto = false;
  }

  if (CLOSE_OUT_STAGES.includes(to)) {
    out.nextAction = "";
    out.nextActionAt = "";
    out.nextActionAuto = false;
    if (!CLOSE_OUT_STAGES.includes(from)) out.stageBeforeClose = from;
  } else if (CLOSE_OUT_STAGES.includes(from)) {
    out.stageBeforeClose = "";
  }

  if (to === "not_a_lead") {
    const reason = String(patch.disqualifyReason || "").trim();
    out.disqualifyReason = (DISQUALIFY_REASONS as readonly string[]).includes(reason) ? reason : "other";
    if (!patch.disqualifiedAt) out.disqualifiedAt = nowIso;
  }
  if (from === "not_a_lead") {
    out.disqualifyReason = "";
    out.disqualifiedAt = "";
  }
  return { patch: out, notes };
}

/**
 * Where Reopen puts a closed-out lead: the stage it was closed from, else
 * Quoted when a quote is still out, else Contacted if Bill ever talked to
 * them, else New (tried to contact) if anyone reached out, else New.
 */
export function reopenStage(fresh: FreshForRules): LeadStage {
  const before = String(fresh.stageBeforeClose || "");
  if ((LEAD_STAGES as readonly string[]).includes(before) && !CLOSE_OUT_STAGES.includes(before)) {
    return before as LeadStage;
  }
  const q = fresh.quote;
  if (q?.sentAt && (q.status === "sent" || q.status === "viewed")) return "quoted";
  return hasTalked(fresh) ? "contacted" : hasTried(fresh) ? "attempted" : "new";
}

/** The patch for Reopen: back to the old stage, and on today's list. */
export function reopenPatch(fresh: FreshForRules, today: string): Partial<Lead> {
  return {
    stage: reopenStage(fresh),
    nextAction: "Check back",
    nextActionAt: today,
  };
}

/**
 * Server-side patch rules for a lead save, decided against the FRESH lead
 * document (not the browser's copy): contact date (forward only; a date Bill
 * typed in the same save wins) and cadence, the new -> attempted move when
 * we reached out with no answer, new/attempted -> contacted when Bill
 * actually talked to them, stage-change rules, Long term defaults, and
 * the numeric sale amount. `notes` are extra history lines to append.
 */
export function leadSaveRules(
  fresh: FreshForRules,
  patch: Partial<Lead>,
  activity: LeadActivity | undefined,
  today: string,
  nowIso: string = new Date().toISOString()
): { patch: Partial<Lead>; notes: LeadActivity[] } {
  const out: Partial<Lead> = { ...patch };
  const merged = { ...fresh, ...patch };
  if (activity) {
    const cp = contactPatch(merged, activity, today);
    if ("lastContactAt" in patch) delete cp.lastContactAt;
    Object.assign(out, cp);
  }
  const rules = stageRules(fresh, { ...patch, ...(out.stage !== undefined ? { stage: out.stage } : {}) }, today, nowIso);
  Object.assign(out, rules.patch);
  if (patch.stage === "nurture" && fresh.stage !== "nurture") {
    Object.assign(out, nurturePatch({ ...merged, ...out }, today));
  }
  if ("saleAmount" in patch) out.saleAmountNum = parseMoney(patch.saleAmount);
  return { patch: out, notes: rules.notes };
}

/** leadSaveRules without the extra history lines. */
export function leadSavePatch(
  fresh: FreshForRules,
  patch: Partial<Lead>,
  activity: LeadActivity | undefined,
  today: string
): Partial<Lead> {
  return leadSaveRules(fresh, patch, activity, today).patch;
}

/** Whether a stage string is one of ours. */
export function isLeadStage(v: unknown): v is LeadStage {
  return typeof v === "string" && (LEAD_STAGES as readonly string[]).includes(v);
}
