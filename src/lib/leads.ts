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
  /** "attempt" = called, no answer or left a voicemail (not a conversation). */
  type: "note" | "call" | "attempt" | "text" | "email" | "walk" | "letter" | "quote" | "stage" | "system";
  text: string;
  /** Where the entry came from when not typed in the CRM ("sheet" = the firm's Notes column) */
  via?: "sheet" | "voice";
}

/** Activity types that mean Bill actually talked to the person. */
export const TALKED_TYPES: ReadonlyArray<LeadActivity["type"]> = ["call", "walk"];

/** Log entries a person wrote (not stage changes or system lines). */
const LOG_TYPES: ReadonlyArray<LeadActivity["type"]> = ["note", "call", "attempt", "text", "email", "walk", "letter", "quote"];

export function latestLog(lead: Pick<Lead, "activity">): LeadActivity | null {
  const logs = (lead.activity || []).filter((a) => LOG_TYPES.includes(a.type));
  if (logs.length === 0) return null;
  return logs.reduce((a, b) => (b.ts >= a.ts ? b : a));
}

/** How the latest log appears in the sheet's Notes column. */
export function formatLogForSheet(a: LeadActivity): string {
  if (a.via === "sheet") return a.text;
  const [, m, d] = localDateOf(a.ts).split("-").map(Number);
  const md = `${m}/${d}`;
  const kind =
    a.type === "note" ? "" : a.type === "attempt" ? "Call: " : `${a.type[0].toUpperCase()}${a.type.slice(1)}: `;
  return `${md} ${kind}${a.text}`.slice(0, 1000);
}

export function hasTalked(lead: Pick<Lead, "activity">): boolean {
  return (lead.activity || []).some((a) => TALKED_TYPES.includes(a.type));
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

export function addDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Fields to update when an activity is logged: bumps lastContactAt for real
 * contact, and if the lead has a contact frequency and no sooner check-back
 * already set, schedules the next check-back from today.
 */
export function contactPatch(
  lead: Pick<Lead, "contactEveryDays" | "nextActionAt" | "nextAction"> & { stage?: Lead["stage"] },
  activity: LeadActivity,
  today: string
): Partial<Lead> {
  if (!CONTACT_TYPES.includes(activity.type)) return {};
  const patch: Partial<Lead> = { lastContactAt: localDateOf(activity.ts) };
  // "Contacted" means Bill actually talked to them: a call or a site walk.
  if (TALKED_TYPES.includes(activity.type) && lead.stage === "new") patch.stage = "contacted";
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
  /** Marketing firm's own notes column, kept separate from ours */
  sourceNotes?: string;
  /** Last NOTES text the sync sent to the sheet (so it isn't re-imported). */
  sheetNoteWritten?: string;
  /** Last set of sheet cells the sync sent, as JSON (so it logs once). */
  sheetLastSet?: string;
  adSet?: string;
  creative?: string;
  isOwner?: string;
  leadAt?: string; // when the lead came in (ISO or sheet date)
  stage: LeadStage | string;
  nextAction?: string;
  nextActionAt?: string; // YYYY-MM-DD: the check-back date
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
  /** Denormalized badge for the latest quote on this lead */
  quote?: { status: string; total: number | null; version: number; sentAt?: string; viewedAt?: string; url?: string };
  /** Set once an admin edits the lead; gates write-back to the sheet */
  touched?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export function digitsOnly(phone: string): string {
  return (phone || "").replace(/\D+/g, "");
}

/** Stable id for a sheet row: date + time + phone digits. */
export function sheetExternalId(date: string, time: string, phone: string): string {
  return `sheet:${(date || "").trim()}|${(time || "").trim()}|${digitsOnly(phone)}`;
}

/**
 * Seed a stage from the marketing firm's tracker columns the first time a
 * row is imported. After that the pipeline owns the stage.
 */
export function stageFromSheet(row: {
  answered?: string;
  booked?: string;
  taken?: string;
  converted?: string;
}): LeadStage {
  const yes = (v?: string) => /^y/i.test((v || "").trim());
  const conv = (row.converted || "").trim().toLowerCase();
  if (conv.startsWith("not") || conv.startsWith("spam")) return "not_a_lead";
  if (yes(row.converted)) return "won";
  if (conv.startsWith("long")) return "nurture";
  if (conv === "no") return "lost";
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
  // Explicit per-stage mapping (not index order, which breaks when stages are added).
  const reachedWalk: LeadStage[] = ["walk_scheduled", "walk_done", "quoted", "won"];
  // Lead Answered = we actually talked to them (a call or walk was logged, or
  // the lead is at a stage that only happens after a conversation).
  const talkedStages: LeadStage[] = ["contacted", "walk_scheduled", "walk_done", "quoted", "won"];
  const answered = hasTalked(lead) || talkedStages.includes(s) ? "Yes" : "";
  const booked = reachedWalk.includes(s) || lead.appointmentAt
    ? "Yes"
    : s === "new" || s === "contacted"
      ? ""
      : "No";
  const taken = s === "walk_done" || s === "quoted" || s === "won" ? "Yes" : "";
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
export function isToSchedule(lead: Pick<Lead, "stage" | "nextAction">): boolean {
  return lead.stage === "won" && Boolean((lead.nextAction || "").trim());
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

/**
 * Server-side patch rules for a lead save, decided against the FRESH lead
 * document (not the browser's copy): contact date and cadence, the
 * new -> contacted move when Bill actually talked to them, Long term
 * defaults, and the numeric sale amount.
 */
export function leadSavePatch(
  fresh: Pick<Lead, "stage" | "contactEveryDays" | "nextAction" | "nextActionAt">,
  patch: Partial<Lead>,
  activity: LeadActivity | undefined,
  today: string
): Partial<Lead> {
  const out: Partial<Lead> = { ...patch };
  const merged = { ...fresh, ...patch };
  if (activity) Object.assign(out, contactPatch(merged, activity, today));
  if (patch.stage === "nurture" && fresh.stage !== "nurture") {
    Object.assign(out, nurturePatch({ ...merged, ...out }, today));
  }
  if ("saleAmount" in patch) out.saleAmountNum = parseMoney(patch.saleAmount);
  return out;
}
