// Lead pipeline shared types and helpers (client + server safe: no Firebase
// imports here).
//
// A lead is any person who might buy something from FiberNorth: a website
// quote, a Meta ad lead from the marketing firm's sheet, a campground or
// contractor from the letter campaigns, an ACS internet inquiry. They all
// move through the same stages so Bill has one list to work from.

export const LEAD_STAGES = [
  "new",
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

function isTalk(a: LeadActivity): boolean {
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
  if (!isContact(activity)) return {};
  const patch: Partial<Lead> = {};
  const day = localDateOf(activity.ts);
  const had = lead.lastContactAt || "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(day) && (!had || day > had)) patch.lastContactAt = day;
  // "Contacted" means Bill actually talked to them: a call or a site walk.
  if (isTalk(activity) && lead.stage === "new") patch.stage = "contacted";
  if (CLOSED_STAGES.includes(lead.stage as LeadStage)) return patch;
  const every = Number(lead.contactEveryDays || 0);
  if (every > 0) {
    const due = addDays(today, every);
    const current = lead.nextActionAt || "";
    if (!current || current < today || current > due) {
      patch.nextActionAt = due;
      if (!lead.nextAction || !current || current < today) patch.nextAction = "Check back";
    }
  }
  return patch;
}

/** True when a lead is past its contact frequency (or never contacted with one set). */
export function isStale(
  lead: Pick<Lead, "contactEveryDays" | "lastContactAt" | "stage">,
  today: string
): boolean {
  const every = Number(lead.contactEveryDays || 0);
  if (every <= 0) return false;
  if (CLOSED_STAGES.includes(lead.stage as LeadStage)) return false;
  if (!lead.lastContactAt) return true;
  return addDays(lead.lastContactAt, every) < today;
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
  /** Lead id of the partner (usually a contractor) who sent this job. */
  referredBy?: string;
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
      answered: hasTalked(lead) ? "Yes" : "",
      booked: "",
      taken: "",
      converted: "No",
      objection: lead.objection || `Not a lead${reason ? `: ${reason}` : ""}`,
      cash: lead.cashCollected || "",
      sale: lead.saleAmount || "",
    };
  }
  // Lead Answered = we actually talked to them (a call or walk was logged, or
  // the lead is at a stage that only happens after a conversation).
  const talkedStages: LeadStage[] = ["contacted", "walk_scheduled", "walk_done", "quoted", "won"];
  const answered = hasTalked(lead) || talkedStages.includes(s) ? "Yes" : "";
  // Booked / Taken come from the walk itself (a walk date, a booked or done
  // walk in the history, or the walk stages Bill picked), never from a later
  // stage: emailing a quote to someone nobody met is not a taken appointment.
  const acts = lead.activity || [];
  const walked = s === "walk_done" || acts.some(isWalkDone);
  const bookedYes = walked || s === "walk_scheduled" || Boolean(lead.appointmentAt) || acts.some(isWalkBooked);
  const booked = bookedYes ? "Yes" : s === "new" || s === "contacted" ? "" : "No";
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
export const NURTURE_EVERY_DAYS = 45;

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
    patch.nextActionAt = addDays(today, every);
    patch.nextAction = "Check back";
  }
  return patch;
}

/** Stages whose next action shows up in Due. */
export const DUE_STAGES: LeadStage[] = [...OPEN_STAGES, "nurture"];

/**
 * True when a lead belongs on the Due list today: open and long-term leads
 * whose check-back date has come (or brand-new leads with no date), plus won
 * jobs that still have a next action such as "Schedule the job".
 */
export function isDue(lead: Pick<Lead, "stage" | "nextAction" | "nextActionAt">, today: string): boolean {
  const at = lead.nextActionAt || "";
  if (lead.stage === "won") return Boolean((lead.nextAction || "").trim()) && (!at || at <= today);
  if (!DUE_STAGES.includes(lead.stage as LeadStage)) return false;
  if (at) return at <= today;
  return lead.stage === "new";
}

/** A won job that still has something to do (usually "Schedule the job"). */
export function isToSchedule(
  lead: Pick<Lead, "stage" | "nextAction"> & Partial<Pick<Lead, "jobDoneAt" | "nextActionAuto">>
): boolean {
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

/** One-tap check-back dates: Tomorrow, Fri, Next wk, 2 wks. */
export function quickNextDates(today: string): Array<{ label: string; date: string }> {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 Sun .. 5 Fri
  const toFri = (5 - dow + 7) % 7 || 7;
  return [
    { label: "Tomorrow", date: addDays(today, 1) },
    { label: "Fri", date: addDays(today, toFri) },
    { label: "Next wk", date: addDays(today, 7) },
    { label: "2 wks", date: addDays(today, 14) },
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
    .filter((l) => l.stage === "new" && l.createdAt && localDateOf(l.createdAt) >= since)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const quoteSince = addDays(today, -quoteDays);
  const quotes: TodaySummary["quotes"] = [];
  for (const l of leads) {
    if (closedOut(l)) continue;
    const accepted = (l.activity || []).some(
      (a) => a.type === "quote" && /ACCEPTED/.test(a.text) && localDateOf(a.ts) >= quoteSince
    );
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
 * them, else New.
 */
export function reopenStage(fresh: FreshForRules): LeadStage {
  const before = String(fresh.stageBeforeClose || "");
  if ((LEAD_STAGES as readonly string[]).includes(before) && !CLOSE_OUT_STAGES.includes(before)) {
    return before as LeadStage;
  }
  const q = fresh.quote;
  if (q?.sentAt && (q.status === "sent" || q.status === "viewed")) return "quoted";
  return hasTalked(fresh) ? "contacted" : "new";
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
 * typed in the same save wins) and cadence, the new -> contacted move when
 * Bill actually talked to them, stage-change rules, Long term defaults, and
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
