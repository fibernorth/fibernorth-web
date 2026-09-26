import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import type { Lead } from "@/lib/leads";
import { eventTimes } from "@/lib/calendar-event";

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

/**
 * integrationStatus/googleCalendar: the last sync result, so Admin -> Settings
 * can say "last worked at ..." or show Google's error instead of assuming a
 * stored login still works. Server-only (rules deny browser reads/writes).
 */
export interface CalendarSyncStatus {
  lastOkAt?: string;
  lastError?: string;
  lastErrorAt?: string;
}

/** Best effort: a failed status write never fails the sync itself. */
async function recordSyncStatus(result: { ok: true } | { ok: false; error: string }): Promise<void> {
  const at = new Date().toISOString();
  const patch: CalendarSyncStatus = result.ok
    ? { lastOkAt: at }
    : { lastError: result.error.slice(0, 500), lastErrorAt: at };
  try {
    await getFirestore(initializeAdminApp())
      .collection("integrationStatus")
      .doc("googleCalendar")
      .set(patch, { merge: true });
  } catch (e) {
    console.error("integrationStatus/googleCalendar write failed:", e);
  }
}

class NotConnectedError extends Error {}

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
  if (!res.ok) {
    // e.g. {"error":"invalid_grant"} when Google revoked the stored login.
    const detail = await res.text().catch(() => "");
    const code = /"error"\s*:\s*"([^"]+)"/.exec(detail)?.[1];
    throw new Error(`Google token refresh failed (${res.status})${code ? `: ${code}` : ""}`);
  }
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

  // Timed or all-day; the unused field is sent as null so a PATCH that
  // switches between the two doesn't leave both date and dateTime set.
  return { summary, description, location: lead.address || "", ...eventTimes(date, time) };
}

/**
 * Create, update, or remove the calendar event for a lead's appointment.
 * Returns the event id (or "" when removed). Throws with Google's reason when
 * anything fails (including a refused delete), and records the result in
 * integrationStatus/googleCalendar.
 */
export async function syncLeadEvent(lead: Lead): Promise<{ eventId: string; htmlLink: string }> {
  try {
    const out = await syncLeadEventInner(lead);
    await recordSyncStatus({ ok: true });
    return out;
  } catch (e) {
    // "Not connected" is already shown as such in Settings; don't log it as a Google failure.
    if (!(e instanceof NotConnectedError)) {
      await recordSyncStatus({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    throw e;
  }
}

async function syncLeadEventInner(lead: Lead): Promise<{ eventId: string; htmlLink: string }> {
  const s = await getCalendarSecret();
  if (!isCalendarConnected(s)) throw new NotConnectedError("Google Calendar is not connected (Admin -> Settings).");
  const token = await accessToken(s);
  const calendarId = encodeURIComponent(s.calendarId || "primary");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const existing = lead.calendarEventId || "";

  if (!lead.appointmentAt) {
    if (existing) {
      const res = await fetch(`${CAL_API}/calendars/${calendarId}/events/${encodeURIComponent(existing)}`, {
        method: "DELETE",
        headers,
      });
      // 404/410: already gone (deleted by hand in Google), which is the goal.
      if (!res.ok && res.status !== 404 && res.status !== 410) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Google Calendar didn't remove the event (${res.status}) ${detail.slice(0, 200)}`.trim());
      }
    }
    return { eventId: "", htmlLink: "" };
  }

  const event = eventBody(lead);
  // PATCH keeps the nulls (they clear the other kind of start/end); a new
  // event is sent without them.
  const patchBody = JSON.stringify(event);
  const insertBody = JSON.stringify(event, (_k, v) => (v === null ? undefined : v));
  let res = existing
    ? await fetch(`${CAL_API}/calendars/${calendarId}/events/${encodeURIComponent(existing)}`, {
        method: "PATCH",
        headers,
        body: patchBody,
      })
    : null;
  if (!res || res.status === 404 || res.status === 410) {
    res = await fetch(`${CAL_API}/calendars/${calendarId}/events`, { method: "POST", headers, body: insertBody });
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

export type CalendarSyncResult =
  | { ok: true; eventId: string; htmlLink: string }
  | { ok: false; error: string };

/**
 * syncLeadEventById, but reporting failure as { ok: false, error } instead of
 * throwing, for callers that must show the reason to the user.
 */
export async function trySyncLeadEventById(leadId: string): Promise<CalendarSyncResult> {
  try {
    return { ok: true, ...(await syncLeadEventById(leadId)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Calendar sync failed" };
  }
}
