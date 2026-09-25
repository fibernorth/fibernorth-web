import type Anthropic from "@anthropic-ai/sdk";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { saveLeadServer } from "@/services/lead-writes";
import { LEAD_STAGES, STAGE_LABELS, todayISO, type Lead, type LeadActivity } from "@/lib/leads";
import {
  UPDATE_FIELDS,
  brief,
  closeOutPatch,
  dueLeads,
  findLeads,
  labelFor,
  wrapUntrusted,
  type LeadBrief,
} from "@/lib/assistant-logic";

export { labelFor };

// Tools the voice assistant can use against the lead pipeline.
//
// Two phases:
//   plan  - Claude runs with read tools live and write tools "queued": every
//           write is recorded as an action and reported back for the user to
//           confirm on screen. Nothing is saved. The route stores the plan
//           server-side.
//   apply - the stored plan (only the actions Bill kept) is executed in order.
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
      "Search every lead in the pipeline by name, phone, address, contact person, or notes. Returns up to 8 matches with id, stage, next action, and quote status. Use this before any action on an existing lead (unless it's the lead open on screen).",
    strict: true,
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_lead",
    description: "Read one lead by id, including its quote status and last few history lines.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { leadId: { type: "string" } },
      required: ["leadId"],
      additionalProperties: false,
    },
  },
  {
    name: "list_due",
    description:
      "List leads due today or overdue: open and long-term leads whose check-back date has come, and won jobs still to schedule.",
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
    description:
      "Record something that happened with a lead: a call where Bill talked to them (call), a call with no answer or a voicemail (attempt), a text, email, site walk, letter, or a note.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        type: { type: "string", enum: ["call", "attempt", "text", "email", "walk", "letter", "note"] },
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
    description: `Move a lead to a stage. Stages: ${LEAD_STAGES.map((s) => `${s} (${STAGE_LABELS[s]})`).join(", ")}. To mark a lead lost or not a lead, use close_out instead.`,
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
    name: "close_out",
    description:
      "Close a lead out, the same as the card's close-out buttons: outcome not_a_lead (reason one of spam, wrong_service, out_of_area, tire_kicker, duplicate, other) or lost (they said no; reason like Price, Went with someone else, Timing / not this year, Did it themselves, No response). Clears the next action.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        outcome: { type: "string", enum: ["not_a_lead", "lost"] },
        reason: { type: "string" },
      },
      required: ["leadId", "outcome", "reason"],
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
      required: ["leadId", ...UPDATE_FIELDS],
      additionalProperties: false,
    },
  },
];

const WRITE_TOOLS = new Set([
  "create_lead",
  "log_activity",
  "set_next_action",
  "set_stage",
  "close_out",
  "set_appointment",
  "update_lead",
]);

export function isWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name);
}

function db(): Firestore {
  return getFirestore(initializeAdminApp());
}

// Everything the assistant needs about a lead, without the history array.
const BRIEF_FIELDS = [
  "name",
  "phone",
  "email",
  "address",
  "serviceType",
  "contactName",
  "notes",
  "sourceNotes",
  "stage",
  "nextAction",
  "nextActionAt",
  "appointmentAt",
  "appointmentTime",
  "lastContactAt",
  "contactEveryDays",
  "objection",
  "saleAmount",
  "cashCollected",
  "quote",
  "quoteCount",
  "createdAt",
];

/** Every lead (the collection is a few thousand at most), history left out. */
async function allLeads(): Promise<Lead[]> {
  const snap = await db()
    .collection("leads")
    .select(...BRIEF_FIELDS)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Lead, "id">) }) as Lead);
}

export async function loadLeadBrief(id: string): Promise<(LeadBrief & { recent: string[] }) | null> {
  if (!id || id.includes("/")) return null;
  const snap = await db().collection("leads").doc(id).get();
  if (!snap.exists) return null;
  const l = { id: snap.id, ...(snap.data() as Omit<Lead, "id">) } as Lead;
  const recent = [...(l.activity || [])]
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, 5)
    .map((a) => `${a.ts.slice(0, 10)} ${a.type}: ${a.text.slice(0, 200)}`);
  return { ...brief(l), recent };
}

/**
 * Run a read tool. Returns the raw briefs (for labels) and the text for the
 * model, wrapped as untrusted data.
 */
