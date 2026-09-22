import type Anthropic from "@anthropic-ai/sdk";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { LEAD_STAGES, STAGE_LABELS, contactPatch, type Lead, type LeadActivity } from "@/lib/leads";

// Tools the voice assistant can use against the lead pipeline.
//
// Two phases:
//   plan  - Claude runs with read tools live and write tools "queued": every
//           write is recorded as an action and reported back for the user to
//           confirm on screen. Nothing is saved.
//   apply - the confirmed action list is executed in order.
//
// Placeholder ids: a create_lead in the plan phase returns "new-N"; later
// actions may reference it and apply() maps it to the real id.

export interface PlannedAction {
  tool: string;
  input: Record<string, unknown>;
  label: string;
}

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "find_leads",
    description:
      "Search the lead pipeline by name, phone, address, or notes. Returns up to 8 matches with their id, stage and next action. Use this before any action on an existing lead.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "list_due",
    description: "List open leads whose next action is due today or overdue.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "create_lead",
    description: "Add a new lead to the pipeline.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        address: { type: "string" },
        serviceType: { type: "string", description: "What they want, e.g. water line, power to barn, fiber" },
        source: {
          type: "string",
          enum: ["phone", "referral", "website", "meta-ads", "campground-letter", "contractor-letter", "other"],
        },
        notes: { type: "string" },
      },
      required: ["name", "phone", "email", "address", "serviceType", "source", "notes"],
      additionalProperties: false,
    },
  },
  {
    name: "log_activity",
    description: "Record something that happened with a lead: a call, text, email, site walk, or a note.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        type: { type: "string", enum: ["call", "text", "email", "walk", "letter", "note"] },
        text: { type: "string" },
      },
      required: ["leadId", "type", "text"],
      additionalProperties: false,
    },
  },
  {
    name: "set_next_action",
    description: "Set what to do next for a lead and on what date (YYYY-MM-DD). Use an empty date to clear.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        text: { type: "string" },
        date: { type: "string" },
      },
      required: ["leadId", "text", "date"],
      additionalProperties: false,
    },
  },
  {
    name: "set_stage",
    description: `Move a lead to a stage. Stages: ${LEAD_STAGES.map((s) => `${s} (${STAGE_LABELS[s]})`).join(", ")}.`,
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        stage: { type: "string", enum: [...LEAD_STAGES] },
      },
      required: ["leadId", "stage"],
      additionalProperties: false,
    },
  },
  {
    name: "set_appointment",
    description:
      "Book or change the site walk / appointment for a lead: date (YYYY-MM-DD) and optional time (HH:MM, 24h; empty = all day). Also moves the lead to walk_scheduled if it is earlier in the pipeline, and puts it on the shared Google Calendar.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { leadId: { type: "string" }, date: { type: "string" }, time: { type: "string" } },
      required: ["leadId", "date", "time"],
      additionalProperties: false,
    },
  },
  {
    name: "update_lead",
    description: "Change details on a lead. Pass an empty string for any field you are not changing.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        address: { type: "string" },
        serviceType: { type: "string" },
        phone: { type: "string" },
        objection: { type: "string" },
        saleAmount: { type: "string" },
        cashCollected: { type: "string" },
        notes: { type: "string", description: "Replaces our notes field entirely" },
        contactEveryDays: {
          type: "string",
          description: "How often to check in, in days (e.g. 14, 30, 90). Empty = no change, 0 = no schedule.",
        },
        contactName: { type: "string", description: "The person we talk to at a business" },
      },
      required: [
        "leadId",
        "address",
        "serviceType",
        "phone",
        "objection",
        "saleAmount",
        "cashCollected",
        "notes",
        "contactEveryDays",
        "contactName",
      ],
      additionalProperties: false,
    },
  },
];

const WRITE_TOOLS = new Set([
  "create_lead",
  "log_activity",
  "set_next_action",
  "set_stage",
  "set_appointment",
  "update_lead",
]);

export function isWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name);
}

function db(): Firestore {
  return getFirestore(initializeAdminApp());
}

