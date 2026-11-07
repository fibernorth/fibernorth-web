// Sales alerts: the morning list, the new-lead alert, "they just opened the
// quote", and the notes to whoever submitted a quote. Everything here is
// pure (no Firebase, no clock, no sending): it decides who gets what and
// writes the words. src/services/notifications.ts and the cron route send.

import { addDays, followUpOf, isDue, isInbound, isToSchedule, localDateOf, type Lead, type LeadActivity } from "@/lib/leads";
import { isQuoteExpiredOn } from "@/lib/proposal";
import type { QuoteRequest } from "@/lib/types";

export const SITE = "https://fibernorth.com";
/** Bill always gets the morning list and the "opened the quote" alert. */
export const BILL_EMAIL = "bill@fibernorth.com";

export const leadUrl = (id: string): string => `${SITE}/admin/leads?lead=${encodeURIComponent(id)}`;
export const quoteUrl = (id: string): string => `${SITE}/admin/quotes/${encodeURIComponent(id)}`;

/** HTML-escape (same rules as notifications.esc, kept here so this file stays standalone). */
export function h(value: unknown): string {
  return String(value ?? "")
    .slice(0, 2000)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain one-line text for a subject or a text message. */
function line(value: unknown, max = 80): string {
  return String(value ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    // \s also covers the Unicode line and paragraph separators.
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function dollars(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 });
}

/** A US phone as E.164 (+12315550100), or null when it can't be one. */
export function toE164(phone: string | null | undefined): string | null {
  const raw = String(phone || "").trim();
  const d = raw.replace(/\D/g, "");
  if (raw.startsWith("+") && d.length >= 10 && d.length <= 15) return `+${d}`;
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

/** tel: link for a phone, or "" when there's no number. */
export function telHref(phone: string | null | undefined): string {
  const e = toE164(phone);
  if (e) return `tel:${e}`;
  const d = String(phone || "").replace(/[^\d+]/g, "");
  return d.replace(/\D/g, "").length >= 7 ? `tel:${d}` : "";
}

/** "Traverse City" from "123 Main St, Traverse City, MI 49684". Blank when unclear. */
export function townOf(address: string | null | undefined): string {
  const parts = String(address || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/^(usa|us|united states)$/i.test(p));
  if (parts.length < 2) return "";
  // Drop a trailing "MI 49684" / "Michigan" / "49684".
  let i = parts.length - 1;
  if (/^([A-Za-z]{2}|michigan)(\s+\d{5}(-\d{4})?)?$/i.test(parts[i]) || /^\d{5}(-\d{4})?$/.test(parts[i])) i--;
  if (i < 0) return "";
  // A street ("123 Main St") has digits; a town doesn't.
  const town = parts[i].replace(/\s+(MI|Michigan)(\s+\d{5}(-\d{4})?)?$/i, "").trim();
  return /\d/.test(town) ? "" : town;
}

// ---- Who gets alerts ---------------------------------------------------------

export interface Rep {
  email: string;
  name: string;
  phone: string;
  /** An owner (Bill): sees "Just mine" leads too. */
  owner: boolean;
}

export interface AdminAccount {
  email: string;
  name?: string;
  phone?: string;
  disabled?: boolean;
  owner?: boolean;
}

/** Shared or system mailboxes that aren't a person working leads. */
const NOT_REPS = new Set(["admin@fibernorth.com", "webadmin@fibernorth.com", "noreply@fibernorth.com"]);

/**
 * The people who get sales alerts: every enabled admin with their own
 * fibernorth.com address, plus Bill always. One entry per address.
 */
export function pickReps(accounts: AdminAccount[]): Rep[] {
  const out = new Map<string, Rep>();
  for (const a of accounts) {
    const email = String(a.email || "").trim().toLowerCase();
    if (!/^[a-z0-9._%+-]+@fibernorth\.com$/.test(email) || NOT_REPS.has(email) || a.disabled) continue;
    const prev = out.get(email);
    out.set(email, {
      email,
      name: (prev?.name || a.name || "").trim(),
      phone: (prev?.phone || a.phone || "").trim(),
      owner: Boolean(prev?.owner || a.owner || email === BILL_EMAIL),
    });
  }
  if (!out.has(BILL_EMAIL)) out.set(BILL_EMAIL, { email: BILL_EMAIL, name: "Bill", phone: "", owner: true });
  return [...out.values()].sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * Numbers to text a new-lead alert to: each rep's own phone (from My info),
 * and the office alert number (NOTIFICATION_SMS_TO / quoteSmsTo) when a rep
 * has none or none have one. `alreadyTexted` numbers (the website form's own
 * text went there) are skipped. One text per number.
 */
export function smsTargets(reps: Rep[], fallback: string, alreadyTexted: string[] = []): string[] {
  const skip = new Set(alreadyTexted.map(toE164).filter(Boolean) as string[]);
  const out = new Set<string>();
  let missing = reps.length === 0;
  for (const r of reps) {
    const e = toE164(r.phone);
    if (e) out.add(e);
    else missing = true;
  }
  const fb = toE164(fallback);
  if (missing && fb) out.add(fb);
  return [...out].filter((n) => !skip.has(n));
}

/** Email the submitter about their quote, unless they did it themselves. */
export function submitterTo(submittedBy: string | null | undefined, actor?: string | null): string | null {
  const s = String(submittedBy || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return null;
  if (actor && s === String(actor).trim().toLowerCase()) return null;
  return s;
}

// ---- Messages ----------------------------------------------------------------

export interface Message {
  subject: string;
  html: string;
  text: string;
}

const wrap = (inner: string) =>
  `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:620px">${inner}</div>`;

function phoneHtml(phone: string): string {
  const tel = telHref(phone);
  return tel ? `<a href="${h(tel)}">${h(phone)}</a>` : h(phone || "no phone");
}

export interface NewLeadInfo {
  id: string;
  name: string;
  phone: string;
  /** What they want (service type). */
  wants?: string;
  town?: string;
  /** "Website", "Meta ads". */
  source: string;
  /** Their own words, if any (form description / sheet notes). */
  notes?: string;
}

export function newLeadAlert(l: NewLeadInfo): Message & { sms: string } {
  const name = line(l.name, 60) || "Someone";
  const wants = line(l.wants, 60);
  const town = line(l.town, 40);
  const what = [wants, town ? `in ${town}` : ""].filter(Boolean).join(" ");
  const link = leadUrl(l.id);
  const subject = line(`New lead: ${name}${what ? `, ${what}` : ""}. Call within the hour`, 200);
  const notes = line(l.notes, 300);
  const html = wrap(
    `<p><strong>New lead (${h(l.source)}). Call within the hour.</strong></p>
    <p>${h(name)}<br>${phoneHtml(l.phone)}${wants ? `<br>Wants: ${h(wants)}` : ""}${town ? `<br>Town: ${h(town)}` : ""}${notes ? `<br>Notes: ${h(notes)}` : ""}</p>
    <p><a href="${h(link)}">Open the lead</a></p>`
  );
  const text = `New lead (${l.source}). Call within the hour.\n\n${name}\n${l.phone || "no phone"}${wants ? `\nWants: ${wants}` : ""}${town ? `\nTown: ${town}` : ""}${notes ? `\nNotes: ${notes}` : ""}\n\nOpen the lead: ${link}`;
  const sms = `New lead: ${name}, ${line(l.phone, 20) || "no phone"}${what ? `, ${what}` : ""}. Call within the hour. ${link}`;
  return { subject, html, text, sms };
}

export interface OpenedQuoteInfo {
  customerName: string;
  total: number;
  phone: string;
  leadId: string;
  quoteId?: string;
  version: number;
}

export function quoteOpenedAlert(q: OpenedQuoteInfo): Message {
  const name = line(q.customerName, 60) || "A customer";
  const total = dollars(q.total);
  const subject = line(`${name} just opened their quote${total ? ` (${total})` : ""}, call now`, 200);
  const lead = q.leadId ? leadUrl(q.leadId) : "";
  const quote = q.quoteId ? quoteUrl(q.quoteId) : "";
  const html = wrap(
    `<p><strong>${h(name)} just opened their quote${total ? ` (${h(total)})` : ""}${q.version > 1 ? `, version ${q.version}` : ""}. Call now while it's in front of them.</strong></p>
    <p>${phoneHtml(q.phone)}</p>
    <p>${lead ? `<a href="${h(lead)}">Open the lead</a>` : ""}${lead && quote ? " · " : ""}${quote ? `<a href="${h(quote)}">Open the quote</a>` : ""}</p>`
  );
  const text = `${name} just opened their quote${total ? ` (${total})` : ""}. Call now.\n\n${q.phone || "no phone"}${lead ? `\nLead: ${lead}` : ""}${quote ? `\nQuote: ${quote}` : ""}`;
  return { subject, html, text };
}

export interface SubmitterNoticeInfo {
  kind: "approved" | "returned" | "accepted" | "declined";
  customerName: string;
  total?: number | null;
  quoteId?: string;
  leadId?: string;
  /** Send back: the approver's note. */
  note?: string;
  /** Decline: the customer's reason. Accept: who signed. */
  detail?: string;
  /** Approve: false when it went out as a link only (no email). */
  emailed?: boolean;
}

export function submitterNotice(n: SubmitterNoticeInfo): Message {
  const name = line(n.customerName, 60) || "the customer";
  const total = dollars(n.total ?? null);
  const amt = total ? ` (${total})` : "";
  const detail = line(n.detail, 500);
  const note = String(n.note || "").trim().slice(0, 2000);
  let subject: string;
  let body: string;
  switch (n.kind) {
    case "approved":
      subject = `Your quote for ${name} went out${amt}`;
      body =
        n.emailed === false
          ? `Your quote for ${name}${amt} was approved. It wasn't emailed: copy or text the link from the quote.`
          : `Your quote for ${name}${amt} was approved and went out. Watch for them to open it.`;
      break;
    case "returned":
      subject = `Your quote for ${name} was sent back`;
      body = `Your quote for ${name}${amt} was sent back with a note:\n\n${note || "(no note)"}\n\nFix it and submit it again.`;
      break;
    case "accepted":
      subject = `${name} accepted your quote${amt}`;
      body = `${name} accepted your quote${amt}${detail ? `, ${detail}` : ""}. Next: get it on the schedule.`;
      break;
    case "declined":
      subject = `${name} declined your quote${amt}`;
      body = `${name} declined your quote${amt}.${detail ? `\n\nTheir reason: ${detail}` : " They didn't give a reason."}`;
      break;
  }
  const links = [n.quoteId ? `Quote: ${quoteUrl(n.quoteId)}` : "", n.leadId ? `Lead: ${leadUrl(n.leadId)}` : ""].filter(Boolean);
  const html = wrap(
    `${body
      .split(/\n{2,}/)
      .map((p) => `<p>${h(p).replace(/\n/g, "<br>")}</p>`)
      .join("")}<p>${[
      n.quoteId ? `<a href="${h(quoteUrl(n.quoteId))}">Open the quote</a>` : "",
      n.leadId ? `<a href="${h(leadUrl(n.leadId))}">Open the lead</a>` : "",
    ]
      .filter(Boolean)
      .join(" · ")}</p>`
  );
  return { subject: line(subject, 200), html, text: `${body}${links.length ? `\n\n${links.join("\n")}` : ""}` };
}

// ---- Morning list ------------------------------------------------------------

export interface MorningLead {
  id: string;
  name: string;
  phone: string;
  town: string;
  action: string;
  /** YYYY-MM-DD it was due, "" for a brand-new lead with no date. */
  at: string;
  owner: string;
  private: boolean;
}

export interface MorningQuote {
  quoteId: string;
  leadId: string;
  name: string;
  phone: string;
  total: number | null;
  /** YYYY-MM-DD */
  day: string;
  private: boolean;
  /** Drafts: waiting on an approver. */
  pending?: boolean;
}

export interface MorningList {
  today: string;
  due: MorningLead[];
  opened: MorningQuote[];
  drafts: MorningQuote[];
  toSchedule: MorningLead[];
}

/** Outbound contact that counts as "called" after they opened the quote. */
const CALLED_TYPES: ReadonlyArray<LeadActivity["type"]> = ["call", "attempt", "text", "walk"];
const CLOSED_STAGES = new Set(["lost", "not_a_lead"]);
/** A draft untouched this many days or more is on the list. */
export const STALE_DRAFT_DAYS = 3;

type QuoteLike = Pick<QuoteRequest, "id" | "name" | "phone" | "createdAt"> &
  Partial<
    Pick<
      QuoteRequest,
      | "leadId"
      | "estimateStatus"
      | "viewedAt"
      | "sentAt"
      | "expiresAt"
      | "sentTotal"
      | "quotedPrice"
      | "optionClosedAt"
      | "approvalStatus"
      | "status"
      | "leadPrivate"
      | "jobDoneAt"
    >
  >;

function leadRow(l: Lead, action: string, at: string): MorningLead {
  return {
    id: l.id,
    name: l.name || "(no name)",
    phone: l.phone || "",
    town: townOf(l.address),
    action,
    at,
    owner: (l.owner || "").trim(),
    private: l.private === true,
  };
}

/**
 * What's on everyone's plate today:
 * - opened: quotes the customer opened (current version, not expired) with
 *   no call, text or walk logged on the lead since.
 * - due: the Due list (isDue), minus leads already under "opened".
 * - drafts: quotes still in draft STALE_DRAFT_DAYS or more after they came in.
 * - toSchedule: accepted work not on the jobs calendar (isToSchedule).
 */
export function buildMorningList(leads: Lead[], quotes: QuoteLike[], today: string): MorningList {
  const byId = new Map(leads.map((l) => [l.id, l]));
  const priv = (q: QuoteLike) => q.leadPrivate === true || (q.leadId ? byId.get(q.leadId)?.private === true : false);

  const opened: MorningQuote[] = [];
  for (const q of quotes) {
    if (q.estimateStatus !== "viewed" || !q.viewedAt || q.optionClosedAt) continue;
    if (isQuoteExpiredOn(q, today)) continue;
    const lead = q.leadId ? byId.get(q.leadId) : undefined;
    if (lead && (CLOSED_STAGES.has(String(lead.stage)) || lead.stage === "won")) continue;
    const viewedAt = q.viewedAt;
    const called = (lead?.activity || []).some((a) => CALLED_TYPES.includes(a.type) && !isInbound(a) && a.ts > viewedAt);
    if (called) continue;
    opened.push({
      quoteId: q.id,
      leadId: q.leadId || "",
      name: lead?.name || q.name || "(no name)",
      phone: lead?.phone || q.phone || "",
      total: q.sentTotal ?? q.quotedPrice ?? null,
      day: localDateOf(viewedAt),
      private: priv(q),
    });
  }
  opened.sort((a, b) => b.day.localeCompare(a.day));
  const openedLeads = new Set(opened.map((o) => o.leadId).filter(Boolean));

  const due: MorningLead[] = [];
  const toSchedule: MorningLead[] = [];
  for (const l of leads) {
    if (isToSchedule(l)) {
      toSchedule.push(leadRow(l, (l.nextAction || "").trim() || "Schedule the job", ""));
      continue;
    }
    if (openedLeads.has(l.id) || !isDue(l, today)) continue;
    const f = followUpOf(l, today);
    due.push(leadRow(l, f.action || "Call", f.at));
  }
  // Oldest due first; brand-new leads with no date at the top (call them first).
  due.sort((a, b) => (a.at || "0000").localeCompare(b.at || "0000") || a.name.localeCompare(b.name));
  toSchedule.sort((a, b) => a.name.localeCompare(b.name));

  const cutoff = addDays(today, -STALE_DRAFT_DAYS);
  const drafts: MorningQuote[] = [];
  for (const q of quotes) {
    if (q.estimateStatus !== "draft" || q.optionClosedAt || q.status === "closed" || q.jobDoneAt) continue;
    const day = q.createdAt ? localDateOf(q.createdAt) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > cutoff) continue;
    const lead = q.leadId ? byId.get(q.leadId) : undefined;
    if (lead && (CLOSED_STAGES.has(String(lead.stage)) || lead.jobDoneAt)) continue;
    drafts.push({
      quoteId: q.id,
      leadId: q.leadId || "",
      name: lead?.name || q.name || "(no name)",
      phone: lead?.phone || q.phone || "",
      total: q.quotedPrice ?? null,
      day,
      private: priv(q),
      pending: q.approvalStatus === "pending",
    });
  }
  // Newest first: the ones still worth finishing.
  drafts.sort((a, b) => b.day.localeCompare(a.day));

  return { today, due, opened, drafts, toSchedule };
}

/** The list as one person sees it: "Just mine" leads only for owners. */
export function listFor(list: MorningList, rep: Pick<Rep, "owner">): MorningList {
  if (rep.owner) return list;
  return {
    ...list,
    due: list.due.filter((x) => !x.private),
    opened: list.opened.filter((x) => !x.private),
    drafts: list.drafts.filter((x) => !x.private),
    toSchedule: list.toSchedule.filter((x) => !x.private),
  };
}

/** Rows shown per section; the rest are counted with a link to the app. */
export const SECTION_CAP = { due: 60, opened: 30, drafts: 15, toSchedule: 30 };

const shortDay = (ymd: string): string => {
  const m = ymd.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : ymd;
};

export function morningEmail(list: MorningList, rep: Pick<Rep, "name">): Message {
  const first = (rep.name || "").trim().split(/\s+/)[0] || "";
  const { due, opened, drafts, toSchedule, today } = list;
  const counts = [
    opened.length ? `${opened.length} opened quote${opened.length === 1 ? "" : "s"} to call` : "",
    due.length ? `${due.length} due` : "",
    drafts.length ? `${drafts.length} draft${drafts.length === 1 ? "" : "s"}` : "",
    toSchedule.length ? `${toSchedule.length} to schedule` : "",
  ].filter(Boolean);
  const subject = `Today ${shortDay(today)}: ${counts.length ? counts.join(", ") : "nothing due"}`;

  const html: string[] = [];
  const text: string[] = [];
  html.push(`<p>${first ? `Morning ${h(first)}. ` : ""}Here's what's due today.</p>`);
  html.push(`<p style="color:#666;font-size:13px">Leads aren't assigned to one person yet, so everyone gets the whole list.</p>`);
  text.push(`${first ? `Morning ${first}. ` : ""}Here's what's due today.`);
  text.push("Leads aren't assigned to one person yet, so everyone gets the whole list.");

  const section = <T,>(title: string, rows: T[], cap: number, more: string, htmlRow: (r: T) => string, textRow: (r: T) => string) => {
    if (!rows.length) return;
    html.push(`<h3 style="margin:18px 0 6px">${h(title)} (${rows.length})</h3><ul style="padding-left:18px;margin:0">`);
    text.push("", `${title} (${rows.length})`);
    for (const r of rows.slice(0, cap)) {
      html.push(`<li style="margin-bottom:6px">${htmlRow(r)}</li>`);
      text.push(`- ${textRow(r)}`);
    }
    html.push(`</ul>`);
    if (rows.length > cap) {
      html.push(`<p style="font-size:13px">And ${rows.length - cap} more. <a href="${h(more)}">See them all</a></p>`);
      text.push(`  And ${rows.length - cap} more: ${more}`);
    }
  };

  const leadLink = (id: string, name: string) => (id ? `<a href="${h(leadUrl(id))}"><strong>${h(name)}</strong></a>` : `<strong>${h(name)}</strong>`);
  const ph = (p: string) => (p ? ` · ${phoneHtml(p)}` : "");
  const tp = (p: string) => (p ? `, ${p}` : "");

  section(
    "Opened the quote, not called yet",
    opened,
    SECTION_CAP.opened,
    `${SITE}/admin/quotes`,
    (q) => `${leadLink(q.leadId, q.name)}${q.total != null ? ` ${h(dollars(q.total))}` : ""}, opened ${h(shortDay(q.day))}${ph(q.phone)} · <a href="${h(quoteUrl(q.quoteId))}">quote</a>`,
    (q) => `${q.name}${q.total != null ? ` ${dollars(q.total)}` : ""}, opened ${shortDay(q.day)}${tp(q.phone)} ${q.leadId ? leadUrl(q.leadId) : quoteUrl(q.quoteId)}`
  );
  section(
    "Due today",
    due,
    SECTION_CAP.due,
    `${SITE}/admin/leads`,
    (l) =>
      `${leadLink(l.id, l.name)}: ${h(l.action)}${l.at && l.at < today ? ` <span style="color:#b45309">(since ${h(shortDay(l.at))})</span>` : ""}${ph(l.phone)}${l.town ? ` · ${h(l.town)}` : ""}${l.owner ? ` · ${h(l.owner)}'s` : ""}`,
    (l) => `${l.name}: ${l.action}${l.at && l.at < today ? ` (since ${shortDay(l.at)})` : ""}${tp(l.phone)}${l.town ? `, ${l.town}` : ""} ${leadUrl(l.id)}`
  );
  section(
    `Drafts not sent (${STALE_DRAFT_DAYS}+ days)`,
    drafts,
    SECTION_CAP.drafts,
    `${SITE}/admin/quotes`,
    (q) => `<a href="${h(quoteUrl(q.quoteId))}"><strong>${h(q.name)}</strong></a>, came in ${h(shortDay(q.day))}${q.pending ? " · waiting for approval" : ""}${ph(q.phone)}`,
    (q) => `${q.name}, came in ${shortDay(q.day)}${q.pending ? " (waiting for approval)" : ""}${tp(q.phone)} ${quoteUrl(q.quoteId)}`
  );
  section(
    "Accepted, not scheduled",
    toSchedule,
    SECTION_CAP.toSchedule,
    `${SITE}/admin/leads`,
    (l) => `${leadLink(l.id, l.name)}: ${h(l.action)}${ph(l.phone)}${l.town ? ` · ${h(l.town)}` : ""}`,
    (l) => `${l.name}: ${l.action}${tp(l.phone)} ${leadUrl(l.id)}`
  );
  if (!counts.length) {
    html.push(`<p>Nothing due today.</p>`);
    text.push("", "Nothing due today.");
  }
  html.push(`<p style="margin-top:18px"><a href="${h(`${SITE}/admin/leads`)}">Open the leads</a></p>`);
  text.push("", `Open the leads: ${SITE}/admin/leads`);
  return { subject: line(subject, 200), html: wrap(html.join("\n")), text: text.join("\n") };
}

// ---- Cron ----------------------------------------------------------------------

/** Constant-time string compare (no early exit on the first difference). */
function sameString(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/**
 * May this request run the morning list? With CRON_SECRET set (Vercel sends
 * it as a Bearer token on its cron calls), only that. Without one, only a
 * Vercel cron call (x-vercel-cron header or the vercel-cron user agent);
 * those headers can be faked, so the route also sends at most once a day.
 */
export function cronAuthorized(
  headers: { authorization?: string | null; vercelCron?: string | null; userAgent?: string | null },
  secret: string | null | undefined
): boolean {
  const s = (secret || "").trim();
  if (s) {
    const auth = headers.authorization || "";
    return auth.startsWith("Bearer ") && sameString(auth.slice(7).trim(), s);
  }
  if (headers.vercelCron != null && headers.vercelCron !== "") return true;
  return /^vercel-cron\b/i.test(headers.userAgent || "");
}

export interface DigestStatus {
  day?: string;
  state?: "sending" | "done";
  /** ISO when this day's run claimed it. */
  claimedAt?: string;
  sentTo?: string[];
}

/** How long a "sending" claim holds before a retry may finish the job. */
export const DIGEST_LEASE_MS = 10 * 60 * 1000;

/**
 * Should this run send today's list? Once a day: a run that finished sends
 * nothing more; one that died part way may be finished by a later run (only
 * to the people it missed) once its lease is up.
 */
export function digestDecision(status: DigestStatus | undefined, today: string, nowMs: number): { send: boolean; skip: string[] } {
  if (!status || status.day !== today) return { send: true, skip: [] };
  if (status.state === "done") return { send: false, skip: [] };
  const claimed = Date.parse(status.claimedAt || "");
  if (Number.isFinite(claimed) && nowMs - claimed < DIGEST_LEASE_MS) return { send: false, skip: [] };
  return { send: true, skip: status.sentTo || [] };
}
