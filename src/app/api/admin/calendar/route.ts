import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyApiAuth } from "@/lib/api-auth";
import {
  createJobEvent,
  getCalendarSecret,
  isCalendarConnected,
  listCalendars,
  listEvents,
  pickJobsCalendar,
  saveCalendarSecret,
  type CalendarInfo,
} from "@/lib/google-calendar";
import { writeAudit } from "@/services/audit";

// Admin -> Calendar: the crew's jobs calendar on admin@fibernorth.com
// (e.g. "FiberNorth Jobs"), plus site walks from the primary calendar.
// Reads and adds go through the stored Google login (Admin -> Settings).

export const dynamic = "force-dynamic";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function msg(e: unknown): string {
  return e instanceof Error ? e.message : "Calendar request failed";
}

export async function GET(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response!;
  const url = new URL(request.url);
  const from = day.safeParse(url.searchParams.get("from"));
  const to = day.safeParse(url.searchParams.get("to"));
  if (!from.success || !to.success || to.data <= from.data) {
    return NextResponse.json({ error: "from and to must be YYYY-MM-DD" }, { status: 400 });
  }
  const s = await getCalendarSecret();
  if (!isCalendarConnected(s)) {
    return NextResponse.json({ connected: false, owner: Boolean(auth.owner) });
  }

  let calendars: CalendarInfo[] = [];
  let listError = "";
  try {
    calendars = await listCalendars();
  } catch (e) {
    listError = msg(e);
  }
  let jobs = pickJobsCalendar(calendars, s.jobsCalendarId);
  if (!jobs && s.jobsCalendarId) {
    jobs = { id: s.jobsCalendarId, name: s.jobsCalendarName || "Jobs", primary: false, color: "", canWrite: true };
  }
  // Remember an automatic match so it sticks even without the list permission.
  if (jobs && jobs.id !== s.jobsCalendarId) {
    await saveCalendarSecret({ jobsCalendarId: jobs.id, jobsCalendarName: jobs.name });
  }

  const includeWalks = url.searchParams.get("walks") !== "0";
  try {
    const [jobEvents, walkEvents] = await Promise.all([
      jobs ? listEvents(jobs.id, from.data, to.data) : Promise.resolve([]),
      includeWalks ? listEvents(s.calendarId || "primary", from.data, to.data) : Promise.resolve([]),
    ]);
    return NextResponse.json({
      connected: true,
      owner: Boolean(auth.owner),
      account: s.accountEmail || "",
      jobs: jobs ? { id: jobs.id, name: jobs.name, color: jobs.color } : null,
      calendars: calendars.map((c) => ({ id: c.id, name: c.name, primary: c.primary })),
      listError,
      events: jobEvents.map((e) => ({ ...e, kind: "job" })).concat(walkEvents.map((e) => ({ ...e, kind: "walk" }))),
    });
  } catch (e) {
    return NextResponse.json(
      { connected: true, owner: Boolean(auth.owner), jobs, calendars, listError, events: [], error: msg(e) },
      { status: 502 }
    );
  }
}

const createSchema = z.object({
  action: z.literal("create"),
  job: z.object({
    title: z.string().trim().min(1).max(200),
    date: day,
    endDate: day.optional().or(z.literal("")),
    time: z.string().regex(/^(\d{2}:\d{2})?$/).optional(),
    location: z.string().trim().max(400).optional(),
    notes: z.string().trim().max(4000).optional(),
  }),
  /** Move this event instead of adding a new one (rescheduling a lead's job). */
  eventId: z.string().max(300).optional(),
  leadId: z.string().max(200).optional(),
});
const pickSchema = z.object({ action: z.literal("setCalendar"), id: z.string().min(3).max(300), name: z.string().max(200).optional() });

export async function POST(request: Request) {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth.response!;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const actor = { uid: auth.uid || "", email: auth.email || "" };

  const pick = pickSchema.safeParse(body);
  if (pick.success) {
    if (!auth.owner) return NextResponse.json({ error: "Only an owner can change the jobs calendar." }, { status: 403 });
    const before = await getCalendarSecret();
    await saveCalendarSecret({ jobsCalendarId: pick.data.id, jobsCalendarName: pick.data.name || "" });
    await writeAudit({
      actor,
      action: "calendar.setJobs",
      target: { col: "integrationSecrets", id: "googleCalendar" },
      before: { jobsCalendarId: before.jobsCalendarId || null },
      after: { jobsCalendarId: pick.data.id },
    });
    return NextResponse.json({ ok: true });
  }

  const create = createSchema.safeParse(body);
  if (!create.success) return NextResponse.json({ error: "Check the job's title and date." }, { status: 400 });
  const job = create.data.job;
  if (job.endDate && job.endDate < job.date) {
    return NextResponse.json({ error: "The last day is before the first day." }, { status: 400 });
  }
  const s = await getCalendarSecret();
  if (!s.jobsCalendarId) return NextResponse.json({ error: "Pick the jobs calendar first." }, { status: 409 });
  try {
    const ev = await createJobEvent(s.jobsCalendarId, { ...job, endDate: job.endDate || undefined }, create.data.eventId);
    await writeAudit({
      actor,
      action: "calendar.addJob",
      target: create.data.leadId ? { col: "leads", id: create.data.leadId } : { col: "calendar", id: ev.id },
      before: null,
      after: { title: job.title, date: job.date, endDate: job.endDate || null, time: job.time || null, location: job.location || null },
    });
    return NextResponse.json({ ok: true, ...ev });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 502 });
  }
}
