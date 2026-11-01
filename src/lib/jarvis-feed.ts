// Jarvis (Bill's scheduled Claude assistant) logs and reads leads through
// /api/leads/feed. Pure planning rules live here (no Firebase), so the route
// and the tests share one copy. Same split as bid-feed.ts.
//
// Rules:
// - A lead is matched by its Jarvis key, then an explicit leadId, then phone,
//   then email, then (only when Jarvis sent neither phone nor email) an exact
//   name. A match made any other way than the key stamps the key on the lead,
//   so the next request matches by key.
// - Jarvis owns: stage (forward only), quotedAmount, owner, next step.
//   Everything else only fills a blank. Nothing Bill typed is overwritten.
// - Notes are never written over notes: each new note is appended to the
//   history, marked via "jarvis". Replaying the same request changes nothing.
// - A contractor/company with a `job` becomes a contractor account
//   (isAccount) and the job is its own lead under it (parentLeadId), the
//   model src/lib/contractors.ts already uses.

import { createHash } from "crypto";
import { z } from "zod";
import {
  LEAD_SOURCES,
  LEAD_STAGES,
  STAGE_LABELS,
  CLOSED_STAGES,
  parseMoney,
  phoneKey,
  type Lead,
  type LeadActivity,
  type LeadStage,
} from "@/lib/leads";
import { followUpFor } from "@/lib/sheet-sync";

const text = (max: number) => z.string().trim().max(max).optional().default("");
const day = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "must be YYYY-MM-DD")
  .optional()
  .default("");

export const feedLeadSchema = z.object({
  key: z.string().trim().min(3).max(200),
  /** Optional: the id of an existing lead to attach to (GET returns ids). */
  leadId: text(100),
  company: text(200),
  contact: text(200),
  /** Optional job name. With a company, makes the company an account and this a job under it. */
  job: text(200),
  phone: text(40),
  email: text(200),
  siteAddress: text(300),
  scope: text(500),
  /** The quoted amount: a number or text like "$9,325". */
  amount: z.union([z.number(), z.string().trim().max(40)]).nullable().optional(),
  stage: text(40),
  owner: text(100),
  nextStep: text(300),
  nextStepDate: day,
  source: text(60),
  notes: text(5000),
});
export type FeedLead = z.infer<typeof feedLeadSchema>;

export const feedBodySchema = z.object({
  leads: z.array(feedLeadSchema).min(1).max(50),
  /** Let the stage move backward too. */
  force: z.boolean().optional().default(false),
});

// ---- ids and keys ------------------------------------------------------------

export const normName = (s: string | undefined): string =>
  (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);

const normKey = (key: string) => key.trim().toLowerCase();

/** What goes in externalId: "jarvis:<key>". */
export const jarvisExternalId = (key: string): string => `jarvis:${normKey(key)}`;
/** Deterministic doc id for a key, so a retry can never make a second lead. */
export const jarvisLeadId = (key: string): string => `jarvis_${hash(normKey(key))}`;
export const jarvisAccountExternalId = (company: string): string => `jarvis-account:${normName(company)}`;
export const jarvisAccountId = (company: string): string => `jarvis_acct_${hash(normName(company))}`;

// ---- stage -------------------------------------------------------------------

const STAGE_ALIASES: Record<string, LeadStage> = {
  new: "new",
  lead: "new",
  attempted: "attempted",
  contacted: "contacted",
  walk_scheduled: "walk_scheduled",
  "walk scheduled": "walk_scheduled",
  "site walk scheduled": "walk_scheduled",
  walk_done: "walk_done",
  "walk done": "walk_done",
  walked: "walk_done",
  quoted: "quoted",
  "quote sent": "quoted",
  quote: "quoted",
  bidding: "quoted",
  won: "won",
  sold: "won",
  nurture: "nurture",
  "long term": "nurture",
  lost: "lost",
  not_a_lead: "not_a_lead",
  "not a lead": "not_a_lead",
};

