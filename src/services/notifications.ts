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
  const counts: string[] = [];
  if (markerCount > 0) counts.push(`${markerCount} marker${markerCount === 1 ? "" : "s"}`);
  if (labelCount > 0) counts.push(`${labelCount} note${labelCount === 1 ? "" : "s"}`);
  // Marker counts alone (legacy annotations) aren't worth a line — only
  // summarize when there's actual v2 data.
  if (parts.length === 0 && labelCount === 0 && a.version !== 2) return "";
  if (counts.length > 0) parts.push(counts.join(", "));

  return parts.join(" · ");
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
