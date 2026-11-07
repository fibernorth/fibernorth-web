import { OFFICE_PHONE } from "@/lib/bill-phone";
import { goodThroughText, proposalSubject } from "@/lib/proposal";
import {
  BILL_EMAIL,
  listFor,
  morningEmail,
  newLeadAlert,
  pickReps,
  quoteOpenedAlert,
  smsTargets,
  submitterNotice,
  submitterTo,
  type AdminAccount,
  type MorningList,
  type NewLeadInfo,
  type OpenedQuoteInfo,
  type Rep,
  type SubmitterNoticeInfo,
} from "@/lib/sales-alerts";

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

async function getNotificationRecipients(defaults: string[]): Promise<string[]> {
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
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = await getNotificationRecipients([
    "bill@fibernorth.net",
    "office@fibernorth.com",
  ]);

  if (!apiKey) {
    console.warn("RESEND_API_KEY not set, skipping email notification");
    return;
  }

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

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "FiberNorth Underground <noreply@fibernorth.com>",
        to,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error("Resend rejected email:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Failed to send email:", err);
  }
}

export async function sendApplicationNotificationEmail(data: {
  name: string;
  phone: string;
  email: string;
  positionsInterested: string[];
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = await getNotificationRecipients(["office@fibernorth.com"]);

  if (!apiKey) {
    console.warn("RESEND_API_KEY not set, skipping email notification");
    return;
  }

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

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "FiberNorth Underground <noreply@fibernorth.com>",
        to,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error("Resend rejected email:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Failed to send email:", err);
  }
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
}) {
  const webhook =
    process.env.SLACK_QUOTE_WEBHOOK_URL || (await getAdminSetting("quoteSlackWebhook"));
  if (!webhook || !webhook.startsWith("https://hooks.slack.com/")) {
    if (!webhook) console.warn("Slack webhook not configured, skipping Slack notification");
    return;
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

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.error("Slack webhook rejected message:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Failed to send Slack notification:", err);
  }
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
  /** Bill's number for this customer (billPhoneFor). */
  phone?: string;
  /** "Option B: 2 in conduit" when the quote is one of several options. */
  optionLabel?: string;
  /** The sender's name and phone from their profile (Admin -> My info). */
  senderName?: string;
  senderPhone?: string;
}): Promise<{ id: string; bcc: string[] }> {
  // From the person who made the quote when they have their own
  // fibernorth.com address (an approved quote goes out from whoever
  // submitted it, not the approver), signed with their name and phone.
  // Otherwise from Bill, as before.
  const sender = leadEmailSender(data.senderEmail, data.senderName);
  const own = sender.reply_to !== "bill@fibernorth.com";
  const signName = own ? (data.senderName || "").trim() || sender.reply_to.split("@")[0] : "Bill Gaylord";
  const phone = (own && (data.senderPhone || "").trim()) || data.phone || OFFICE_PHONE;
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
  const option = (data.optionLabel || "").trim();
  const html = `
    <div style="font-family:Georgia,serif;font-size:16px;line-height:1.5;color:#222;max-width:560px">
      <p>Hi ${esc(first)},</p>
      ${note ? `<p>${esc(note).replace(/\n/g, "<br>")}</p>` : `<p>Here is your quote from FiberNorth Underground. The map shows exactly where we plan to drill.</p>`}
      ${option ? `<p><strong>${esc(option)}</strong></p>` : ""}
      <p><strong>Total: ${esc(total)}</strong>${data.version > 1 ? ` (revised, version ${data.version})` : ""}</p>
      <p><a href="${esc(data.url)}" style="display:inline-block;background:#E8672A;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold">View and approve your quote</a></p>
      <p style="font-size:14px;color:#555">Good through ${esc(until)}. Questions, call or text me at ${esc(phone)}.</p>
      <p>${esc(signName)}<br>FiberNorth Underground<br>Williamsburg, Michigan</p>
    </div>`;
  const text = `Hi ${first},\n\n${note || "Here is your quote from FiberNorth Underground."}\n\n${option ? `${option}\n` : ""}Total: ${total}\nView and approve: ${data.url}\n\nGood through ${until}. Questions, call or text ${phone}.\n\n${signName}\nFiberNorth Underground`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      // A real person's address lands in the inbox more often than noreply@.
      // fibernorth.com is DKIM-signed through Resend, so this passes DMARC.
      from: sender.from,
      reply_to: sender.reply_to,
      to: [data.to],
      ...(bcc.length ? { bcc } : {}),
      subject: subjectText(
        proposalSubject({
          version: data.version,
          address: data.address,
          name: data.customerName,
          total: data.total,
          option: data.optionLabel,
        }),
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

/** From and reply-to for a lead email: the sender's own fibernorth.com address, or Bill's. */
export function leadEmailSender(senderEmail?: string, senderName?: string): { from: string; reply_to: string } {
  const email = (senderEmail || "").trim().toLowerCase();
  const name = (senderName || "").replace(/[<>",\r\n]/g, "").trim();
  const shared = ["bill@fibernorth.com", "admin@fibernorth.com", "webadmin@fibernorth.com"];
  if (/^[a-z0-9._%+-]+@fibernorth\.com$/.test(email) && !shared.includes(email)) {
    return { from: `${name || email.split("@")[0]}, FiberNorth <${email}>`, reply_to: email };
  }
  return { from: "Bill Gaylord, FiberNorth <bill@fibernorth.com>", reply_to: "bill@fibernorth.com" };
}

/**
 * A plain one-off email to a lead (check-ins from the lead card). From the
 * person who clicked Send when they have their own fibernorth.com address
 * (replies go back to them), else from Bill. Bill and the sender always get
 * a copy.
 */
export async function sendLeadEmail(data: {
  to: string;
  subject: string;
  body: string;
  senderEmail?: string;
  /** The sender's name from their profile (Admin -> My info). */
  senderName?: string;
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
      ...leadEmailSender(data.senderEmail, data.senderName),
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

/** Internal ping when a customer views, accepts, or declines a proposal. */
export async function sendProposalEventNotice(data: {
  event: "viewed" | "accepted" | "declined";
  customerName: string;
  total: number;
  version: number;
  leadId: string;
  detail?: string;
  /** The quote: on accept/decline its submitter (a salesperson) is told too. */
  quoteId?: string;
}) {
  // The salesperson who submitted the quote hears how it went. Their own
  // try/catch: never in the way of the notices below.
  if (data.event !== "viewed" && data.quoteId) {
    await notifySubmitterOfAnswer({ ...data, event: data.event, quoteId: data.quoteId }).catch((e) =>
      console.error("Submitter notice failed:", e)
    );
  }
  const total = data.total.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const verb = data.event === "accepted" ? "ACCEPTED" : data.event === "declined" ? "declined" : "opened";
  const line = `${data.customerName || "A customer"} ${verb} quote v${data.version} (${total})${data.detail ? `: ${data.detail}` : ""}`;
  const link = `https://fibernorth.com/admin/leads?lead=${encodeURIComponent(data.leadId)}`;

  const webhook = process.env.SLACK_QUOTE_WEBHOOK_URL || (await getAdminSetting("quoteSlackWebhook"));
  if (webhook && webhook.startsWith("https://hooks.slack.com/")) {
    const icon = data.event === "accepted" ? ":white_check_mark:" : data.event === "declined" ? ":x:" : ":eyes:";
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `${icon} ${slackEsc(line)}\n<${link}|Open lead>` }),
    }).catch(() => {});
  }

  if (data.event === "viewed") return;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const to = await getNotificationRecipients(["bill@fibernorth.net", "office@fibernorth.com"]);
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "FiberNorth Underground <noreply@fibernorth.com>",
      to,
      subject: `Quote ${verb}: ${subjectText(data.customerName)} ${total}`,
      html: `<p>${esc(line)}</p><p><a href="${esc(link)}">Open the lead</a></p>`,
    }),
  }).catch(() => {});
}