function brief(l: Lead): Record<string, string> {
  return {
    id: l.id,
    name: l.name || "",
    phone: l.phone || "",
    address: l.address || "",
    serviceType: l.serviceType || "",
    stage: String(l.stage),
    nextAction: l.nextAction || "",
    nextActionAt: l.nextActionAt || "",
    appointmentAt: l.appointmentAt || "",
    lastContactAt: l.lastContactAt || "",
    contactEveryDays: l.contactEveryDays ? String(l.contactEveryDays) : "",
    contactName: l.contactName || "",
  };
}

export async function runReadTool(name: string, input: Record<string, unknown>): Promise<string> {
  const snap = await db().collection("leads").orderBy("createdAt", "desc").limit(500).get();
  const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Lead, "id">) }) as Lead);

  if (name === "find_leads") {
    const q = String(input.query || "").toLowerCase().trim();
    const digits = q.replace(/\D+/g, "");
    const words = q.split(/\s+/).filter(Boolean);
    const scored = all
      .map((l) => {
        const hay = [l.name, l.phone, l.email, l.address, l.serviceType, l.notes, l.sourceNotes]
          .join(" ")
          .toLowerCase();
        let score = 0;
        for (const w of words) if (hay.includes(w)) score += 2;
        if (digits.length >= 4 && (l.phone || "").replace(/\D+/g, "").includes(digits)) score += 5;
        if ((l.name || "").toLowerCase() === q) score += 5;
        return { l, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    return JSON.stringify(scored.map((x) => brief(x.l)));
  }

  if (name === "list_due") {
    const today = todayLocal();
    const due = all.filter(
      (l) =>
        ["new", "contacted", "walk_scheduled", "walk_done", "quoted"].includes(String(l.stage)) &&
        ((l.nextActionAt && l.nextActionAt <= today) || (!l.nextActionAt && l.stage === "new"))
    );
    return JSON.stringify(due.slice(0, 30).map(brief));
  }

  return JSON.stringify({ error: `unknown tool ${name}` });
}

export function todayLocal(): string {
  // Bill is in Michigan (America/Detroit).
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Detroit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function labelFor(tool: string, input: Record<string, unknown>, leadNames: Map<string, string>): string {
  const who = (id: unknown) => leadNames.get(String(id)) || (String(id).startsWith("new-") ? "the new lead" : `lead ${id}`);
  switch (tool) {
    case "create_lead":
      return `Add lead: ${input.name}${input.phone ? ` (${input.phone})` : ""}${input.serviceType ? `, ${input.serviceType}` : ""}`;
    case "log_activity":
      return `Log ${input.type} on ${who(input.leadId)}: ${input.text}`;
    case "set_next_action":
      return input.date
        ? `Next for ${who(input.leadId)}: ${input.text} on ${input.date}`
        : `Clear next action for ${who(input.leadId)}`;
    case "set_stage":
      return `Move ${who(input.leadId)} to ${STAGE_LABELS[input.stage as keyof typeof STAGE_LABELS] ?? input.stage}`;
    case "set_appointment":
      return `Walk / appointment for ${who(input.leadId)} on ${input.date}${input.time ? ` at ${input.time}` : ""} (goes on the calendar)`;
    case "update_lead": {
      const changed = Object.entries(input)
        .filter(([k, v]) => k !== "leadId" && String(v || "").trim())
        .map(([k, v]) => `${k}: ${v}`);
      return `Update ${who(input.leadId)}: ${changed.join(", ") || "nothing"}`;
    }
  }
  return `${tool} ${JSON.stringify(input)}`;
}

/** Execute confirmed actions in order. Returns one line per action. */
export async function applyActions(actions: PlannedAction[]): Promise<string[]> {
  const store = db();
  const leads = store.collection("leads");
  const now = new Date().toISOString();
  const idMap = new Map<string, string>();
  const out: string[] = [];

  const resolve = (id: unknown) => idMap.get(String(id)) || String(id);

  const appendActivity = async (id: string, a: LeadActivity, extra: Record<string, unknown> = {}) => {
    const ref = leads.doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new Error(`Lead ${id} not found`);
    const data = (snap.data() || {}) as Partial<Lead>;
    const activity = (data.activity as LeadActivity[]) || [];
    const contact = contactPatch({ ...data, ...extra } as Lead, a, todayLocal());
    await ref.update({ ...contact, ...extra, activity: [...activity, a], touched: true, updatedAt: now });
  };

  for (const action of actions) {
    const input = action.input;
    try {
      switch (action.tool) {
        case "create_lead": {
          const ref = await leads.add({
            name: String(input.name || ""),
            phone: String(input.phone || ""),
            email: String(input.email || ""),
            address: String(input.address || ""),
            serviceType: String(input.serviceType || ""),
            source: String(input.source || "phone"),
            notes: String(input.notes || ""),
            stage: "new",
            nextAction: "Call back",
            nextActionAt: todayLocal(),
            activity: [{ ts: now, type: "system", text: "Added by voice" }],
            touched: true,
            createdAt: now,
            updatedAt: now,
          });
          if (typeof input.__placeholder === "string") idMap.set(input.__placeholder, ref.id);
          out.push(`Added ${input.name}`);
          break;
        }
        case "log_activity":
          await appendActivity(resolve(input.leadId), {
            ts: now,
            type: (input.type as LeadActivity["type"]) || "note",
            text: String(input.text || ""),
          });
          out.push(`Logged ${input.type}`);
          break;
        case "set_next_action":
          await appendActivity(
            resolve(input.leadId),
            { ts: now, type: "system", text: input.date ? `Next: ${input.text} (${input.date})` : "Next action cleared" },
            { nextAction: String(input.text || ""), nextActionAt: String(input.date || "") }
          );
          out.push(input.date ? `Next action set for ${input.date}` : "Next action cleared");
          break;
        case "set_stage":
          await appendActivity(
            resolve(input.leadId),
            { ts: now, type: "stage", text: `Moved to ${STAGE_LABELS[input.stage as keyof typeof STAGE_LABELS] ?? input.stage}` },
            { stage: String(input.stage) }
          );
          out.push(`Stage: ${STAGE_LABELS[input.stage as keyof typeof STAGE_LABELS] ?? input.stage}`);
          break;
        case "set_appointment": {
          const id = resolve(input.leadId);
          const snap = await leads.doc(id).get();
          const stage = String(snap.data()?.stage || "new");
          const bump = ["new", "contacted"].includes(stage) ? { stage: "walk_scheduled" } : {};
          const time = String(input.time || "").trim();
          await appendActivity(
            id,
            { ts: now, type: "walk", text: `Walk scheduled for ${input.date}${time ? ` at ${time}` : ""}` },
            { appointmentAt: String(input.date || ""), appointmentTime: time, ...bump }
          );
          let calNote = "";
          try {
            const { syncLeadEventById } = await import("@/lib/google-calendar");
            await syncLeadEventById(id);
            calNote = ", on the calendar";
          } catch (e) {
            calNote = ` (calendar: ${e instanceof Error ? e.message : "failed"})`;
          }
          out.push(`Walk on ${input.date}${time ? ` at ${time}` : ""}${calNote}`);
          break;
        }
        case "update_lead": {
          const patch: Record<string, string | number> = {};
          for (const k of ["address", "serviceType", "phone", "objection", "saleAmount", "cashCollected", "notes", "contactName"]) {
            const v = String(input[k] || "").trim();
            if (v) patch[k] = v;
          }
          const every = String(input.contactEveryDays ?? "").trim();
          if (every !== "") patch.contactEveryDays = Number(every) || 0;
          await appendActivity(
            resolve(input.leadId),
            { ts: now, type: "system", text: `Updated ${Object.keys(patch).join(", ") || "nothing"}` },
            patch
          );
          out.push(`Updated ${Object.keys(patch).join(", ")}`);
          break;
        }
        default:
          out.push(`Skipped unknown action ${action.tool}`);
      }
    } catch (e) {
      out.push(`Failed: ${action.label} (${e instanceof Error ? e.message : "error"})`);
    }
  }
  return out;
}