export async function runReadTool(
  name: string,
  input: Record<string, unknown>
): Promise<{ briefs: LeadBrief[]; content: string }> {
  if (name === "get_lead") {
    const b = await loadLeadBrief(String(input.leadId || ""));
    return { briefs: b ? [b] : [], content: wrapUntrusted(JSON.stringify(b ?? { error: "no lead with that id" })) };
  }
  if (name === "find_leads") {
    const found = findLeads(await allLeads(), String(input.query || "")).map(brief);
    return { briefs: found, content: wrapUntrusted(JSON.stringify(found)) };
  }
  if (name === "list_due") {
    const due = dueLeads(await allLeads(), todayLocal()).map(brief);
    return { briefs: due, content: wrapUntrusted(JSON.stringify(due)) };
  }
  return { briefs: [], content: JSON.stringify({ error: `unknown tool ${name}` }) };
}

export function todayLocal(): string {
  // Bill is in Michigan (America/Detroit); same clock as the Leads page.
  return todayISO();
}

/** Execute confirmed actions in order. Returns one line per action. */
export async function applyActions(actions: PlannedAction[]): Promise<string[]> {
  const store = db();
  const leads = store.collection("leads");
  const now = new Date().toISOString();
  const idMap = new Map<string, string>();
  const out: string[] = [];

  const resolve = (id: unknown) => idMap.get(String(id)) || String(id);
  const save = (id: string, patch: Parameters<typeof saveLeadServer>[2], a: LeadActivity) =>
    saveLeadServer(store, id, patch, { ...a, via: "voice" });

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
            activity: [{ ts: now, type: "system", text: "Added by voice", via: "voice" }],
            touched: true,
            createdAt: now,
            updatedAt: now,
          });
          if (typeof input.__placeholder === "string") idMap.set(input.__placeholder, ref.id);
          out.push(`Added ${input.name}`);
          break;
        }
        case "log_activity":
          await save(resolve(input.leadId), {}, {
            ts: now,
            type: (input.type as LeadActivity["type"]) || "note",
            text: String(input.text || ""),
          });
          out.push(`Logged ${input.type === "attempt" ? "call attempt" : input.type}`);
          break;
        case "set_next_action":
          await save(
            resolve(input.leadId),
            { nextAction: String(input.text || ""), nextActionAt: String(input.date || "") },
            { ts: now, type: "system", text: input.date ? `Next: ${input.text} (${input.date})` : "Next action cleared" }
          );
          out.push(input.date ? `Next action set for ${input.date}` : "Next action cleared");
          break;
        case "set_stage": {
          const stage = String(input.stage);
          const clear = stage === "lost" || stage === "not_a_lead" ? { nextAction: "", nextActionAt: "" } : {};
          await save(
            resolve(input.leadId),
            { stage, ...clear },
            { ts: now, type: "stage", text: `Moved to ${STAGE_LABELS[stage as keyof typeof STAGE_LABELS] ?? stage}` }
          );
          out.push(`Stage: ${STAGE_LABELS[stage as keyof typeof STAGE_LABELS] ?? stage}`);
          break;
        }
        case "close_out": {
          const { patch, activity } = closeOutPatch(input, now);
          await save(resolve(input.leadId), patch, activity);
          out.push(activity.text);
          break;
        }
        case "set_appointment": {
          const id = resolve(input.leadId);
          const time = String(input.time || "").trim();
          const date = String(input.date || "");
          await save(
            id,
            // Decided on the fresh lead inside the transaction.
            (fresh) => ({
              appointmentAt: date,
              appointmentTime: time,
              ...(["new", "contacted"].includes(String(fresh.stage || "new")) ? { stage: "walk_scheduled" } : {}),
            }),
            { ts: now, type: "walk", text: `Walk scheduled for ${date}${time ? ` at ${time}` : ""}` }
          );
          let calNote = "";
          try {
            const { syncLeadEventById } = await import("@/lib/google-calendar");
            await syncLeadEventById(id);
            calNote = ", on the calendar";
          } catch (e) {
            calNote = ` (calendar: ${e instanceof Error ? e.message : "failed"})`;
          }
          out.push(`Walk on ${date}${time ? ` at ${time}` : ""}${calNote}`);
          break;
        }
        case "update_lead": {
          const patch: Record<string, string | number> = {};
          for (const k of UPDATE_FIELDS) {
            if (k === "contactEveryDays") continue;
            const v = String(input[k] || "").trim();
            if (v) patch[k] = v;
          }
          const every = String(input.contactEveryDays ?? "").trim();
          if (every !== "") patch.contactEveryDays = Number(every) || 0;
          await save(resolve(input.leadId), patch, {
            ts: now,
            type: "system",
            text: `Updated ${Object.keys(patch).join(", ") || "nothing"}`,
          });
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
