// User-submitted fields are interpolated into notification emails — escape
// them so a crafted quote/application can't inject HTML or links.
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .slice(0, 2000);
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

  const subject = `New Quote Request from ${esc(data.name).slice(0, 80)} - ${esc(data.serviceType) || "General"}`;
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

  const subject = `New Job Application from ${esc(data.name).slice(0, 80)} - ${esc(data.positionsInterested.join(", ")) || "General"}`;
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
    value ? `*${label}:* ${value.slice(0, 300)}\n` : "";
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
    (data.attachmentUrl ? `*Attached plan:* ${data.attachmentUrl}\n` : "") +
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
// the estimator to copy or text the link instead.
export async function sendProposalEmail(data: {
  to: string;
  customerName: string;
  url: string;
  total: number;
  version: number;
  message: string;
  expiresAt: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Email isn't set up on the server (RESEND_API_KEY). Copy or text the link instead.");
  const first = (data.customerName || "").trim().split(/\s+/)[0] || "there";
  const total = data.total.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const until = new Date(data.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
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
      from: "Bill Gaylord, FiberNorth <noreply@fibernorth.com>",
      reply_to: "bill@fibernorth.net",
      to: [data.to],
      subject: `Your quote from FiberNorth Underground${data.version > 1 ? ` (revised)` : ""}`,
      html,
      text,
    }),
  });
  if (!res.ok) throw new Error(`Email was rejected (${res.status}). Copy or text the link instead.`);
}

/** Internal ping when a customer views, accepts, or declines a proposal. */
export async function sendProposalEventNotice(data: {
  event: "viewed" | "accepted" | "declined";
  customerName: string;
  total: number;
  version: number;
  leadId: string;
  detail?: string;
}) {
  const total = data.total.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const verb = data.event === "accepted" ? "ACCEPTED" : data.event === "declined" ? "declined" : "opened";
  const line = `${data.customerName || "A customer"} ${verb} quote v${data.version} (${total})${data.detail ? `: ${data.detail}` : ""}`;
  const link = `https://fibernorth.com/admin/leads?lead=${data.leadId}`;

  const webhook = process.env.SLACK_QUOTE_WEBHOOK_URL || (await getAdminSetting("quoteSlackWebhook"));
  if (webhook && webhook.startsWith("https://hooks.slack.com/")) {
    const icon = data.event === "accepted" ? ":white_check_mark:" : data.event === "declined" ? ":x:" : ":eyes:";
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `${icon} ${line}\n<${link}|Open lead>` }),
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
      subject: `Quote ${verb}: ${esc(data.customerName).slice(0, 80)} ${total}`,
      html: `<p>${esc(line)}</p><p><a href="${link}">Open the lead</a></p>`,
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
    value ? `*${label}:* ${value.slice(0, 300)}\n` : "";
  const text =
    `:telephone_receiver: *New lead (${data.source})*\n` +
    line("Name", data.name) +
    line("Phone", data.phone) +
    line("Wants", data.serviceType) +
    line("Notes", data.notes) +
    `<https://fibernorth.com/admin/leads?lead=${data.id}|Open in pipeline>`;

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