/** The pipeline stage for what Jarvis sent, or null when it is not one we know. */
export function stageFromFeed(raw: string): LeadStage | null {
  const s = raw.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  if (!s) return null;
  const direct = (LEAD_STAGES as readonly string[]).find((x) => x === raw.trim().toLowerCase());
  if (direct) return direct as LeadStage;
  return STAGE_ALIASES[s] ?? STAGE_ALIASES[s.replace(/ /g, "_")] ?? null;
}

/**
 * Order stages move in for the feed. Unlike the Sheet sync's ranking, Long
 * term (nurture) is a parking spot BELOW the active stages: a Long term lead
 * Jarvis has now quoted moves forward, while Jarvis sending "nurture" for a
 * quoted lead is a step back.
 */
const FEED_RANK: Record<LeadStage, number> = {
  new: 0,
  attempted: 0.5,
  nurture: 0.75,
  contacted: 1,
  walk_scheduled: 2,
  walk_done: 3,
  quoted: 4,
  lost: 6,
  not_a_lead: 6,
  won: 7,
};

export function isFeedForward(from: string, to: LeadStage): boolean {
  const a = FEED_RANK[(from || "new") as LeadStage];
  return a === undefined ? true : FEED_RANK[to] > a;
}

// ---- small parsers -----------------------------------------------------------

/** "9 AM", "9:30 pm" in a next step -> "09:00" / "21:30", or "". */
export function timeFromText(s: string): string {
  const m = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\b/i);
  if (!m) return "";
  let h = Number(m[1]) % 12;
  const min = m[2] ? Number(m[2]) : 0;
  if (min > 59 || Number(m[1]) > 12 || Number(m[1]) < 1) return "";
  if (m[3].toLowerCase() === "p") h += 12;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function sourceFor(raw: string): string {
  const s = raw.trim().toLowerCase();
  return (LEAD_SOURCES as readonly string[]).includes(s) ? s : "other";
}

// ---- planning ----------------------------------------------------------------

export interface PlanContext {
  now: string;
  today: string;
  force: boolean;
  /** Set when this lead is a job under a contractor account. */
  parentLeadId?: string;
}

export type LeadPlan =
  | { kind: "rejected"; reason: string }
  | { kind: "create"; doc: Omit<Lead, "id"> }
  | { kind: "update"; patch: Record<string, unknown>; lines: LeadActivity[]; changed: string[]; held?: string }
  | { kind: "unchanged"; held?: string };

const via = (type: LeadActivity["type"], t: string, now: string): LeadActivity => ({ ts: now, type, text: t, via: "jarvis" });

/** The name a lead is filed under: the job, else the company, else the person. */
export function leadNameFor(f: Pick<FeedLead, "job" | "company" | "contact" | "key">): string {
  return f.job || f.company || f.contact || f.key;
}

