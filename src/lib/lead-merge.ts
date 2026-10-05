import { CLOSED_STAGES, phoneKey, type Lead, type LeadActivity, type LeadStage } from "@/lib/leads";

// Two leads for the same person (one from the Meta ads sheet, one from a
// website quote, say) folded into one. Pure: the server action reads both
// leads and writes the result.

/** Came in from the marketing firm's sheet: the sheet sync finds it by its keys. */
export function isSheetLead(l: Pick<Lead, "id" | "externalId" | "source">): boolean {
  return (l.externalId || "").startsWith("sheet:") || l.source === "meta-ads" || l.id.startsWith("sheet_");
}

/**
 * Which lead stays. A sheet lead always stays, so the sheet sync keeps
 * finding it (it only looks at sheet leads). Otherwise the older one.
 */
export function pickSurvivor<T extends Pick<Lead, "id" | "externalId" | "source" | "createdAt">>(a: T, b: T): { keep: T; drop: T } {
  const sa = isSheetLead(a);
  const sb = isSheetLead(b);
  if (sa !== sb) return sa ? { keep: a, drop: b } : { keep: b, drop: a };
  return (a.createdAt || "9999") <= (b.createdAt || "9999") ? { keep: a, drop: b } : { keep: b, drop: a };
}

const RANK: Record<string, number> = {
  new: 0,
  attempted: 0.5,
  contacted: 1,
  walk_scheduled: 2,
  walk_done: 3,
  quoted: 4,
  nurture: 1.5,
  won: 9,
};

/** The stage that tells the truth about the person now. */
export function mergedStage(a: string, b: string): string {
  if (a === "won" || b === "won") return "won";
  const closedA = CLOSED_STAGES.includes(a as LeadStage);
  const closedB = CLOSED_STAGES.includes(b as LeadStage);
  // Still talking on one: that one counts, not the closed-out copy.
  if (closedA && !closedB) return b;
  if (closedB && !closedA) return a;
  if (closedA && closedB) return a;
  return (RANK[b] ?? 0) > (RANK[a] ?? 0) ? b : a;
}

const FILL_FIELDS = [
  "name",
  "phone",
  "email",
  "address",
  "serviceType",
  "contactName",
  "adSet",
  "creative",
  "objection",
  "cashCollected",
  "saleAmount",
  "boreOnUrl",
  "jobDoneAt",
  "referredBy",
  "referralFeeStatus",
  "referralFeePaidAt",
  "parentLeadId",
] as const;

const blank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && !v.trim());

function joinText(a?: string, b?: string): string {
  const x = (a || "").trim();
  const y = (b || "").trim();
  if (!x) return y;
  if (!y || x.includes(y)) return x;
  if (y.includes(x)) return y;
  return `${x}\n---\n${y}`;
}

/**
 * Fields to write on the kept lead: its own values win, blanks fill from the
 * other, notes are joined, dates take the useful end, history is combined.
 * The quote badge is worked out separately from both leads' quotes.
 */