/**
 * A sales account's quote is waiting in the approval queue: a short line to
 * the quotes Slack channel and an email to each approver, with a link.
 */
export async function sendApprovalRequestNotice(data: {
  customerName: string;
  total: number;
  quoteId: string;
  submittedBy: string;
  reason: string;
  approvers: string[];
}): Promise<void> {
  const total = data.total.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const line = `Quote waiting for approval: ${data.customerName || "a customer"}, ${total}`;
  const detail = `From ${data.submittedBy}${data.reason ? ` (${data.reason})` : ""}`;
  const link = `https://fibernorth.com/admin/quotes/${encodeURIComponent(data.quoteId)}`;

  const webhook = process.env.SLACK_QUOTE_WEBHOOK_URL || (await getAdminSetting("quoteSlackWebhook"));
  if (webhook && webhook.startsWith("https://hooks.slack.com/")) {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `:hourglass: ${slackEsc(line)}\n${slackEsc(detail)}\n<${link}|Open the quote>` }),
    }).catch(() => {});
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = [...new Set(data.approvers.map((a) => a.trim().toLowerCase()))].filter((a) => a.includes("@"));
  if (!apiKey || !to.length) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "FiberNorth Underground <noreply@fibernorth.com>",
      to,
      subject: subjectText(line, 200),
      html: `<p>${esc(line)}</p><p>${esc(detail)}</p><p><a href="${esc(link)}">Open the quote</a> to approve and send it, or send it back with a note.</p>`,
      text: `${line}\n${detail}\n\nOpen the quote: ${link}`,
    }),
  }).catch(() => {});
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

