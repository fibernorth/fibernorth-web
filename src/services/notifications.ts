import { randomUUID } from "crypto";
import { goodThroughText, money, proposalSubject, QUOTE_TIME_ZONE } from "@/lib/proposal";
import { fingerprint } from "@/lib/proposal-consent";
import { COMPANY } from "@/lib/constants";
import { postToSlack, recordNotice, sendViaResend, SKIPPED, type ChannelResult } from "@/services/notice-delivery";

// User-submitted fields are interpolated into notification emails — escape
// them so a crafted quote/application can't inject HTML or links.
// Truncates BEFORE escaping so a cut can never leave half an entity.
export function esc(value: unknown): string {
  return String(value ?? "")
    .slice(0, 2000)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Email subjects are plain text (Resend sets the header), so they must NOT
// be HTML-escaped (O'Brien would arrive as O&#39;Brien). Control characters,
// CR/LF included, are collapsed so user text can't add header lines.
export function subjectText(value: unknown, max = 80): string {
  return String(value ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// Slack mrkdwn control characters. Escaping &, < and > stops user text from
// forming links (<https://evil|Open in admin panel>), @channel/@here
// mentions (<!channel>) or user pings. See Slack "Escaping text".
export function slackEsc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Build a one-line plain-text summary of a v2 map annotation for the email
// and Slack notifications, e.g.
//   "Drawn run: ~240 ft · Service: water · Pipe: not sure · 2 markers, 1 note"
// Defensive against unknown shapes (the value comes through as unknown), and
// returns "" for legacy/absent annotations with no v2 data. Plain text only —
// callers escape it before it lands in HTML.
function summarizeMapAnnotation(annotation: unknown): string {
  if (typeof annotation !== "object" || annotation === null) return "";
  const a = annotation as Record<string, unknown>;

  const parts: string[] = [];

  if (typeof a.runFeet === "number" && Number.isFinite(a.runFeet) && a.runFeet > 0) {
    parts.push(`Drawn run: ~${Math.round(a.runFeet)} ft`);
  }
  const cleanChoice = (v: unknown): string =>
    typeof v === "string" ? v.trim().slice(0, 100).replace(/-/g, " ") : "";
  const service = cleanChoice(a.service);
  if (service) parts.push(`Service: ${service}`);
  const pipeSize = cleanChoice(a.pipeSize);
  if (pipeSize) parts.push(`Pipe: ${pipeSize}`);

  const markerCount = Array.isArray(a.markers) ? a.markers.length : 0;
  const labelCount = Array.isArray(a.labels) ? a.labels.length : 0;
  const existingCount = Array.isArray(a.paths)
    ? a.paths.filter(
        (p) =>
          typeof p === "object" &&
          p !== null &&
          typeof (p as Record<string, unknown>).type === "string" &&
          ((p as Record<string, unknown>).type as string).startsWith("existing")
      ).length
    : 0;
  const counts: string[] = [];
  if (existingCount > 0)
    counts.push(`${existingCount} existing line${existingCount === 1 ? "" : "s"} marked`);
  if (markerCount > 0) counts.push(`${markerCount} marker${markerCount === 1 ? "" : "s"}`);
  if (labelCount > 0) counts.push(`${labelCount} note${labelCount === 1 ? "" : "s"}`);
  // Marker counts alone (legacy annotations) aren't worth a line — only
  // summarize when there's actual v2 data.
  if (parts.length === 0 && labelCount === 0 && a.version !== 2) return "";
  if (counts.length > 0) parts.push(counts.join(", "));

  return parts.join(" · ");
}

// Customer-language soil values from the quote form → readable labels.
const SOIL_LABELS: Record<string, string> = {
  sand: "Sand",
  "sand-gravel": "Sand with gravel and stones",
  loam: "Topsoil / regular dirt",
  clay: "Clay",
  cobble: "Lots of rocks or boulders",
  hardpan: "Really hard digging (hardpan)",
  muck: "Wet, swampy, or muck",
  mixed: "Changes across the property",
};
function soilLabel(value: string | undefined): string {
  if (!value) return "";
  return SOIL_LABELS[value] ?? value.replace(/-/g, " ");
}

// Recipient resolution order: NOTIFICATION_EMAIL_TO env override, then the
// admin panel's Settings (siteSettings/general quoteEmailTo), then defaults.
function splitEmails(value: string): string[] {
  return value
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

async function getAdminSetting(field: string): Promise<string> {
  try {
    const { initializeAdminApp } = await import("@/services/firebase-admin");
    const { getFirestore } = await import("firebase-admin/firestore");
    const snap = await getFirestore(initializeAdminApp())
      .collection("siteSettings")
      .doc("general")
      .get();
    const value = snap.get(field);
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

export async function getNotificationRecipients(defaults: string[]): Promise<string[]> {
  const env = process.env.NOTIFICATION_EMAIL_TO;
  if (env) return splitEmails(env);
  const fromSettings = await getAdminSetting("quoteEmailTo");
  if (fromSettings) return splitEmails(fromSettings);
  return defaults;
}

export async function sendQuoteNotificationEmail(data: {
  name: string;
  phone: string;
  email: string;
  address: string;
  serviceType: string;
  description: string;
  attachmentUrl?: string;
  mapAnnotation?: unknown;
  soilType?: string;
  /** Sent to Resend as the Idempotency-Key (the quote id). */
  idempotencyKey?: string;
}): Promise<ChannelResult> {
  const to = await getNotificationRecipients([
    "bill@fibernorth.net",
    "office@fibernorth.com",
  ]);

  const subject = `New Quote Request from ${subjectText(data.name)} - ${subjectText(data.serviceType) || "General"}`;
  const mapSummary = summarizeMapAnnotation(data.mapAnnotation);
  const html = `
    <h2>New Quote Request</h2>
    <p><strong>Name:</strong> ${esc(data.name)}</p>
    <p><strong>Phone:</strong> ${esc(data.phone)}</p>
    <p><strong>Email:</strong> ${esc(data.email)}</p>
    <p><strong>Address:</strong> ${esc(data.address)}</p>
    <p><strong>Service:</strong> ${esc(data.serviceType) || "Not specified"}</p>
    <p><strong>Description:</strong> ${esc(data.description) || "None"}</p>
    ${soilLabel(data.soilType) ? `<p><strong>Ground:</strong> ${esc(soilLabel(data.soilType))}</p>` : ""}
    ${mapSummary ? `<p><strong>Property map:</strong> ${esc(mapSummary)}</p>` : ""}
    ${data.attachmentUrl ? `<p><strong>Attached plan:</strong> <a href="${esc(data.attachmentUrl)}">View upload</a></p>` : ""}
    <hr />
    <p><a href="https://fibernorth.com/admin/quotes">View in Admin Panel</a></p>
  `;

  // Checked and retried (src/services/notice-delivery.ts); the caller
  // records the result on the lead and quote.
  return sendViaResend(
    { from: "FiberNorth Underground <noreply@fibernorth.com>", to, subject, html },
    data.idempotencyKey || randomUUID()
  );
}

export async function sendApplicationNotificationEmail(data: {
  name: string;
  phone: string;
  email: string;
  positionsInterested: string[];
  /** Sent to Resend as the Idempotency-Key (the application id). */
  idempotencyKey?: string;
}): Promise<ChannelResult> {
  const to = await getNotificationRecipients(["office@fibernorth.com"]);

  const subject = `New Job Application from ${subjectText(data.name)} - ${subjectText(data.positionsInterested.join(", "), 120) || "General"}`;
  const html = `
    <h2>New Job Application</h2>
    <p><strong>Name:</strong> ${esc(data.name)}</p>
    <p><strong>Phone:</strong> ${esc(data.phone)}</p>
    <p><strong>Email:</strong> ${esc(data.email)}</p>
    <p><strong>Positions:</strong> ${esc(data.positionsInterested.join(", ")) || "Not specified"}</p>
    <hr />
    <p><a href="https://fibernorth.com/admin/applications">View in Admin Panel</a></p>
  `;

  return sendViaResend(
    { from: "FiberNorth Underground <noreply@fibernorth.com>", to, subject, html },
    data.idempotencyKey || randomUUID()
  );
}

// Slack incoming-webhook notification. Configure via SLACK_QUOTE_WEBHOOK_URL
// env var or the admin panel setting quoteSlackWebhook. Missing config is a
// silent skip, same as email/SMS.
export async function sendQuoteSlack(data: {
  name: string;
  phone: string;
  email: string;
  address: string;
  serviceType: string;
  description: string;
  urgency: string;
  attachmentUrl?: string;
  mapAnnotation?: unknown;
  soilType?: string;
}): Promise<ChannelResult> {
  const webhook = await slackWebhook();
  if (!webhook) {
    console.warn("Slack webhook not configured, skipping Slack notification");
    return SKIPPED;
  }

  const line = (label: string, value: string) =>
    value ? `*${label}:* ${slackEsc(value.slice(0, 300))}\n` : "";
  const text =
    `:hammer_and_wrench: *New quote request*\n` +
    line("Name", data.name) +
    line("Phone", data.phone) +
    line("Email", data.email) +
    line("Address", data.address) +
    line("Service", data.serviceType || "Not specified") +
    line("Timeline", data.urgency) +
    line("Details", data.description) +
    line("Ground", soilLabel(data.soilType)) +
    line("Property map", summarizeMapAnnotation(data.mapAnnotation)) +
    (data.attachmentUrl ? `*Attached plan:* ${slackEsc(data.attachmentUrl)}\n` : "") +
    `<https://fibernorth.com/admin/quotes|Open in admin panel>`;

  return postToSlack(webhook, text);
}

/** The Slack webhook (env, then Settings), or "" when none is set up. */
async function slackWebhook(): Promise<string> {
  const webhook = process.env.SLACK_QUOTE_WEBHOOK_URL || (await getAdminSetting("quoteSlackWebhook"));
  return webhook && webhook.startsWith("https://hooks.slack.com/") ? webhook : "";
}

// Customer-facing proposal email. Throws on failure so the caller can tell
// the estimator to copy or text the link instead. Bill is BCC'd on every one
// (the same addresses the accept/decline notices go to), so he has his own
// copy of exactly what the customer got. Returns Resend's message id so the
// send can be looked up later.
export async function sendProposalEmail(data: {
  to: string;
  customerName: string;
  address?: string;
  url: string;
  total: number;
  version: number;
  message: string;
  expiresAt: string;
  /** The admin who clicked Send; always gets a copy in the inbox they log in with. */
  senderEmail?: string;
}): Promise<{ id: string; bcc: string[] }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Email isn't set up on the server (RESEND_API_KEY). Copy or text the link instead.");
  const copyTo = [
    ...(data.senderEmail ? [data.senderEmail] : []),
    ...(await getNotificationRecipients(["bill@fibernorth.com"])),
  ].map((a) => a.trim().toLowerCase());
  const bcc = [...new Set(copyTo)].filter((a) => a.includes("@") && a !== data.to.toLowerCase());
  const first = (data.customerName || "").trim().split(/\s+/)[0] || "there";
  const total = data.total.toLocaleString("en-US", { style: "currency", currency: "USD" });
  // The last valid day in Detroit, the same date the customer's page shows.
  const until = goodThroughText({ expiresAt: data.expiresAt });
  const note = (data.message || "").trim();
  const html = `
    <div style="font-family:Georgia,serif;font-size:16px;line-height:1.5;color:#222;max-width:560px">
      <p>Hi ${esc(first)},</p>
      ${note ? `<p>${esc(note).replace(/\n/g, "<br>")}</p>` : `<p>Here is your quote from FiberNorth Underground. The map shows exactly where we plan to drill.</p>`}
      <p><strong>Total: ${esc(total)}</strong>${data.version > 1 ? ` (revised, version ${data.version})` : ""}</p>
      <p><a href="${esc(data.url)}" style="display:inline-block;background:#E8672A;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold">View and approve your quote</a></p>
      <p style="font-size:14px;color:#555">Good through ${esc(until)}. Questions, call or text me at (231) 944-6471.</p>
      <p>Bill Gaylord<br>FiberNorth Underground<br>Williamsburg, Michigan</p>
    </div>`;
  const text = `Hi ${first},\n\n${note || "Here is your quote from FiberNorth Underground."}\n\nTotal: ${total}\nView and approve: ${data.url}\n\nGood through ${until}. Questions, call or text (231) 944-6471.\n\nBill Gaylord\nFiberNorth Underground`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      // A real person's address lands in the inbox more often than noreply@.
      // fibernorth.com is DKIM-signed through Resend, so this passes DMARC.
      from: "Bill Gaylord, FiberNorth <bill@fibernorth.com>",
      reply_to: "bill@fibernorth.com",
      to: [data.to],
      ...(bcc.length ? { bcc } : {}),
      subject: subjectText(
        proposalSubject({ version: data.version, address: data.address, name: data.customerName, total: data.total }),
        200
      ),
      html,
      text,
    }),
  });
  if (!res.ok) {
    let why = "";
    try {
      const j = (await res.json()) as { message?: string };
      why = j.message ? `: ${j.message}` : "";
    } catch {
      /* no body */
    }
    throw new Error(`Email was rejected (${res.status}${why}). Copy or text the link instead.`);
  }
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return { id: json.id || "", bcc };
}

/**
 * A plain one-off email to a lead (check-ins from the lead card). From Bill,
 * replies to Bill, and the person who clicked Send gets a copy.
 */
export async function sendLeadEmail(data: {
  to: string;
  subject: string;
  body: string;
  senderEmail?: string;
}): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Email isn't set up on the server (RESEND_API_KEY).");
  const bcc = [...new Set([...(data.senderEmail ? [data.senderEmail] : []), "bill@fibernorth.com"].map((a) => a.toLowerCase()))].filter(
    (a) => a !== data.to.toLowerCase()
  );
  const html = `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.5;color:#222;max-width:560px">${data.body
    .split(/\n{2,}/)
    .map((para) => `<p>${esc(para).replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Bill Gaylord, FiberNorth <bill@fibernorth.com>",
      reply_to: "bill@fibernorth.com",
      to: [data.to],
      ...(bcc.length ? { bcc } : {}),
      subject: subjectText(data.subject, 200),
      text: data.body,
      html,
    }),
  });
  if (!res.ok) {
    let why = "";
    try {
      const j = (await res.json()) as { message?: string };
      why = j.message ? `: ${j.message}` : "";
    } catch {
      /* no body */
    }
    throw new Error(`Email was rejected (${res.status}${why}).`);
  }
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return { id: json.id || "" };
}