export function mergeLeadFields(keep: Lead, drop: Lead, line: LeadActivity): Partial<Lead> {
  const out: Record<string, unknown> = {};
  for (const f of FILL_FIELDS) {
    if (blank(keep[f]) && !blank(drop[f])) out[f] = drop[f];
  }
  if (blank(keep.saleAmount) && typeof drop.saleAmountNum === "number") out.saleAmountNum = drop.saleAmountNum;
  if (keep.referralFeePct === undefined && drop.referralFeePct !== undefined) out.referralFeePct = drop.referralFeePct;

  const notes = joinText(keep.notes, drop.notes);
  if (notes !== (keep.notes || "")) out.notes = notes;
  const src = joinText(keep.sourceNotes, drop.sourceNotes);
  if (src !== (keep.sourceNotes || "")) out.sourceNotes = src;

  const stage = mergedStage(String(keep.stage || "new"), String(drop.stage || "new"));
  if (stage !== keep.stage) {
    out.stage = stage;
    // Close-out details travel with the stage they belong to.
    if (stage === drop.stage) {
      for (const f of ["disqualifyReason", "disqualifiedAt", "stageBeforeClose"] as const) {
        if (!blank(drop[f])) out[f] = drop[f];
      }
    }
  }

  // Dates: most recent contact, earliest arrival, the next thing due first.
  if ((drop.lastContactAt || "") > (keep.lastContactAt || "")) out.lastContactAt = drop.lastContactAt;
  for (const f of ["leadAt", "createdAt"] as const) {
    if (drop[f] && (!keep[f] || drop[f]! < keep[f]!)) out[f] = drop[f];
  }
  if (drop.nextActionAt && (!keep.nextActionAt || drop.nextActionAt < keep.nextActionAt)) {
    out.nextActionAt = drop.nextActionAt;
    out.nextAction = drop.nextAction || keep.nextAction || "";
    out.nextActionAuto = drop.nextActionAuto ?? false;
  } else if (!keep.nextAction && drop.nextAction && !drop.nextActionAt) {
    out.nextAction = drop.nextAction;
  }
  if (Number(drop.contactEveryDays || 0) > Number(keep.contactEveryDays || 0)) out.contactEveryDays = drop.contactEveryDays;

  // A booked walk (and its calendar event) comes along if this one has none.
  if (!keep.appointmentAt && drop.appointmentAt) {
    out.appointmentAt = drop.appointmentAt;
    out.appointmentTime = drop.appointmentTime || "";
    if (drop.calendarEventId) out.calendarEventId = drop.calendarEventId;
    if (drop.calendarEventUrl) out.calendarEventUrl = drop.calendarEventUrl;
  }
  if (!keep.jobScheduledAt && drop.jobScheduledAt) {
    out.jobScheduledAt = drop.jobScheduledAt;
    out.jobEndAt = drop.jobEndAt || "";
    out.jobEventId = drop.jobEventId || "";
    out.jobEventLink = drop.jobEventLink || "";
  }
  if (drop.isAccount && !keep.isAccount) out.isAccount = true;
  if (drop.touched && !keep.touched) out.touched = true;

  // Every key either lead was known by, so imports and the sheet still find it.
  const keys = new Set([...(keep.externalIds || []), ...(drop.externalIds || [])]);
  if (keep.externalId) keys.add(keep.externalId);
  if (drop.externalId) keys.add(drop.externalId);
  const ids = [...keys].filter(Boolean);
  if (ids.length) out.externalIds = ids;
  if (!keep.externalId && drop.externalId) out.externalId = drop.externalId;

  // One history, oldest first, without exact repeats.
  const seen = new Set<string>();
  const activity = [...(keep.activity || []), ...(drop.activity || []), line]
    .filter((a) => {
      const k = `${a.ts}|${a.type}|${a.text}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  out.activity = activity;
  return out as Partial<Lead>;
}

export interface DuplicateMatch {
  id: string;
  name: string;
  by: "phone" | "email";
}

/**
 * Leads that look like the same person: same phone (last 10 digits) or same
 * email. A contractor and its own jobs share a phone on purpose, so those
 * are never matched, and neither is a pair marked "not the same".
 */
export function findDuplicates(leads: Lead[]): Map<string, DuplicateMatch[]> {
  const byPhone = new Map<string, Lead[]>();
  const byEmail = new Map<string, Lead[]>();
  for (const l of leads) {
    const p = phoneKey(l.phone || "");
    if (p) byPhone.set(p, [...(byPhone.get(p) || []), l]);
    const e = (l.email || "").trim().toLowerCase();
    if (e.includes("@")) byEmail.set(e, [...(byEmail.get(e) || []), l]);
  }
  const out = new Map<string, DuplicateMatch[]>();
  const related = (a: Lead, b: Lead) =>
    a.parentLeadId === b.id ||
    b.parentLeadId === a.id ||
    (!!a.parentLeadId && a.parentLeadId === b.parentLeadId) ||
    (a.notDuplicateOf || []).includes(b.id) ||
    (b.notDuplicateOf || []).includes(a.id);
  const add = (groups: Map<string, Lead[]>, by: "phone" | "email") => {
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      for (const a of group) {
        for (const b of group) {
          if (a.id === b.id || related(a, b)) continue;
          const list = out.get(a.id) || [];
          if (!list.some((m) => m.id === b.id)) list.push({ id: b.id, name: b.name || "", by });
          out.set(a.id, list);
        }
      }
    }
  };
  add(byPhone, "phone");
  add(byEmail, "email");
  return out;
}
