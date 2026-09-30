"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Loader2, Plus } from "lucide-react";
import { useAuth } from "@/context/auth-provider";
import { useToday } from "@/hooks/use-today";
import { cn } from "@/lib/utils";
import { AddToCalendar } from "@/components/admin/add-to-calendar";

// The crew's jobs calendar on admin@fibernorth.com ("FiberNorth Jobs"), with
// site walks from the primary calendar. Data comes from /api/admin/calendar.

interface Ev {
  id: string;
  calendarId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  description: string;
  htmlLink: string;
  kind: "job" | "walk";
}

interface Data {
  connected: boolean;
  owner: boolean;
  account?: string;
  jobs?: { id: string; name: string; color: string } | null;
  calendars?: Array<{ id: string; name: string; primary: boolean }>;
  listError?: string;
  events?: Ev[];
  error?: string;
}

const inputCls =
  "w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dow = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** Detroit calendar day of a Google date or date-time. */
function localDay(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return new Date(s).toLocaleDateString("en-CA", { timeZone: "America/Detroit" });
}
function timeOf(s: string): string {
  return new Date(s).toLocaleTimeString("en-US", { timeZone: "America/Detroit", hour: "numeric", minute: "2-digit" });
}
/** Every day an event covers (all-day end dates are exclusive). */
function daysOf(e: Ev): string[] {
  const first = localDay(e.start);
  let last = e.allDay ? addDays(e.end || first, -1) : localDay(e.end || e.start);
  if (last < first) last = first;
  const out: string[] = [];
  for (let d = first; d <= last && out.length < 62; d = addDays(d, 1)) out.push(d);
  return out;
}
function monthLabel(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export default function AdminCalendarPage() {
  const { getIdToken } = useAuth();
  const today = useToday();
  // Default: this week and next. Month is one tap away and remembered.
  const [view, setViewState] = useState<"2w" | "month">("2w");
  useEffect(() => {
    try {
      if (localStorage.getItem("fn.calendarView") === "month") setViewState("month");
    } catch {
      // storage blocked: stay on 2 weeks
    }
  }, []);
  const setView = (v: "2w" | "month") => {
    setViewState(v);
    try {
      localStorage.setItem("fn.calendarView", v);
    } catch {
      // private window: fine
    }
  };
  const thisWeek = addDays(today, -dow(today));
  const [weekStart, setWeekStart] = useState(thisWeek);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [showWalks, setShowWalks] = useState(true);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Tapping a day (or Add) opens the add form on that day.
  const [openOn, setOpenOn] = useState("");
  const [notice, setNotice] = useState("");
  const [pickId, setPickId] = useState("");
  const [picking, setPicking] = useState(false);

  // Two weeks from the chosen Sunday, or whole weeks covering the month.
  const grid = useMemo(() => {
    if (view === "2w") {
      const days = Array.from({ length: 14 }, (_, i) => addDays(weekStart, i));
      return { days, from: weekStart, to: addDays(weekStart, 14) };
    }
    const first = `${month}-01`;
    const start = addDays(first, -dow(first));
    const nextMonth = addDays(`${month}-28`, 7).slice(0, 7);
    const lastOfMonth = addDays(`${nextMonth}-01`, -1);
    const end = addDays(lastOfMonth, 6 - dow(lastOfMonth));
    const days: string[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
    return { days, from: start, to: addDays(end, 1) };
  }, [month, view, weekStart]);
  const inRange = (d: string) => (view === "2w" ? true : d.startsWith(month));
  const rangeLabel =
    view === "2w"
      ? `${dayLabel(grid.days[0]).replace(/^\w+, /, "")} – ${dayLabel(grid.days[13]).replace(/^\w+, /, "")}`
      : monthLabel(month);
  const atToday = view === "2w" ? weekStart === thisWeek : month === today.slice(0, 7);
  const step = (dir: 1 | -1) => {
    if (view === "2w") setWeekStart(addDays(weekStart, 7 * dir));
    else setMonth(dir === 1 ? addDays(`${month}-28`, 7).slice(0, 7) : addDays(`${month}-01`, -1).slice(0, 7));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch(`/api/admin/calendar?from=${grid.from}&to=${grid.to}&walks=${showWalks ? 1 : 0}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as Data;
      setData(json);
      if (!res.ok) setError(json.error || `Couldn't load the calendar (${res.status})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the calendar");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, grid.from, grid.to, showWalks]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, Ev[]>();
    for (const e of data?.events || []) {
      for (const d of daysOf(e)) {
        const list = map.get(d) || [];
        list.push(e);
        map.set(d, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
    }
    return map;
  }, [data]);

  const agendaDays = grid.days.filter((d) => inRange(d) && (byDay.get(d)?.length || 0) > 0);

  const post = async (body: unknown) => {
    const token = await getIdToken();
    const res = await fetch("/api/admin/calendar", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
    return json;
  };

  const saveCalendar = async () => {
    const id = pickId.trim();
    if (!id) return;
    setPicking(true);
    try {
      const name = data?.calendars?.find((c) => c.id === id)?.name || "";
      await post({ action: "setCalendar", id, name });
      setPickId("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the calendar");
    } finally {
      setPicking(false);
    }
  };

  const Chip = ({ e }: { e: Ev }) => (
    <a
      href={e.htmlLink || undefined}
      target="_blank"
      rel="noopener noreferrer"
      title={[e.title, e.location, e.description].filter(Boolean).join("\n")}
      className={cn(
        "block truncate rounded px-1.5 py-0.5 text-xs leading-snug",
        e.kind === "job" ? "bg-primary/15 text-foreground" : "bg-secondary/15 text-foreground"
      )}
    >
      {!e.allDay && <span className="text-muted-foreground mr-1">{timeOf(e.start)}</span>}
      {e.title}
    </a>
  );

  const needsPick = data?.connected && !data.jobs;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Calendar</h1>
            <p className="text-sm text-muted-foreground">
              {data?.jobs ? `${data.jobs.name}` : "Jobs calendar"}
              {data?.account ? ` on ${data.account}` : ""}
              {showWalks ? ", plus site walks" : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={showWalks} onChange={(e) => setShowWalks(e.target.checked)} />
            Site walks
          </label>
          {data?.connected && (
            <button
              onClick={() => setOpenOn(today)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          )}
        </div>
      </div>

      {data && !data.connected && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm">
          Google Calendar isn&apos;t connected.{" "}
          <Link href="/admin/settings" className="text-primary underline">
            Connect it in Settings
          </Link>{" "}
          and sign in as admin@fibernorth.com.
        </div>
      )}

      {needsPick && (
        <div className="rounded-lg border border-secondary/50 bg-secondary/10 p-4 text-sm space-y-3">
          <p className="font-medium">Which calendar holds the jobs?</p>
          {data?.listError ? (
            <p className="text-muted-foreground">
              {data.listError} Or paste the calendar ID (Google Calendar → the calendar&apos;s settings → Integrate calendar → Calendar ID).
            </p>
          ) : (
            <p className="text-muted-foreground">No calendar named like &quot;FiberNorth Jobs&quot; was found. Pick it below.</p>
          )}
          {data?.owner ? (
            <div className="flex flex-wrap gap-2">
              {data.calendars && data.calendars.length > 0 ? (
                <select id="jobs-cal" value={pickId} onChange={(e) => setPickId(e.target.value)} className={cn(inputCls, "max-w-sm")}>
                  <option value="">Choose a calendar…</option>
                  {data.calendars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.primary ? " (main)" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="jobs-cal-id"
                  value={pickId}
                  onChange={(e) => setPickId(e.target.value)}
                  placeholder="…@group.calendar.google.com"
                  className={cn(inputCls, "max-w-sm")}
                />
              )}
              <button
                onClick={() => void saveCalendar()}
                disabled={!pickId.trim() || picking}
                className="rounded-md bg-primary px-3 py-2 font-semibold text-primary-foreground disabled:opacity-50"
              >
                {picking ? "Saving…" : "Use this calendar"}
              </button>
            </div>
          ) : (
            <p className="text-muted-foreground">An owner account has to pick it.</p>
          )}
        </div>
      )}

      {data?.connected && (
        <AddToCalendar
          today={today}
          openOn={openOn}
          hideButton
          onClose={() => setOpenOn("")}
          onAdded={() => {
            setOpenOn("");
            void load();
          }}
        />
      )}

      {notice && <p className="text-sm text-accent">{notice}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-between">
        <button
          aria-label={view === "2w" ? "Previous week" : "Previous month"}
          onClick={() => step(-1)}
          className="rounded-md border border-border p-2"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{rangeLabel}</h2>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {!atToday && (
            <button
              onClick={() => {
                setWeekStart(thisWeek);
                setMonth(today.slice(0, 7));
              }}
              className="text-sm text-primary underline"
            >
              Today
            </button>
          )}
          <div className="flex rounded-md border border-border overflow-hidden text-xs">
            {(
              [
                ["2w", "2 weeks"],
                ["month", "Month"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={cn("px-2.5 py-1", view === k ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          aria-label={view === "2w" ? "Next week" : "Next month"}
          onClick={() => step(1)}
          className="rounded-md border border-border p-2"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-primary/30" /> Jobs
        </span>
        {showWalks && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-secondary/30" /> Site walks and other main-calendar events
          </span>
        )}
      </div>

      {/* Grid on wider screens. */}
      <div className="hidden md:grid grid-cols-7 overflow-hidden rounded-lg border border-border bg-card">
        {WEEKDAYS.map((w) => (
          <div key={w} className="border-b border-border px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            {w}
          </div>
        ))}
        {grid.days.map((d) => {
          const list = byDay.get(d) || [];
          const inMonth = inRange(d);
          const cap = view === "2w" ? 8 : 4;
          return (
            <div
              key={d}
              onClick={(ev) => {
                // Taps on an event open it in Google; taps on empty space add.
                if ((ev.target as HTMLElement).closest("a")) return;
                if (data?.connected) setOpenOn(d);
              }}
              title="Tap to add something on this day"
              className={cn(
                "cursor-pointer hover:bg-primary/5",
                view === "2w" ? "min-h-40" : "min-h-24",
                "border-b border-r border-border p-1.5 space-y-1",
                !inMonth && "bg-muted/40",
                (dow(d) === 0 || dow(d) === 6) && inMonth && "bg-muted/20"
              )}
            >
              <div className={cn("text-xs", d === today ? "font-bold text-primary" : inMonth ? "" : "text-muted-foreground")}>
                {view === "2w" && (d === grid.days[0] || d.endsWith("-01"))
                  ? dayLabel(d).replace(/^\w+, /, "")
                  : Number(d.slice(8))}
                {d === today ? " · today" : ""}
              </div>
              {list.slice(0, cap).map((e) => (
                <Chip key={`${e.calendarId}-${e.id}-${d}`} e={e} />
              ))}
              {list.length > cap && <div className="text-xs text-muted-foreground">+{list.length - cap} more</div>}
            </div>
          );
        })}
      </div>

      {/* Agenda on phones. */}
      <div className="md:hidden space-y-3">
        {agendaDays.length === 0 && !loading && <p className="text-sm text-muted-foreground">Nothing on the calendar {view === "2w" ? "these two weeks" : "this month"}.</p>}
        {agendaDays.map((d) => (
          <div key={d} className="rounded-lg border border-border bg-card p-3">
            <div className={cn("text-sm font-semibold mb-2", d === today && "text-primary")}>
              {dayLabel(d)}
              {d === today ? " · today" : ""}
            </div>
            <div className="space-y-2">
              {(byDay.get(d) || []).map((e) => (
                <a
                  key={`${e.calendarId}-${e.id}`}
                  href={e.htmlLink || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn("block rounded-md p-2 text-sm", e.kind === "job" ? "bg-primary/10" : "bg-secondary/10")}
                >
                  <div className="font-medium">
                    {!e.allDay && <span className="text-muted-foreground mr-1.5">{timeOf(e.start)}</span>}
                    {e.title}
                  </div>
                  {e.location && <div className="text-xs text-muted-foreground">{e.location}</div>}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      {data?.jobs && (
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
          Tap an event to open it in Google Calendar <ExternalLink className="h-3 w-3" />
        </p>
      )}
    </div>
  );
}
