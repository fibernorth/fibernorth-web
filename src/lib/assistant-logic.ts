// Pure parts of the voice assistant (no Firebase, no Anthropic), so they can
// be tested: what the model sees about a lead, search scoring, the confirm
// labels Bill reads before saving, and the close-out rules.

import {
  DISQUALIFY_LABELS,
  DISQUALIFY_REASONS,
  STAGE_LABELS,
  addDays,
  isDue,
  phoneKey,
  type DisqualifyReason,
  type Lead,
  type LeadActivity,
} from "@/lib/leads";

export interface LeadBrief {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  serviceType: string;
  stage: string;
  nextAction: string;
  nextActionAt: string;
  appointmentAt: string;
  appointmentTime: string;
  lastContactAt: string;
  contactEveryDays: string;
  contactName: string;
  objection: string;
  saleAmount: string;
  cashCollected: string;
  notes: string;
  /** e.g. "v2 sent 2026-09-20, $4,250, opened 2026-09-22" or "" */
  quote: string;
}

function day(iso?: string): string {
  return iso ? iso.slice(0, 10) : "";
}

export function quoteSummary(l: Pick<Lead, "quote" | "quoteCount">): string {
  const q = l.quote;
  if (!q || !q.status) return "";
  const parts = [`${q.version ? `v${q.version} ` : ""}${q.status}`];
  if (q.sentAt) parts.push(`sent ${day(q.sentAt)}`);
  if (typeof q.total === "number") parts.push(`$${Math.round(q.total).toLocaleString("en-US")}`);
  if (q.viewedAt) parts.push(`opened ${day(q.viewedAt)}`);
  if ((l.quoteCount || 0) > 1) parts.push(`${l.quoteCount} quotes on this lead`);
  return parts.join(", ");
}

export function brief(l: Lead): LeadBrief {
  return {
    id: l.id,
    name: l.name || "",
    phone: l.phone || "",
    email: l.email || "",
    address: l.address || "",
    serviceType: l.serviceType || "",
    stage: String(l.stage || ""),
    nextAction: l.nextAction || "",
    nextActionAt: l.nextActionAt || "",
    appointmentAt: l.appointmentAt || "",
    appointmentTime: l.appointmentTime || "",
    lastContactAt: l.lastContactAt || "",
    contactEveryDays: l.contactEveryDays ? String(l.contactEveryDays) : "",
    contactName: l.contactName || "",
    objection: l.objection || "",
    saleAmount: l.saleAmount || "",
    cashCollected: l.cashCollected || "",
    notes: (l.notes || "").slice(0, 300),
    quote: quoteSummary(l),
  };
}