/** Firebase password-reset link for an admin account, sent to that account's own email. */
export async function sendPasswordResetEmail(data: { to: string; link: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Email isn't set up on the server (RESEND_API_KEY).");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "FiberNorth Underground <noreply@fibernorth.com>",
      to: [data.to],
      subject: "Reset your FiberNorth admin password",
      text: `Someone asked to reset the password for your FiberNorth admin account (${data.to}).\n\nSet a new password here:\n${data.link}\n\nIf you didn't expect this, ignore this email; your password stays the same.`,
      html: `<p>Someone asked to reset the password for your FiberNorth admin account (${esc(data.to)}).</p><p><a href="${esc(data.link)}">Set a new password</a></p><p>If you didn't expect this, ignore this email; your password stays the same.</p>`,
    }),
  });
  if (!res.ok) throw new Error(`Reset email was rejected (${res.status}).`);
}

/**
 * Internal ping when a customer views, accepts, or declines a proposal.
 * Slack for all three, email for accept and decline. Each is checked and
 * retried (3 tries), the email carries an Idempotency-Key (the event id), and
 * the outcome is kept in notices/{eventId}. A failure adds "Couldn't notify
 * the office: …" to the lead's history and shows on the dashboard.
 */
export async function sendProposalEventNotice(data: {
  event: "viewed" | "accepted" | "declined";
  customerName: string;
  total: number;
  version: number;
  leadId: string;
  detail?: string;
  /** The acceptance/decline record's id (proposals/{token}/events/{id}); also the notice id. */
  eventId?: string;
  proposalToken?: string;
}): Promise<{ ok: boolean; error: string }> {
  const eventId = data.eventId || `${data.event}-${randomUUID()}`;
  const total = money(data.total);
  const verb = data.event === "accepted" ? "ACCEPTED" : data.event === "declined" ? "declined" : "opened";
  const line = `${data.customerName || "A customer"} ${verb} quote v${data.version} (${total})${data.detail ? `: ${data.detail}` : ""}`;
  const link = `https://fibernorth.com/admin/leads?lead=${encodeURIComponent(data.leadId)}`;

  const icon = data.event === "accepted" ? ":white_check_mark:" : data.event === "declined" ? ":x:" : ":eyes:";
  const slack = await postToSlack(await slackWebhook(), `${icon} ${slackEsc(line)}\n<${link}|Open lead>`);

  let email: ChannelResult = SKIPPED;
  if (data.event !== "viewed") {
    const to = await getNotificationRecipients(["bill@fibernorth.net", "office@fibernorth.com"]);
    email = await sendViaResend(
      {
        from: "FiberNorth Underground <noreply@fibernorth.com>",
        to,
        subject: subjectText(`Quote ${verb}: ${data.customerName} ${total}`, 200),
        html: `<p>${esc(line)}</p><p><a href="${esc(link)}">Open the lead</a></p>`,
      },
      eventId
    );
  }

  return recordNotice({
    id: eventId,
    kind: data.event,
    summary: line,
    proposal: data.proposalToken,
    lead: data.leadId,
    email,
    slack,
  });
}