// ---- Sales alerts (src/lib/sales-alerts.ts writes the words) -----------------

/** One email through Resend. False when email isn't set up or Resend refused. */
async function sendResendEmail(to: string[], msg: { subject: string; html: string; text: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const list = [...new Set(to.map((a) => a.trim().toLowerCase()))].filter((a) => a.includes("@"));
  if (!apiKey || !list.length) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "FiberNorth Underground <noreply@fibernorth.com>",
        to: list,
        subject: subjectText(msg.subject, 200),
        html: msg.html,
        text: msg.text,
      }),
    });
    if (!res.ok) {
      console.error("Resend rejected email:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("Failed to send email:", err);
    return false;
  }
}

/** Twilio is set up (account, token and a from number). */
function twilioConfig(): { sid: string; token: string; from: string } | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  return sid && token && from ? { sid, token, from } : null;
}

async function sendSms(to: string, body: string): Promise<void> {
  const tw = twilioConfig();
  if (!tw) return;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${tw.sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${tw.sid}:${tw.token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: tw.from, Body: body.slice(0, 600) }),
    });
    if (!res.ok) console.error("Twilio rejected SMS:", res.status, await res.text().catch(() => ""));
  } catch (err) {
    console.error("Failed to send SMS:", err);
  }
}

/**
 * Everyone who gets sales alerts: enabled admin accounts with their own
 * fibernorth.com address, with the name and phone from their My info
 * profile (adminUsers/{uid}), plus Bill always.
 */
export async function loadReps(): Promise<Rep[]> {
  const { initializeAdminApp } = await import("@/services/firebase-admin");
  const { getFirestore } = await import("firebase-admin/firestore");
  const { getAuth } = await import("firebase-admin/auth");
  const { ADMIN_EMAILS, ADMIN_UIDS } = await import("@/lib/admin-allowlist");
  const app = initializeAdminApp();
  const profiles = new Map<string, Record<string, unknown>>();
  try {
    const snap = await getFirestore(app).collection("adminUsers").get();
    snap.forEach((d) => profiles.set(d.id, d.data()));
  } catch (e) {
    console.error("adminUsers read failed:", e);
  }
  const accounts: AdminAccount[] = [];
  try {
    let pageToken: string | undefined;
    do {
      const page = await getAuth(app).listUsers(1000, pageToken);
      for (const u of page.users) {
        const email = (u.email || "").toLowerCase();
        const builtIn = ADMIN_UIDS.has(u.uid) || ADMIN_EMAILS.has(email);
        if (!builtIn && u.customClaims?.admin !== true) continue;
        const p = profiles.get(u.uid) || {};
        accounts.push({
          email,
          name: typeof p.name === "string" ? p.name : u.displayName || "",
          phone: typeof p.phone === "string" ? p.phone : "",
          disabled: u.disabled,
          owner: builtIn,
        });
      }
      pageToken = page.pageToken;
    } while (pageToken);
  } catch (e) {
    // Auth unreachable: fall back to the profiles alone (they carry email).
    console.error("Listing admin users failed:", e);
    for (const p of profiles.values()) {
      if (typeof p.email === "string") {
        accounts.push({ email: p.email, name: String(p.name || ""), phone: String(p.phone || "") });
      }
    }
  }
  return pickReps(accounts);
}