/** What one feed entry does to its lead (null = no lead yet), from the lead as given. */
export function planLead(f: FeedLead, lead: Lead | null, ctx: PlanContext): LeadPlan {
  const wanted = f.stage ? stageFromFeed(f.stage) : null;
  if (f.stage && !wanted) return { kind: "rejected", reason: `Unknown stage "${f.stage}"` };
  const amount = f.amount === null || f.amount === undefined || f.amount === "" ? null : parseMoney(f.amount);
  if (f.amount !== null && f.amount !== undefined && f.amount !== "" && amount === null) {
    return { kind: "rejected", reason: `Can't read amount "${String(f.amount)}"` };
  }
  const { now, today } = ctx;

  if (!lead) {
    const stage: LeadStage = wanted ?? "new";
    const closed = CLOSED_STAGES.includes(stage);
    const next =
      f.nextStep || f.nextStepDate
        ? {
            nextAction: closed ? "" : f.nextStep,
            nextActionAt: closed ? "" : f.nextStepDate,
            nextActionAuto: false,
          }
        : followUpFor(stage, today);
    const activity: LeadActivity[] = [via("system", "Added by Jarvis", now)];
    if (f.notes) activity.push(via("note", f.notes, now));
    const doc: Omit<Lead, "id"> = {
      name: leadNameFor(f),
      phone: f.phone,
      email: f.email,
      address: f.siteAddress,
      serviceType: f.scope,
      source: sourceFor(f.source),
      externalId: jarvisExternalId(f.key),
      externalIds: [jarvisExternalId(f.key)],
      stage,
      ...next,
      notes: "",
      activity,
      touched: false,
      createdAt: now,
      updatedAt: now,
    };
    // A contractor's contact person; for a one-person lead the name is the person.
    if ((f.company || f.job) && f.contact) doc.contactName = f.contact;
    if (ctx.parentLeadId) doc.parentLeadId = ctx.parentLeadId;
    if (f.owner) doc.owner = f.owner;
    if (amount !== null) {
      doc.quotedAmount = amount;
      if (stage === "won") Object.assign(doc, { saleAmount: money(amount), saleAmountNum: amount });
    }
    if (stage === "walk_scheduled" && f.nextStepDate) {
      doc.appointmentAt = f.nextStepDate;
      const t = timeFromText(f.nextStep);
      if (t) doc.appointmentTime = t;
    }
    if (f.source && sourceFor(f.source) === "other") {
      doc.activity!.push(via("system", `Source from Jarvis: ${f.source}`, now));
    }
    return { kind: "create", doc };
  }

  // ---- existing lead -------------------------------------------------------
  const patch: Record<string, unknown> = {};
  const lines: LeadActivity[] = [];
  const changed: string[] = [];
  const said: string[] = [];
  let held: string | undefined;

  const key = jarvisExternalId(f.key);
  const keys = [lead.externalId || "", ...(lead.externalIds || [])];
  if (!keys.includes(key)) {
    patch.externalIds = [...new Set([...keys.filter(Boolean), key])];
    if (!lead.externalId) patch.externalId = key;
    changed.push("key");
  }

  // Stage: forward only unless forced.
  let stageNow = String(lead.stage || "new");
  if (wanted && wanted !== stageNow) {
    if (ctx.force || isFeedForward(stageNow, wanted)) {
      patch.stage = wanted;
      stageNow = wanted;
      changed.push("stage");
      lines.push(via("stage", `Moved to ${STAGE_LABELS[wanted]} (via Jarvis)`, now));
      if (wanted === "won" && amount !== null && !lead.saleAmount) {
        patch.saleAmount = money(amount);
        patch.saleAmountNum = amount;
      }
      if (wanted === "lost" || wanted === "not_a_lead") patch.stageBeforeClose = lead.stage;
    } else {
      held = `Stage stays ${STAGE_LABELS[stageNow as LeadStage] ?? stageNow}; Jarvis sent ${STAGE_LABELS[wanted]} (a step back; use force to allow)`;
    }
  }
  const closedNow = CLOSED_STAGES.includes(stageNow as LeadStage);
  if (closedNow && patch.stage) Object.assign(patch, { nextAction: "", nextActionAt: "", nextActionAuto: false });

  // Fields Jarvis owns.
  if (amount !== null && amount !== lead.quotedAmount) {
    patch.quotedAmount = amount;
    changed.push("amount");
    said.push(`amount ${money(amount)}`);
  }
  if (f.owner && f.owner !== lead.owner) {
    patch.owner = f.owner;
    changed.push("owner");
    said.push(`owner ${f.owner}`);
  }
  if (!closedNow) {
    if (f.nextStep && f.nextStep !== (lead.nextAction || "")) {
      patch.nextAction = f.nextStep;
      patch.nextActionAuto = false;
      changed.push("nextStep");
      said.push(`next step "${f.nextStep}"`);
    }
    if (f.nextStepDate && f.nextStepDate !== (lead.nextActionAt || "")) {
      patch.nextActionAt = f.nextStepDate;
      patch.nextActionAuto = false;
      changed.push("nextStepDate");
      said.push(`next step date ${f.nextStepDate}`);
    }
    if (stageNow === "walk_scheduled" && f.nextStepDate && f.nextStepDate !== (lead.appointmentAt || "")) {
      patch.appointmentAt = f.nextStepDate;
      patch.appointmentTime = timeFromText(f.nextStep);
      changed.push("appointment");
      said.push(`site walk ${f.nextStepDate}${patch.appointmentTime ? ` ${patch.appointmentTime}` : ""}`);
    }
  }

  // Fills a blank, never overwrites.
  const fill = (field: keyof Lead, value: string, label: string) => {
    if (value && !String(lead[field] || "").trim()) {
      patch[field] = value;
      changed.push(label);
      said.push(`${label} ${value}`);
    }
  };
  fill("phone", f.phone, "phone");
  fill("email", f.email, "email");
  fill("address", f.siteAddress, "address");
  fill("serviceType", f.scope, "scope");
  if (f.contact && (f.company || f.job)) fill("contactName", f.contact, "contact");
  if (ctx.parentLeadId && !lead.parentLeadId) {
    patch.parentLeadId = ctx.parentLeadId;
    changed.push("company");
    said.push("filed under its company");
  }

  if (said.length) lines.push(via("system", `Jarvis updated: ${said.join("; ")}`, now));
  // A note already in the history (a replay) is not added twice.
  if (f.notes && !(lead.activity || []).some((a) => a.via === "jarvis" && a.type === "note" && a.text === f.notes)) {
    lines.push(via("note", f.notes, now));
    changed.push("notes");
  }

  if (changed.length === 0 && lines.length === 0) return { kind: "unchanged", ...(held ? { held } : {}) };
  return { kind: "update", patch, lines, changed, ...(held ? { held } : {}) };
}

