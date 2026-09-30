"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { useAuth } from "@/context/auth-provider";
import { cn } from "@/lib/utils";

// One "Add to calendar" button for leads, quotes and the Calendar page.
// Pick what it is, the day (and time), and it goes on the right calendar:
// jobs on FiberNorth Jobs, walks and calls on admin@'s main calendar.

type Kind = "walk" | "call" | "job" | "other";
const KINDS: Array<{ id: Kind; label: string; cal: "jobs" | "main" }> = [
  { id: "walk", label: "Site walk", cal: "main" },
  { id: "call", label: "Call", cal: "main" },
  { id: "job", label: "Job", cal: "jobs" },
  { id: "other", label: "Other", cal: "jobs" },
];
const PREFIX: Record<Kind, string> = { walk: "Site walk", call: "Call", job: "Job", other: "" };

export interface CalendarSubject {
  leadId?: string;
  name?: string;
  address?: string;
  phone?: string;
  service?: string;
}

const input =
  "w-full px-3 py-2 bg-muted border border-border rounded-md text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary";

export function AddToCalendar({
  subject = {},
  today,
  openOn,
  onAdded,
  onWalk,
  label = "Add to calendar",
  hideButton = false,
  onClose,
}: {
  subject?: CalendarSubject;
  today: string;
  /** Open the form on this day (the Calendar page's day tap). */
  openOn?: string;
  onAdded?: () => void;
  /** On a lead, a walk is booked on the lead itself (stage, Today card). */
  onWalk?: (date: string, time: string) => Promise<string>;
  label?: string;
  hideButton?: boolean;
  onClose?: () => void;
}) {
  const { getIdToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("call");
  const [cal, setCal] = useState<"jobs" | "main">("main");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [date, setDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; link?: string } | null>(null);

  const who = subject.name?.trim() || "";
  useEffect(() => {
    if (!titleTouched) setTitle([PREFIX[kind], who].filter(Boolean).join(": ") || "");
  }, [kind, who, titleTouched]);
  useEffect(() => {
    if (openOn) {
      setDate(openOn);
      setOpen(true);
      setMsg(null);
    }
  }, [openOn]);

  const pickKind = (k: Kind) => {
    setKind(k);
    setCal(KINDS.find((x) => x.id === k)!.cal);
  };
  const close = () => {
    setOpen(false);
    onClose?.();
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (kind === "walk" && onWalk) {
        const text = await onWalk(date, time);
        setMsg({ ok: !/fail|couldn|error/i.test(text), text });
        onAdded?.();
        setOpen(false);
        return;
      }
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const extra = [
        notes.trim(),
        subject.phone ? `Phone: ${subject.phone}` : "",
        subject.service ? `Service: ${subject.service.replace(/-/g, " ")}` : "",
        subject.leadId ? `Lead: https://fibernorth.com/admin/leads?lead=${subject.leadId}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const res = await fetch("/api/admin/calendar", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          calendar: cal,
          leadId: subject.leadId || undefined,
          logToLead: Boolean(subject.leadId),
          job: {
            title: title.trim() || "Calendar item",
            date,
            endDate: time ? "" : endDate,
            time,
            location: subject.address || "",
            notes: extra,
          },
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; htmlLink?: string };
      if (!res.ok) throw new Error(json.error || `Couldn't add it (${res.status})`);
      setMsg({ ok: true, text: `Added to ${cal === "jobs" ? "FiberNorth Jobs" : "your calendar"}.`, link: json.htmlLink });
      setNotes("");
      setOpen(false);
      onAdded?.();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't add it" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {!open && !hideButton && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setMsg(null);
          }}
          className="px-3 py-1.5 min-h-11 sm:min-h-0 rounded-md text-sm border border-border flex items-center gap-1.5 hover:border-primary hover:text-primary"
        >
          <CalendarPlus className="h-4 w-4" />
          {label}
        </button>
      )}
      {open && (
        <div className="rounded-md border border-border bg-card p-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => pickKind(k.id)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm border",
                  kind === k.id ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
          {!(kind === "walk" && onWalk) && (
            <input
              aria-label="What"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
              }}
              placeholder="What is it?"
              className={input}
            />
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Day</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
            </label>
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Time (blank = all day)</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} />
            </label>
            {!time && kind !== "walk" && kind !== "call" && (
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">Last day (optional)</span>
                <input type="date" min={date} value={endDate} onChange={(e) => setEndDate(e.target.value)} className={input} />
              </label>
            )}
          </div>
          {!(kind === "walk" && onWalk) && (
            <>
              <input
                aria-label="Notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (phone and lead link are added for you)"
                className={input}
              />
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Calendar:</span>
                {(
                  [
                    ["jobs", "FiberNorth Jobs"],
                    ["main", "My calendar"],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setCal(k)}
                    className={cn(
                      "px-2.5 py-1 rounded-full border",
                      cal === k ? "border-primary text-primary font-medium" : "border-border text-muted-foreground"
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </>
          )}
          {kind === "walk" && onWalk && (
            <p className="text-xs text-muted-foreground">Books the walk on this lead and puts it on your calendar.</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !date}
              onClick={() => void save()}
              className="px-4 py-2 rounded-md text-sm bg-primary text-primary-foreground font-semibold disabled:opacity-50 flex items-center gap-2"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Add
            </button>
            <button type="button" disabled={busy} onClick={close} className="px-4 py-2 rounded-md text-sm border border-border">
              Cancel
            </button>
          </div>
        </div>
      )}
      {msg && (
        <p className={cn("text-sm", msg.ok ? "text-accent" : "text-destructive")}>
          {msg.text}{" "}
          {msg.link && (
            <a href={msg.link} target="_blank" rel="noopener noreferrer" className="underline">
              Open
            </a>
          )}
        </p>
      )}
    </div>
  );
}