/** Best matches for a spoken search across every lead. */
export function findLeads(all: Lead[], query: string, limit = 8): Lead[] {
  const q = query.toLowerCase().trim();
  const digits = q.replace(/\D+/g, "");
  const words = q.split(/\s+/).filter(Boolean);
  return all
    .map((l) => {
      const hay = [l.name, l.phone, l.email, l.address, l.serviceType, l.contactName, l.notes, l.sourceNotes]
        .join(" ")
        .toLowerCase();
      let score = 0;
      for (const w of words) if (hay.includes(w)) score += 2;
      if (digits.length >= 4 && (l.phone || "").replace(/\D+/g, "").includes(digits)) score += 5;
      if ((l.name || "").toLowerCase() === q) score += 5;
      // Prefer live leads over closed ones when the score ties.
      if (score > 0 && (l.stage === "not_a_lead" || l.stage === "lost")) score -= 0.5;
      return { l, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.l.createdAt || "").localeCompare(a.l.createdAt || ""))
    .slice(0, limit)
    .map((x) => x.l);
}

export function dueLeads(all: Lead[], today: string, limit = 30): Lead[] {
  return all
    .filter((l) => isDue(l, today))
    .sort((a, b) => (a.nextActionAt || "").localeCompare(b.nextActionAt || ""))
    .slice(0, limit);
}

/**
 * Tool results carry text that customers and forms typed (names, notes).
 * Wrap it so the model treats it as data, and make sure the data can't
 * close the wrapper early.
 */
export function wrapUntrusted(json: string): string {
  const safe = json.replace(/<\/?lead_data/gi, (m) => m.replace("<", "&lt;"));
  return `<lead_data>\n${safe}\n</lead_data>`;
}

export const UPDATE_FIELDS = [
  "address",
  "serviceType",
  "phone",
  "objection",
  "saleAmount",
  "cashCollected",
  "notes",
  "contactEveryDays",
  "contactName",
] as const;

const FIELD_LABELS: Record<(typeof UPDATE_FIELDS)[number], string> = {
  address: "address",
  serviceType: "wants",
  phone: "phone",
  objection: "objection",
  saleAmount: "sale",
  cashCollected: "cash",
  notes: "notes",
  contactEveryDays: "check in every (days)",
  contactName: "contact",
};

function short(v: string, n = 60): string {
  const s = v.replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 3)}...` : s;
}

/** The line Bill reads on the confirm screen, with before and after for edits. */
export function labelFor(tool: string, input: Record<string, unknown>, known: Map<string, Partial<LeadBrief>>): string {
  const lead = (id: unknown) => known.get(String(id));
  const who = (id: unknown) =>
    lead(id)?.name || (String(id).startsWith("new-") ? "the new lead" : `lead ${String(id)}`);
  switch (tool) {
    case "create_lead":
      return `Add lead: ${input.name}${input.phone ? ` (${input.phone})` : ""}${input.serviceType ? `, ${input.serviceType}` : ""}`;
    case "log_activity": {
      const kind = input.type === "attempt" ? "call attempt" : String(input.type);
      return `Log ${kind} on ${who(input.leadId)}: ${input.text}`;
    }
    case "set_next_action":
      return input.date
        ? `Next for ${who(input.leadId)}: ${input.text} on ${input.date}`
        : `Clear next action for ${who(input.leadId)}`;
    case "set_stage": {
      const from = lead(input.leadId)?.stage;
      const fromLabel = from ? `${STAGE_LABELS[from as keyof typeof STAGE_LABELS] ?? from} → ` : "";
      return `Move ${who(input.leadId)}: ${fromLabel}${STAGE_LABELS[input.stage as keyof typeof STAGE_LABELS] ?? input.stage}`;
    }
    case "close_out": {
      const { activity } = closeOutPatch(input, "");
      return `Close out ${who(input.leadId)}: ${activity.text}, clears the next action`;
    }
    case "set_appointment":
      return `Walk / appointment for ${who(input.leadId)} on ${input.date}${input.time ? ` at ${input.time}` : ""} (goes on the calendar)`;
    case "update_lead": {
      const before = lead(input.leadId) || {};
      const changed = UPDATE_FIELDS.filter((k) => String(input[k] ?? "").trim() !== "").map((k) => {
        const was = String((before as Record<string, unknown>)[k] ?? "").trim();
        const now = String(input[k]).trim();
        return `${FIELD_LABELS[k]} ${was ? `"${short(was)}"` : "(blank)"} → "${short(now)}"`;
      });
      return `Update ${who(input.leadId)}: ${changed.join("; ") || "nothing"}`;
    }
  }
  return `${tool} ${JSON.stringify(input)}`;
}

/**
 * Close a lead out the same way the card does: "not_a_lead" with a reason,
 * or "lost" (said no) with the reason as the objection. Clears the next action.
 */
export function closeOutPatch(
  input: Record<string, unknown>,
  nowIso: string
): { patch: Partial<Lead>; activity: LeadActivity } {
  const reason = String(input.reason || "").trim();
  if (input.outcome === "not_a_lead") {
    const key = (DISQUALIFY_REASONS as readonly string[]).includes(reason)
      ? (reason as DisqualifyReason)
      : matchDisqualify(reason);
    const label = DISQUALIFY_LABELS[key];
    const detail = key === "other" && reason && reason !== "other" ? `${label} (${reason})` : label;
    return {
      patch: { stage: "not_a_lead", disqualifyReason: key, disqualifiedAt: nowIso, nextAction: "", nextActionAt: "" },
      activity: { ts: nowIso, type: "stage", text: `Not a lead: ${detail}`, via: "voice" },
    };
  }
  const why = reason || "No reason given";
  return {
    patch: { stage: "lost", objection: why, nextAction: "", nextActionAt: "" },
    activity: { ts: nowIso, type: "stage", text: `Said no: ${why}`, via: "voice" },
  };
}

function matchDisqualify(reason: string): DisqualifyReason {
  const r = reason.toLowerCase();
  if (/spam|fake|bot|scam/.test(r)) return "spam";
  if (/duplicate|dupe|already have/.test(r)) return "duplicate";
  if (/area|too far|out of/.test(r)) return "out_of_area";
  if (/wrong|don'?t do|not a service|service/.test(r)) return "wrong_service";
  if (/shopping|tire|kick|just looking|no project/.test(r)) return "tire_kicker";
  return "other";
}

/**
 * Someone already in the pipeline with this phone (last 10 digits) or email,
 * so the assistant and the Add-lead form don't make a second lead.
 */
export function findExistingLead(
  all: Array<Pick<Lead, "id" | "name" | "phone" | "email">>,
  who: { phone?: string; email?: string }
): { id: string; name: string; match: "phone" | "email" } | null {
  const phone = phoneKey(who.phone || "");
  const email = (who.email || "").trim().toLowerCase();
  if (phone) {
    const hit = all.find((l) => phoneKey(l.phone || "") === phone);
    if (hit) return { id: hit.id, name: hit.name || "", match: "phone" };
  }
  if (email.includes("@")) {
    const hit = all.find((l) => (l.email || "").trim().toLowerCase() === email);
    if (hit) return { id: hit.id, name: hit.name || "", match: "email" };
  }
  return null;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function validDay(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * A date the assistant was given, as YYYY-MM-DD in Detroit time: already
 * YYYY-MM-DD, or "today", "tomorrow", a weekday ("Friday" = the next one
 * after today), "next week", "in 3 days", "10/2" or "10/2/2026". Returns ""
 * for blank and null for anything else ("next Friday" is ambiguous and is
 * refused so the model has to say the date).
 */
export function resolveDate(input: unknown, today: string): string | null {
  const raw = String(input ?? "").trim().toLowerCase().replace(/[.,]$/, "");
  if (!raw) return "";
  if (validDay(raw)) return raw;
  if (raw === "today") return today;
  if (raw === "tomorrow") return addDays(today, 1);
  if (raw === "next week") return addDays(today, 7);
  const inDays = raw.match(/^in (\d{1,3}) days?$/);
  if (inDays) return addDays(today, Number(inDays[1]));
  const wd = raw.replace(/^(this|on) /, "");
  const idx = WEEKDAYS.findIndex((d) => d === wd || d.slice(0, 3) === wd);
  if (idx >= 0) {
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
    return addDays(today, ((idx - dow + 7) % 7) || 7);
  }
  const md = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (md) {
    const [y0] = today.split("-").map(Number);
    const m = Number(md[1]);
    const d = Number(md[2]);
    const pad = (n: number) => String(n).padStart(2, "0");
    let y = md[3] ? Number(md[3].length === 2 ? `20${md[3]}` : md[3]) : y0;
    let out = `${y}-${pad(m)}-${pad(d)}`;
    // No year and more than a month back: they mean next year (January in the fall).
    if (!md[3] && validDay(out) && out < addDays(today, -30)) {
      y += 1;
      out = `${y}-${pad(m)}-${pad(d)}`;
    }
    return validDay(out) ? out : null;
  }
  return null;
}

/** "14:30", "2pm", "2:30 pm", "9 am" -> HH:MM (24h); "" for blank; null if unreadable. */
export function resolveTime(input: unknown): string | null {
  const raw = String(input ?? "").trim().toLowerCase().replace(/\./g, "");
  if (!raw) return "";
  const m = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? "0");
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    if (m[3] === "pm" && h !== 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
  } else if (m[2] === undefined || h > 23) {
    return null; // "14" alone is too easy to mishear
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
