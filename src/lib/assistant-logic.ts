// Pure parts of the voice assistant (no Firebase, no Anthropic), so they can
// be tested: what the model sees about a lead, search scoring, the confirm
// labels Bill reads before saving, and the close-out rules.

import {
  DISQUALIFY_LABELS,
  DISQUALIFY_REASONS,
  STAGE_LABELS,
  isDue,
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