// ---- matching ----------------------------------------------------------------

export interface LeadIndex {
  byId: Map<string, Lead>;
  byKey: Map<string, Lead>;
  byPhone: Map<string, Lead[]>;
  byEmail: Map<string, Lead[]>;
  byName: Map<string, Lead[]>;
}

export function buildIndex(leads: Lead[]): LeadIndex {
  const idx: LeadIndex = { byId: new Map(), byKey: new Map(), byPhone: new Map(), byEmail: new Map(), byName: new Map() };
  for (const l of leads) addToIndex(idx, l);
  return idx;
}

export function addToIndex(idx: LeadIndex, l: Lead): void {
  idx.byId.set(l.id, l);
  for (const k of [l.externalId || "", ...(l.externalIds || [])]) if (k && !idx.byKey.has(k)) idx.byKey.set(k, l);
  if (l.private) return; // "Just mine" leads are never matched or edited by the feed
  const push = (m: Map<string, Lead[]>, k: string) => {
    if (!k) return;
    const list = m.get(k) || [];
    if (!list.some((x) => x.id === l.id)) list.push(l);
    m.set(k, list);
  };
  push(idx.byPhone, phoneKey(l.phone || ""));
  push(idx.byEmail, (l.email || "").trim().toLowerCase());
  push(idx.byName, normName(l.name));
  push(idx.byName, normName(l.contactName));
}

export type MatchedBy = "key" | "leadId" | "phone" | "email" | "name";

/**
 * The existing lead this entry is about. Accounts (contractor companies) are
 * not candidates for a person's phone/email/name unless the entry itself is
 * the account; a job only matches leads under the same company (or none).
 */