// "October 26, 2026 at 3:05 PM" in Detroit time.
function detroitDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: QUOTE_TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// The same steps the quote page lists under "What happens next".
const WHAT_NEXT = [
  "Bill calls you to set a date.",
  "We call in MISS DIG to mark the public lines, which takes about three working days. Show us any private lines you know about, like sprinklers or a line to the barn, and we locate those too.",
  "Most jobs are one day on site. If yours will take longer, we'll tell you when we set the date.",
  "We backfill the pits, bring them back to grade with topsoil and seed, and clean up before we leave.",
];

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/**
 * The customer's own copy of their acceptance: what they approved, when, and
 * a link back to the quote. From Bill; Bill (and whoever sent the quote)
 * get a BCC, as with the quote email. Recorded as notices/{eventId}-customer.
 */
export async function sendAcceptanceConfirmation(data: {
  eventId: string;
  proposalToken: string;
  leadId: string;
  to: string;
  customerName: string;
  acceptedName: string;
  acceptedAt: string;
  version: number;
  total: number;
  address?: string;
  url: string;
  contentHash: string;
  /** Who sent the quote; gets a copy like the quote email. */
  senderEmail?: string;
}): Promise<{ ok: boolean; error: string }> {
  const noticeId = `${data.eventId}-customer`;
  const to = (data.to || "").trim().toLowerCase();
  const total = money(data.total);
  const failureLine = (e: string) => `Couldn't email the customer a copy of their acceptance: ${e}`;
  const base = {
    id: noticeId,
    kind: "customer-copy" as const,
    summary: `Acceptance copy to ${to || "the customer"} (quote v${data.version}, ${total})`,
    proposal: data.proposalToken,
    lead: data.leadId,
    failureLine,
  };
  if (!EMAIL_RE.test(to)) {
    return recordNotice({ ...base, email: { ok: false, attempts: 0, error: "no usable email address on the quote" } });
  }
  const copyTo = [
    ...(data.senderEmail && data.senderEmail.includes("@") ? [data.senderEmail] : []),
    ...(await getNotificationRecipients(["bill@fibernorth.com"])),
  ].map((a) => a.trim().toLowerCase());
  const bcc = [...new Set(copyTo)].filter((a) => a.includes("@") && a !== to);
  const first = (data.customerName || "").trim().split(/\s+/)[0] || "there";
  const print = fingerprint(data.contentHash);

  const rows: Array<[string, string]> = [
    ["Quote", `version ${data.version}`],
    ["Total", total],
    ...(data.address ? ([["Job address", data.address]] as Array<[string, string]>) : []),
    ["Accepted by", data.acceptedName],
    ["Accepted on", `${detroitDateTime(data.acceptedAt)} (Michigan time)`],
    ...(print ? ([["Quote fingerprint", print]] as Array<[string, string]>) : []),
  ];
  const html = `
    <div style="font-family:Georgia,serif;font-size:16px;line-height:1.5;color:#222;max-width:560px">
      <p>Hi ${esc(first)},</p>
      <p>Thank you. This is your copy of the quote you approved.</p>
      <table style="border-collapse:collapse;font-size:15px">
        ${rows.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#555">${esc(k)}</td><td style="padding:2px 0"><strong>${esc(v)}</strong></td></tr>`).join("")}
      </table>
      <p><a href="${esc(data.url)}">Open your quote</a> to see the full details or print a copy.</p>
      <p><strong>What happens next</strong></p>
      <ol>${WHAT_NEXT.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      <p>Questions, call or text me at (231) 944-6471.</p>
      <p>Bill Gaylord<br>FiberNorth Underground<br>Williamsburg, Michigan</p>
    </div>`;
  const text =
    `Hi ${first},\n\nThank you. This is your copy of the quote you approved.\n\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
    `\n\nOpen your quote: ${data.url}\n\nWhat happens next\n` +
    WHAT_NEXT.map((s, i) => `${i + 1}. ${s}`).join("\n") +
    `\n\nQuestions, call or text (231) 944-6471.\n\nBill Gaylord\nFiberNorth Underground`;

  const email = await sendViaResend(
    {
      from: "Bill Gaylord, FiberNorth <bill@fibernorth.com>",
      reply_to: "bill@fibernorth.com",
      to: [to],
      ...(bcc.length ? { bcc } : {}),
      subject: subjectText(`Your approved FiberNorth quote: ${total}${data.address ? `, ${data.address}` : ""}`, 200),
      html,
      text,
    },
    noticeId
  );
  return recordNotice({ ...base, email });
}

