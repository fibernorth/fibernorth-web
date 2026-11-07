"use client";

// What Add to calendar does to a lead, shared by the Leads page and the
// Quotes page so a walk or a job booked from either one is recorded on the
// lead the same way.

import { jobFromCalendarPatch, walkBookingPatch, type Lead, type LeadActivity } from "@/lib/leads";

type SaveResult = "ok" | "queued" | "error";
/** Saves a patch (and a history line) on this lead. */
export type LeadPatchSave = (patch: Partial<Lead>, activity?: LeadActivity) => Promise<SaveResult>;

/**
 * Site walk: book it on the lead (walk date, stage "Walk scheduled",
 * "Draw the quote" after it), then put it on the calendar like a walk
 * saved from Edit. Returns the message to show.
 */
export async function bookWalkOnLead(
  lead: Pick<Lead, "id" | "stage"> & Partial<Pick<Lead, "appointmentAt" | "appointmentTime">>,
  date: string,
  time: string,
  save: LeadPatchSave,
  getIdToken: () => Promise<string | null | undefined>
): Promise<string> {
  const patch = {
    ...walkBookingPatch(lead, date, time),
    base: { appointmentAt: lead.appointmentAt || "", appointmentTime: lead.appointmentTime || "" },
  } as unknown as Partial<Lead>;
  const r = await save(patch, {
    ts: new Date().toISOString(),
    type: "walk_booked",
    text: `Walk scheduled for ${date}${time ? ` at ${time}` : ""}`,
  });
  if (r === "queued") return "No signal. Saved on this phone; the calendar updates when it sends.";
  if (r !== "ok") return "Couldn't save the walk. Try again.";
  try {
    const token = await getIdToken();
    const res = await fetch("/api/admin/leads/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ leadId: lead.id }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return res.ok && json.ok !== false ? "Walk booked and on the calendar." : json.error || "Walk saved, but the calendar sync failed.";
  } catch {
    return "Walk saved, but the calendar sync failed.";
  }
}

/**
 * Job on FiberNorth Jobs: record the job date and event on the lead (as
 * "Schedule the job" does), so it leaves "To schedule" and a later
 * Schedule the job moves this event instead of adding another.
 */
export async function recordJobOnLead(
  lead: Pick<Lead, "stage"> & Partial<Pick<Lead, "jobScheduledAt" | "jobDoneAt">>,
  job: { date: string; endDate: string; time: string },
  ev: { id: string; htmlLink?: string },
  save: LeadPatchSave
): Promise<string> {
  const patch = jobFromCalendarPatch(lead, job, ev);
  if (!patch) return "";
  const r = await save(patch);
  if (r === "queued") return "No signal: the job date is saved on this phone and goes on the lead when it sends.";
  if (r !== "ok") return "It's on the calendar, but the lead didn't save the job date. Use Schedule the job → Change to fix it.";
  return "Job date saved on the lead.";
}