/**
 * New lead (Meta ads sheet or the website form): email each rep and, when
 * Twilio is set up, text them, so someone calls within the hour. Never
 * throws. `officeTexted`: the website form's own text already went to the
 * office alert number, so it isn't texted twice.
 */
export async function sendNewLeadAlert(
  lead: NewLeadInfo,
  opts: { privateLead?: boolean; officeTexted?: boolean } = {}
): Promise<void> {
  try {
    let reps = await loadReps();
    // A "Just mine" lead: owners only.
    if (opts.privateLead) reps = reps.filter((r) => r.owner);
    const msg = newLeadAlert(lead);
    const jobs: Array<Promise<unknown>> = reps.map((r) => sendResendEmail([r.email], msg));
    if (twilioConfig()) {
      const fallback = process.env.NOTIFICATION_SMS_TO || (await getAdminSetting("quoteSmsTo"));
      const targets = smsTargets(reps, fallback, opts.officeTexted ? [fallback] : []);
      for (const n of targets) jobs.push(sendSms(n, msg.sms));
    }
    await Promise.allSettled(jobs);
  } catch (e) {
    console.error("New lead alert failed:", e);
  }
}

/**
 * The customer just opened their quote (first view of the version sent):
 * email whoever submitted or sent it, and Bill. Never throws.
 */
export async function sendQuoteOpenedAlert(info: OpenedQuoteInfo, people: Array<string | null | undefined>): Promise<void> {
  try {
    const to = [...people, BILL_EMAIL].filter((a): a is string => typeof a === "string" && a.includes("@"));
    await sendResendEmail(to, quoteOpenedAlert(info));
  } catch (e) {
    console.error("Quote opened alert failed:", e);
  }
}

/** Tell the person who submitted a quote what happened to it. Never throws. */
export async function sendSubmitterNotice(to: string | null, info: SubmitterNoticeInfo): Promise<void> {
  if (!to) return;
  try {
    await sendResendEmail([to], submitterNotice(info));
  } catch (e) {
    console.error("Submitter notice failed:", e);
  }
}

/** Accept/decline: the quote's submitter, when they don't already get the office notice. */
async function notifySubmitterOfAnswer(data: {
  event: "accepted" | "declined";
  customerName: string;
  total: number;
  leadId: string;
  detail?: string;
  quoteId: string;
}): Promise<void> {
  const { initializeAdminApp } = await import("@/services/firebase-admin");
  const { getFirestore } = await import("firebase-admin/firestore");
  const snap = await getFirestore(initializeAdminApp()).collection("quoteRequests").doc(data.quoteId).get();
  const to = submitterTo(snap.get("submittedBy"));
  if (!to) return;
  const office = (await getNotificationRecipients(["bill@fibernorth.net", "office@fibernorth.com"])).map((a) => a.toLowerCase());
  if (office.includes(to)) return;
  await sendSubmitterNotice(to, {
    kind: data.event,
    customerName: data.customerName,
    total: data.total,
    quoteId: data.quoteId,
    leadId: data.leadId,
    detail: data.detail,
  });
}

/**
 * The morning list (src/app/api/cron/morning): one email per rep with
 * what's due today. Returns who it went to. Skips addresses in `skip`
 * (already sent by an earlier run today).
 */
export async function sendMorningLists(
  list: MorningList,
  reps: Rep[],
  skip: string[] = [],
  onSent?: (email: string) => Promise<void>
): Promise<{ sent: string[]; failed: string[] }> {
  const sent: string[] = [];
  const failed: string[] = [];
  for (const rep of reps) {
    if (skip.includes(rep.email)) continue;
    const ok = await sendResendEmail([rep.email], morningEmail(listFor(list, rep), rep));
    if (ok) {
      sent.push(rep.email);
      if (onSent) await onSent(rep.email).catch(() => {});
    } else failed.push(rep.email);
  }
  return { sent, failed };
}
