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

// NOTIFICATION_EMAIL_TO accepts a comma-separated list and overrides the default recipients
function getNotificationRecipients(defaults: string[]): string[] {
  const env = process.env.NOTIFICATION_EMAIL_TO;
  if (!env) return defaults;
  return env
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

export async function sendQuoteNotificationEmail(data: {
  name: string;
  phone: string;
  email: string;
  address: string;
  serviceType: string;
  description: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = getNotificationRecipients([
    "bill@fibernorth.net",
    "office@fibernorth.com",
  ]);

  if (!apiKey) {
    console.warn("RESEND_API_KEY not set, skipping email notification");
    return;
  }

  const subject = `New Quote Request from ${esc(data.name).slice(0, 80)} - ${esc(data.serviceType) || "General"}`;
  const html = `
    <h2>New Quote Request</h2>
    <p><strong>Name:</strong> ${esc(data.name)}</p>
    <p><strong>Phone:</strong> ${esc(data.phone)}</p>
    <p><strong>Email:</strong> ${esc(data.email)}</p>
    <p><strong>Address:</strong> ${esc(data.address)}</p>
    <p><strong>Service:</strong> ${esc(data.serviceType) || "Not specified"}</p>
    <p><strong>Description:</strong> ${esc(data.description) || "None"}</p>
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
  const to = getNotificationRecipients(["office@fibernorth.com"]);

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

export async function sendQuoteSMS(data: { name: string; phone: string; serviceType: string }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const to = process.env.NOTIFICATION_SMS_TO;

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
