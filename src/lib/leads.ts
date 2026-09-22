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
  lost: "Lost",
};

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
  type: "note" | "call" | "text" | "email" | "walk" | "letter" | "quote" | "stage" | "system";
  text: string;
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
  lead: Pick<Lead, "contactEveryDays" | "nextActionAt" | "nextAction">,
  activity: LeadActivity,
  today: string
): Partial<Lead> {
  if (!CONTACT_TYPES.includes(activity.type)) return {};
  const patch: Partial<Lead> = { lastContactAt: activity.ts.slice(0, 10) };
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
  if (lead.stage === "lost" || lead.stage === "won") return false;
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
  saleAmount?: string;
  notes?: string;
  activity?: LeadActivity[];
  quoteId?: string;
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
  const past = (stage: LeadStage) => LEAD_STAGES.indexOf(s) >= LEAD_STAGES.indexOf(stage);
  const answered = s === "new" ? "" : "Yes";
  const booked =
    past("walk_scheduled") && s !== "nurture" && s !== "lost"
      ? "Yes"
      : lead.appointmentAt
        ? "Yes"
        : s === "contacted"
          ? ""
          : "No";
  const taken =
    s === "walk_done" || s === "quoted" || s === "won" ? "Yes" : "";
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

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