/**
 * Short "we got it" email to someone who used the website quote form or the
 * job application. Plain, in Bill's voice, no promises beyond a call back.
 */
export async function sendSubmissionConfirmation(data: {
  kind: "quote" | "application";
  to: string;
  name: string;
  idempotencyKey: string;
}): Promise<ChannelResult> {
  const first = (data.name || "").trim().split(/\s+/)[0] || "there";
  const sign = "Bill Gaylord\nFiberNorth Underground\nWilliamsburg, Michigan";
  const body =
    data.kind === "quote"
      ? [`Hi ${first},`, "Got your request. Bill will call you within one business day.", `If you need us sooner, call ${COMPANY.phone}.`, sign]
      : [
          `Hi ${first},`,
          "Got your application. Thanks for your interest in FiberNorth Underground. We will reach out if there is a fit.",
          `Questions, call ${COMPANY.phone}.`,
          sign,
        ];
  const html = `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.5;color:#222;max-width:560px">${body
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;
  return sendViaResend(
    {
      from: "Bill Gaylord, FiberNorth <bill@fibernorth.com>",
      reply_to: "bill@fibernorth.com",
      to: [data.to],
      subject: data.kind === "quote" ? "We got your quote request" : "We got your application",
      text: body.join("\n\n"),
      html,
    },
    data.idempotencyKey
  );
}

// Pipeline lead ping (Meta ads sheet, letter campaigns, etc). Same webhook as
// quotes so everything lands in one channel.
export async function sendLeadSlack(data: {
  id: string;
  name: string;
  phone: string;
  serviceType?: string;
  source: string;
  notes?: string;
}) {
  const webhook =
    process.env.SLACK_QUOTE_WEBHOOK_URL || (await getAdminSetting("quoteSlackWebhook"));
  if (!webhook || !webhook.startsWith("https://hooks.slack.com/")) return;

  const line = (label: string, value?: string) =>
    value ? `*${label}:* ${slackEsc(value.slice(0, 300))}\n` : "";
  const text =
    `:telephone_receiver: *New lead (${slackEsc(data.source)})*\n` +
    line("Name", data.name) +
    line("Phone", data.phone) +
    line("Wants", data.serviceType) +
    line("Notes", data.notes) +
    `<https://fibernorth.com/admin/leads?lead=${encodeURIComponent(data.id)}|Open in pipeline>`;

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error("Failed to send lead Slack notification:", err);
  }
}

export async function sendQuoteSMS(data: { name: string; phone: string; serviceType: string }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const to = process.env.NOTIFICATION_SMS_TO || (await getAdminSetting("quoteSmsTo"));

  if (!accountSid || !authToken || !from || !to) {
    console.warn("Twilio not configured, skipping SMS notification");
    return;
  }

  const body = `New quote from ${String(data.name).slice(0, 60)} for ${String(data.serviceType || "underground work").slice(0, 60)}. Call: ${String(data.phone).slice(0, 20)}. Check admin panel.`;

  try {
    await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      }
    );
  } catch (err) {
    console.error("Failed to send SMS:", err);
  }
}