export function findLead(
  idx: LeadIndex,
  f: FeedLead,
  opts: { parentLeadId?: string; claimed?: ReadonlySet<string> } = {}
): { lead: Lead; by: MatchedBy } | null {
  const ok = (l: Lead | undefined | null): l is Lead => {
    if (!l || l.private) return false;
    if (opts.claimed?.has(l.id)) return false;
    if (opts.parentLeadId) return !l.isAccount && (!l.parentLeadId || l.parentLeadId === opts.parentLeadId);
    return !l.isAccount && !l.parentLeadId;
  };
  const byKey = idx.byKey.get(jarvisExternalId(f.key));
  if (byKey && !byKey.private) return { lead: byKey, by: "key" };
  if (f.leadId) {
    const l = idx.byId.get(f.leadId);
    if (ok(l)) return { lead: l, by: "leadId" };
  }
  const one = (list: Lead[] | undefined) => {
    const c = (list || []).filter(ok);
    return c.length === 1 ? c[0] : null;
  };
  const p = phoneKey(f.phone);
  if (p) {
    const l = one(idx.byPhone.get(p));
    if (l) return { lead: l, by: "phone" };
  }
  const email = f.email.trim().toLowerCase();
  if (email) {
    const l = one(idx.byEmail.get(email));
    if (l) return { lead: l, by: "email" };
  }
  if (!p && !email) {
    const name = normName(f.job || f.contact || f.company);
    const l = name ? one(idx.byName.get(name)) : null;
    if (l) return { lead: l, by: "name" };
  }
  return null;
}

/** An existing contractor account for a company name (or one made by the feed). */
export function findAccount(idx: LeadIndex, company: string): Lead | null {
  const byKey = idx.byKey.get(jarvisAccountExternalId(company));
  if (byKey) return byKey;
  const parents = new Set<string>();
  for (const l of idx.byId.values()) if (l.parentLeadId) parents.add(l.parentLeadId);
  const name = normName(company);
  const hits = [...idx.byId.values()].filter(
    (l) => !l.private && (l.isAccount === true || parents.has(l.id)) && normName(l.name) === name
  );
  return hits.length === 1 ? hits[0] : null;
}

export function accountDoc(f: FeedLead, now: string): Omit<Lead, "id"> {
  return {
    name: f.company,
    phone: f.phone,
    email: f.email,
    address: "",
    serviceType: "",
    source: sourceFor(f.source),
    externalId: jarvisAccountExternalId(f.company),
    externalIds: [jarvisAccountExternalId(f.company)],
    stage: "contacted",
    isAccount: true,
    ...(f.contact ? { contactName: f.contact } : {}),
    notes: "",
    activity: [via("system", `Contractor account added by Jarvis (first job: ${f.job})`, now)],
    touched: false,
    createdAt: now,
    updatedAt: now,
  };
}

// ---- GET ---------------------------------------------------------------------

export interface FeedRow {
  id: string;
  key: string;
  company: string;
  contact: string;
  job: string;
  stage: string;
  owner: string;
  nextStep: string;
  nextStepDate: string;
  amount: number | null;
  updatedAt: string;
}

/** A lead as Jarvis reads it back. `parent` is the company account for a job. */
export function feedRow(lead: Lead, parent: Lead | null): FeedRow {
  const key = [lead.externalId || "", ...(lead.externalIds || [])].find((k) => k.startsWith("jarvis:")) || "";
  let company = "";
  let contact = "";
  let job = "";
  if (parent) {
    company = parent.name || "";
    contact = lead.contactName || parent.contactName || "";
    job = lead.name || "";
  } else if (lead.isAccount) {
    company = lead.name || "";
    contact = lead.contactName || "";
  } else if (lead.contactName) {
    company = lead.name || "";
    contact = lead.contactName;
  } else {
    contact = lead.name || "";
  }
  return {
    id: lead.id,
    key: key.replace(/^jarvis:/, ""),
    company,
    contact,
    job,
    stage: String(lead.stage || "new"),
    owner: lead.owner || "",
    nextStep: lead.nextAction || "",
    nextStepDate: lead.nextActionAt || "",
    amount: typeof lead.quotedAmount === "number" ? lead.quotedAmount : null,
    updatedAt: lead.updatedAt || "",
  };
}
