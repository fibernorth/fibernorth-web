// Lead email replies, read from bill@fibernorth.com's Gmail. Pure helpers (no
// Firebase, no clock): parsing the From header, the search query, matching a
// sender to leads, the history line and the lead fields a reply sets. The
// Gmail calls and writes are in src/services/gmail-replies.ts.

import { CLOSED_STAGES, type Lead, type LeadActivity, type LeadStage, DUE_STAGES } from "@/lib/leads";

/** Read-only mail access, plus who signed in. */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly openid email";

/** The inbox the lead emails' replies land in. */
export const GMAIL_ACCOUNT_HINT = "bill@fibernorth.com";

/**
 * OAuth state values for the Gmail sign-in start with this, so the shared
 * Google callback (/api/google/oauth/callback, also used by the calendar)
 * knows which connection it is finishing.
 */
export const GMAIL_STATE_PREFIX = "gmail.";

export function isGmailState(state: string): boolean {
  return state.startsWith(GMAIL_STATE_PREFIX);
}

/** Don't check more often than this, however many tabs ask. */
export const SYNC_MIN_GAP_MS = 2 * 60_000;
/** "Check now" in Settings may run sooner, but never on top of a run that just started. */
export const SYNC_FORCE_GAP_MS = 15_000;
/** Each search reaches back this far before the last check, for mail that arrives late. */
export const OVERLAP_SECONDS = 5 * 60;
/** First check ever: the last three days. */
export const FIRST_RUN_SECONDS = 3 * 86_400;
export const PAGE_SIZE = 100;
export const MAX_PAGES = 3;

/** Next action a reply puts on an open lead. */
export const REPLY_NEXT_ACTION = "Reply to their email";

/** Our own domain: never a lead replying (a forward, a teammate). */
const OWN_DOMAIN = "fibernorth.com";

const EMAIL_RE = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/**
 * The address in a From header, lowercased: `"Jane Doe" <Jane@x.com>`,
 * `jane@x.com`, `<jane@x.com>`. The <...> part wins over an address-looking
 * display name. "" when there is none.
 */
export function parseFromEmail(header: string | null | undefined): string {
  const h = String(header || "");
  const angle = /<([^<>]+)>\s*$/.exec(h) || /<([^<>]+)>/.exec(h);
  const inside = angle ? EMAIL_RE.exec(angle[1]) : null;
  const m = inside || EMAIL_RE.exec(h);
  return m ? m[0].toLowerCase() : "";
}

/** Every address on a lead (the email field can hold "a@x.com, b@y.com"). */
export function leadEmails(email: string | null | undefined): string[] {
  return String(email || "")
    .split(/[\s,;]+/)
    .map((e) => parseFromEmail(e))
    .filter(Boolean);
}

/** Unix seconds the search starts from: the last check minus the overlap, or three days back. */
export function searchSince(lastCheckedEpoch: number | null | undefined, nowMs: number): number {
  const now = Math.floor(nowMs / 1000);
  const last = Number(lastCheckedEpoch || 0);
  if (last > 0 && last <= now) return Math.max(0, last - OVERLAP_SECONDS);
  return now - FIRST_RUN_SECONDS;
}

/** Gmail search: new mail in the inbox that Bill didn't send, since the last check. */
export function gmailQuery(lastCheckedEpoch: number | null | undefined, nowMs: number): string {
  return `in:inbox -from:me after:${searchSince(lastCheckedEpoch, nowMs)}`;
}

/** May this run start? Not within the gap of the last start (that also keeps two runs apart). */
export function shouldRun(lastRunStartedAt: string | null | undefined, nowMs: number, force = false): boolean {
  const t = lastRunStartedAt ? new Date(lastRunStartedAt).getTime() : NaN;
  if (!Number.isFinite(t)) return true;
  return nowMs - t >= (force ? SYNC_FORCE_GAP_MS : SYNC_MIN_GAP_MS);
}

export type LeadForMatch = Pick<Lead, "id" | "email" | "stage"> & Partial<Pick<Lead, "isAccount" | "updatedAt" | "name">>;

/** Lowercase address -> the leads that have it. */
export function buildEmailIndex<T extends LeadForMatch>(leads: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const l of leads) {
    for (const e of new Set(leadEmails(l.email))) {
      if (e.endsWith(`@${OWN_DOMAIN}`)) continue;
      const list = out.get(e);
      if (list) list.push(l);
      else out.set(e, [l]);
    }
  }
  return out;
}

/**
 * Which of the leads sharing a sender's address get the reply: every one that
 * is still being worked (open or long term, not a contractor account),
 * else the most recently updated one (a won job, a closed lead, the account
 * itself), so the reply is always logged somewhere and never on a pile of old
 * jobs at once.
 */
export function pickTargets<T extends LeadForMatch>(matches: T[]): T[] {
  if (matches.length <= 1) return matches;
  const working = matches.filter((l) => DUE_STAGES.includes(l.stage as LeadStage) && !l.isAccount);
  if (working.length) return working;
  return [[...matches].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0]];
}

/** Leads a sender's message belongs on ([] for a stranger or ourselves). */
export function leadsForSender<T extends LeadForMatch>(index: Map<string, T[]>, from: string): T[] {
  const e = parseFromEmail(from);
  if (!e || e.endsWith(`@${OWN_DOMAIN}`)) return [];
  return pickTargets(index.get(e) || []);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Gmail snippets come HTML-escaped ("I&#39;m"). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[code.toLowerCase()] ?? all;
  });
}

export const SNIPPET_MAX = 200;

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).replace(/\s+\S*$/, "") || t.slice(0, max - 1)}…`;
}

/** The history line's text: Replied by email: "<subject>" <snippet>. */
export function replyActivityText(subject: string | null | undefined, snippet: string | null | undefined): string {
  const subj = clip(decodeEntities(String(subject || "")), 150) || "(no subject)";
  const body = clip(decodeEntities(String(snippet || "")), SNIPPET_MAX);
  return `Replied by email: "${subj}"${body ? ` ${body}` : ""}`;
}

/** When the message arrived (ISO): Gmail's internalDate, else the Date header, else now. */
export function messageTs(internalDate: string | number | null | undefined, dateHeader: string | null | undefined, nowIso: string): string {
  const ms = Number(internalDate);
  if (Number.isFinite(ms) && ms > 0) return new Date(ms).toISOString();
  const d = new Date(String(dateHeader || ""));
  return isNaN(d.getTime()) ? nowIso : d.toISOString();
}

/** The history line for one reply. */
export function replyActivity(msg: { subject?: string; snippet?: string; ts: string }): LeadActivity {
  return {
    ts: msg.ts,
    type: "email",
    dir: "in",
    via: "gmail",
    text: replyActivityText(msg.subject, msg.snippet),
  };
}

/**
 * Lead fields a reply sets besides the history line (stage and contact date
 * come from the usual save rules): an open or long-term lead gets "Reply to
 * their email" for today. Closed ones (won, lost, not a lead) are only logged:
 * a won job's next action belongs to the job.
 */
export function replyPatch(fresh: Pick<Lead, "stage">, today: string): Partial<Lead> {
  if (CLOSED_STAGES.includes(fresh.stage as LeadStage)) return {};
  return { nextAction: REPLY_NEXT_ACTION, nextActionAt: today };
}

/** Gmail's message id is hex; anything else is refused before it becomes a doc id. */
export function isGmailId(id: unknown): id is string {
  return typeof id === "string" && /^[0-9a-zA-Z_-]{1,64}$/.test(id);
}
