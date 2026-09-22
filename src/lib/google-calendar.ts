import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import type { Lead } from "@/lib/leads";

// Google Calendar for the pipeline. The admin@fibernorth.com account connects
// once (OAuth, Admin -> Settings); the refresh token lives in
// integrationSecrets/googleCalendar. Every appointment on a lead becomes an
// event on that account's primary calendar, which Bill shares with the crew.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_API = "https://www.googleapis.com/calendar/v3";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const REDIRECT_PATH = "/api/google/oauth/callback";

interface CalendarSecret {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  accountEmail?: string;
  calendarId?: string;
  pendingState?: string;
  pendingStateAt?: string;
}

export async function getCalendarSecret(): Promise<CalendarSecret> {
  const snap = await getFirestore(initializeAdminApp())
    .collection("integrationSecrets")
    .doc("googleCalendar")
    .get();
  return (snap.data() as CalendarSecret | undefined) ?? {};
}

export async function saveCalendarSecret(patch: Partial<CalendarSecret>): Promise<void> {
  await getFirestore(initializeAdminApp())
    .collection("integrationSecrets")
    .doc("googleCalendar")
    .set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
}

export function isCalendarConnected(s: CalendarSecret): boolean {
  return Boolean(s.clientId && s.clientSecret && s.refreshToken);
}

async function accessToken(s: CalendarSecret): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: s.clientId || "",
      client_secret: s.clientSecret || "",
      refresh_token: s.refreshToken || "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed (${res.status})`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Google token refresh returned no token");
  return json.access_token;
}

function eventBody(lead: Lead) {
  const date = lead.appointmentAt || "";
  const time = (lead.appointmentTime || "").trim();
  const summary = `Site walk: ${lead.name || "lead"}${lead.serviceType ? ` (${lead.serviceType})` : ""}`;
  const description = [
    lead.contactName ? `Contact: ${lead.contactName}` : "",
    lead.phone ? `Phone: ${lead.phone}` : "",
    lead.email ? `Email: ${lead.email}` : "",
    lead.notes ? `Notes: ${lead.notes}` : "",
    lead.sourceNotes ? `Lead notes: ${lead.sourceNotes}` : "",
    `Pipeline: https://fibernorth.com/admin/leads?lead=${lead.id}`,
  ]
    .filter(Boolean)
    .join("\n");

  if (time && /^\d{2}:\d{2}$/.test(time)) {
    const start = `${date}T${time}:00`;
    const [h, m] = time.split(":").map(Number);
    const endH = String((h + 1) % 24).padStart(2, "0");
    const end = `${date}T${endH}:${String(m).padStart(2, "0")}:00`;
    return {
      summary,
      description,
      location: lead.address || "",
      start: { dateTime: start, timeZone: "America/Detroit" },
      end: { dateTime: end, timeZone: "America/Detroit" },
    };
  }
  // All-day event; Google's end date is exclusive.
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return {
    summary,
    description,
    location: lead.address || "",
    start: { date },
    end: { date: d.toISOString().slice(0, 10) },
  };
}

/**
 * Create, update, or remove the calendar event for a lead's appointment.
 * Returns the event id (or "" when removed). Throws if not connected.
 */
export async function syncLeadEvent(lead: Lead): Promise<{ eventId: string; htmlLink: string }> {
  const s = await getCalendarSecret();
  if (!isCalendarConnected(s)) throw new Error("Google Calendar is not connected (Admin -> Settings).");
  const token = await accessToken(s);
  const calendarId = encodeURIComponent(s.calendarId || "primary");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const existing = lead.calendarEventId || "";

  if (!lead.appointmentAt) {
    if (existing) {
      await fetch(`${CAL_API}/calendars/${calendarId}/events/${encodeURIComponent(existing)}`, {
        method: "DELETE",
        headers,
      });
    }
    return { eventId: "", htmlLink: "" };
  }

  const body = JSON.stringify(eventBody(lead));
  let res = existing
    ? await fetch(`${CAL_API}/calendars/${calendarId}/events/${encodeURIComponent(existing)}`, {
        method: "PATCH",
        headers,
        body,
      })
    : null;
  if (!res || res.status === 404 || res.status === 410) {
    res = await fetch(`${CAL_API}/calendars/${calendarId}/events`, { method: "POST", headers, body });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google Calendar rejected the event (${res.status}) ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as { id?: string; htmlLink?: string };
  return { eventId: json.id || existing, htmlLink: json.htmlLink || "" };
}

/** Sync by lead id and store the event id back on the lead. */
export async function syncLeadEventById(leadId: string): Promise<{ eventId: string; htmlLink: string }> {
  const db = getFirestore(initializeAdminApp());
  const ref = db.collection("leads").doc(leadId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Lead not found");
  const lead = { id: snap.id, ...(snap.data() as Omit<Lead, "id">) } as Lead;
  const result = await syncLeadEvent(lead);
  await ref.update({
    calendarEventId: result.eventId,
    calendarEventUrl: result.htmlLink,
    updatedAt: new Date().toISOString(),
  });
  return result;
}
