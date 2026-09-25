"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ensureQuoteForLead } from "@/actions/quotes";
import { emailLead } from "@/actions/lead-email";
import { saveLead } from "@/actions/leads";
import { LEAD_EMAIL_TEMPLATES, fillTemplate } from "@/lib/lead-email-templates";
import { LeadQuotes } from "@/components/admin/lead-quotes";
import {
  JobDone,
  PartnerJobs,
  PartnerLine,
  ReferralPanel,
  SuggestedStep,
  templateExtras,
  type SaveFn,
  type SaveResult,
} from "@/components/admin/lead-sales";
import { nextCadenceStep } from "@/lib/cadence";
import { useFirestoreDocument } from "@/hooks/use-firestore-document";
import { orderBy } from "firebase/firestore";
import {
  Users,
  Plus,
  Loader2,
  Phone,
  PhoneOff,
  MessageSquare,
  Mail,
  Footprints,
  FileText,
  MapPin,
  ChevronDown,
  ChevronUp,
  Search,
  Navigation,
  CloudOff,
  Pencil,
} from "lucide-react";
import { useFirestoreCollection } from "@/hooks/use-firestore-collection";
import { useAuth } from "@/context/auth-provider";
import { createDocument } from "@/actions/crud";
import { setCurrentLead } from "@/lib/current-lead";
import {
  enqueueSave,
  flushOutbox,
  isNetworkError,
  readOutbox,
  type OutboxItem,
} from "@/lib/lead-outbox";
import {
  LEAD_STAGES,
  STAGE_LABELS,
  OPEN_STAGES,
  countByStage,
  LEAD_SOURCES,
  SOURCE_LABELS,
  todayISO,
  isStale,
  isDue,
  isToSchedule,
  quickNextDates,
  todaySummary,
  directionsUrl,
  smsUrl,
  addDays,
  DISQUALIFY_REASONS,
  DISQUALIFY_LABELS,
  LOST_REASONS,
  type Lead,
  type LeadActivity,
  type LeadStage,
} from "@/lib/leads";

// Inputs are 16px on a phone so iOS doesn't zoom in on every tap.
const inputCls =
  "w-full px-3 py-2 min-h-11 sm:min-h-0 bg-muted border border-border rounded-md text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary";

// Glove-size on a phone (44px), normal size from the small breakpoint up.
const tap = "min-h-11 sm:min-h-0";

const STAGE_STYLES: Record<string, string> = {
  new: "bg-primary/15 text-primary",
  contacted: "bg-secondary/15 text-secondary",
  walk_scheduled: "bg-secondary/15 text-secondary",
  walk_done: "bg-accent/15 text-accent",
  quoted: "bg-accent/15 text-accent",
  won: "bg-accent/25 text-accent",
  nurture: "bg-muted text-muted-foreground",
  lost: "bg-muted text-muted-foreground line-through",
  not_a_lead: "bg-muted text-muted-foreground/60 line-through",
};

type Filter = "due" | "schedule" | "stale" | "open" | LeadStage | "all";
const FILTER_KEYS: readonly string[] = ["due", "schedule", "stale", "open", "all", ...LEAD_STAGES];

function daysAgo(d?: string): string {
  if (!d) return "never";
  const n = Math.round(
    (new Date(`${todayISO()}T12:00:00Z`).getTime() - new Date(`${d}T12:00:00Z`).getTime()) / 86400000
  );
  if (n <= 0) return "today";
  if (n === 1) return "yesterday";
  return `${n} days ago`;
}

function dueLabel(d?: string): { text: string; cls: string } {
  if (!d) return { text: "", cls: "" };
  const today = todayISO();
  if (d < today) return { text: `overdue (${d})`, cls: "text-destructive font-semibold" };
  if (d === today) return { text: "today", cls: "text-secondary font-semibold" };
  return { text: d, cls: "text-muted-foreground" };
}

function fmtWhen(iso: string): string {
  const dt = new Date(iso);
  return isNaN(dt.getTime()) ? iso : dt.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

function fmtTime(hhmm?: string): string {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

const now = () => new Date().toISOString();

export default function AdminLeadsPage() {
  return (
    <Suspense fallback={<Loader2 className="h-6 w-6 animate-spin text-muted-foreground m-12" />}>
      <LeadsInner />
    </Suspense>
  );
}

function LeadsInner() {
  const live = useFirestoreCollection<Lead>("leads", {
    constraints: [orderBy("createdAt", "desc")],
  });
  const { getIdToken } = useAuth();
  // Public settings doc: the Google review link for the review-ask starters.
  const settings = useFirestoreDocument<{ googleReviewUrl?: string }>("siteSettings/general");
  const reviewUrl = (settings.data?.googleReviewUrl || "").trim();

  // Fallback: if the client read is denied (rules not published yet), pull
  // through the Admin SDK route and refresh after every save.
  const [fallback, setFallback] = useState<Lead[] | null>(null);
  const [fallbackError, setFallbackError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!live.error) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch("/api/admin/leads", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`Failed to load leads (${res.status})`);
        const json = (await res.json()) as { leads: Lead[] };
        if (!cancelled) setFallback(json.leads);
      } catch (e) {
        if (!cancelled) setFallbackError(e instanceof Error ? e : new Error("Failed to load leads"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [live.error, getIdToken, tick]);

  const data = live.error ? (fallback ?? []) : live.data;
  const loading = live.error ? fallback === null && !fallbackError : live.loading;
  const error = live.error ? fallbackError : null;
  const refetch = useCallback(() => setTick((t) => t + 1), []);
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>("due");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(params.get("lead"));
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  useEffect(() => {
    const id = params.get("lead");
    if (id) {
      setOpenId(id);
      setFilter("all");
    }
    const f = params.get("filter");
    if (f && FILTER_KEYS.includes(f)) setFilter(f as Filter);
  }, [params]);

  // Tell the voice assistant which lead is open ("this one").
  useEffect(() => {
    const l = openId ? data.find((x) => x.id === openId) : null;
    setCurrentLead(l ? { id: l.id, name: l.name || "" } : null);
  }, [openId, data]);
  useEffect(() => () => setCurrentLead(null), []);

  // ---- Offline outbox -------------------------------------------------
  const [pending, setPending] = useState<OutboxItem[]>([]);
  const flushing = useRef(false);
  const refreshPending = useCallback(() => setPending(readOutbox()), []);

  const flush = useCallback(async () => {
    if (flushing.current || readOutbox().length === 0) return;
    flushing.current = true;
    try {
      const r = await flushOutbox(async (item) => {
        const token = await getIdToken();
        if (!token) throw new Error("network: no token");
        const res = await saveLead(item.leadId, item.patch, item.activity, token);
        if (res.ok && "appointmentAt" in item.patch) {
          // The walk date changed while offline: update the calendar now.
          await fetch("/api/admin/leads/calendar", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ leadId: item.leadId }),
          }).catch(() => {});
        }
        return res;
      });
      if (r.dropped.length) {
        setRowError((p) => {
          const next = { ...p };
          for (const d of r.dropped) next[d.item.leadId] = `A save made offline didn't go through: ${d.error}`;
          return next;
        });
      }
      if (r.sent && live.error) refetch();
    } finally {
      flushing.current = false;
      refreshPending();
    }
  }, [getIdToken, live.error, refetch, refreshPending]);

  useEffect(() => {
    refreshPending();
    flush();
    const onOnline = () => flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") flush();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [flush, refreshPending]);

  // ---- "Log that call?" after tapping Call and coming back ------------
  const callTap = useRef<{ leadId: string; at: number; away: boolean } | null>(null);
  const [callPrompt, setCallPrompt] = useState<string | null>(null);
  useEffect(() => {
    const onVis = () => {
      const t = callTap.current;
      if (!t) return;
      if (document.visibilityState === "hidden") {
        t.away = true;
      } else if (t.away) {
        callTap.current = null;
        if (Date.now() - t.at < 3 * 60 * 60 * 1000) setCallPrompt(t.leadId);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  const onCallTap = useCallback((leadId: string) => {
    callTap.current = { leadId, at: Date.now(), away: false };
  }, []);

  const today = todayISO();

  // One number per chip, within the chosen source, so the pills add up to
  // what the list shows (the search box narrows the list, not the pills).
  const counts = useMemo(() => {
    const pool = source ? data.filter((l) => l.source === source) : data;
    const due = pool.filter((l) => isDue(l, today)).length;
    const schedule = pool.filter((l) => isToSchedule(l)).length;
    const open = pool.filter((l) => OPEN_STAGES.includes(l.stage as LeadStage)).length;
    const stale = pool.filter((l) => isStale(l, today)).length;
    const all = pool.filter((l) => l.stage !== "not_a_lead").length;
    return { due, schedule, open, stale, all, byStage: countByStage(pool) };
  }, [data, source, today]);

  const summary = useMemo(() => todaySummary(data, today), [data, today]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data
      .filter((l) => {
        if (filter === "due") return isDue(l, today);
        if (filter === "schedule") return isToSchedule(l);
        if (filter === "stale") return isStale(l, today);
        if (filter === "open") return OPEN_STAGES.includes(l.stage as LeadStage);
        if (filter === "all") return l.stage !== "not_a_lead";
        return l.stage === filter;
      })
      .filter((l) => !source || l.source === source)
      .filter(
        (l) =>
          !needle ||
          [l.name, l.phone, l.email, l.address, l.serviceType, l.contactName, l.sourceNotes, l.notes]
            .join(" ")
            .toLowerCase()
            .includes(needle)
      )
      .sort((a, b) => {
        if (filter === "due") return (a.nextActionAt || "").localeCompare(b.nextActionAt || "");
        if (filter === "stale") return (a.lastContactAt || "").localeCompare(b.lastContactAt || "");
        return 0;
      });
  }, [data, filter, source, q, today]);

  const save: SaveFn = async (lead, patch, activity) => {
    setRowError((p) => ({ ...p, [lead.id]: "" }));
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const r = await saveLead(lead.id, patch as Record<string, unknown>, activity ?? null, token);
      if (!r.ok) {
        setRowError((p) => ({ ...p, [lead.id]: r.gone ? "This lead was deleted." : r.error }));
        return "error";
      }
      if (live.error) refetch();
      return "ok";
    } catch (e) {
      if (isNetworkError(e)) {
        const stored = enqueueSave({
          leadId: lead.id,
          leadName: lead.name,
          patch: patch as Record<string, unknown>,
          activity: activity ?? null,
        });
        if (stored) {
          refreshPending();
          return "queued";
        }
      }
      setRowError((p) => ({
        ...p,
        [lead.id]: e instanceof Error && !isNetworkError(e) ? e.message : "Couldn't save. No signal? Your text is still here, try again.",
      }));
      return "error";
    }
  };

  const openLead = (id: string) => {
    setFilter("all");
    setSource("");
    setQ("");
    setOpenId(id);
    setTimeout(() => document.getElementById(`lead-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const chips: Array<{ key: Filter; label: string; n: number }> = [
    { key: "due", label: "Due", n: counts.due },
    { key: "schedule", label: "To schedule", n: counts.schedule },
    { key: "stale", label: "Stale", n: counts.stale },
    { key: "open", label: "Open", n: counts.open },
    ...LEAD_STAGES.map((s) => ({ key: s as Filter, label: STAGE_LABELS[s], n: counts.byStage[s] })),
    { key: "all", label: "All", n: counts.all },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Leads</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setImporting((v) => !v)}
            className="hidden sm:inline-flex px-3 py-2 text-sm border border-border rounded-md hover:bg-muted"
          >
            Import
          </button>
          <button
            onClick={() => setAdding((v) => !v)}
            className={`px-4 py-2 ${tap} text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-2`}
          >
            <Plus className="h-4 w-4" />
            Add lead
          </button>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border border-secondary/50 bg-secondary/10 rounded-lg px-3 py-2 text-sm">
          <CloudOff className="h-4 w-4 text-secondary shrink-0" />
          <span className="flex-1 min-w-[12rem]">
            {pending.length} {pending.length === 1 ? "save hasn't" : "saves haven't"} gone out yet. They send when you have signal.
          </span>
          <button onClick={() => flush()} className={`px-3 py-1.5 ${tap} border border-border rounded-md hover:bg-muted`}>
            Send now
          </button>
        </div>
      )}

      {importing && <ImportPanel onDone={() => { if (live.error) refetch(); }} />}

      {adding && (
        <AddLeadForm
          onDone={() => {
            setAdding(false);
            if (live.error) refetch();
          }}
        />
      )}

      {live.error && !fallbackError && (
        <p className="text-xs text-muted-foreground">
          Live updates are off until the Firestore rules are published. Showing a snapshot instead.
        </p>
      )}

      {!loading && !error && (
        <TodayBlock summary={summary} onDue={() => setFilter("due")} onOpen={openLead} />
      )}

      <FilterChips chips={chips} active={filter} onPick={setFilter} />

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, address, notes"
            className={`${inputCls} pl-9`}
          />
        </div>
        <select value={source} onChange={(e) => setSource(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">All sources</option>
          {LEAD_SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div role="alert" className="border border-destructive/50 bg-destructive/10 text-destructive rounded-lg p-4 text-sm">
          Couldn&apos;t load leads: {error.message}
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-10 text-center text-muted-foreground">
          {filter === "due"
            ? "Nothing due. Nice."
            : filter === "stale"
              ? "Nobody is overdue for a touch."
              : filter === "schedule"
                ? "No won jobs waiting to be scheduled."
                : "No leads here."}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              open={openId === lead.id}
              onToggle={() => setOpenId(openId === lead.id ? null : lead.id)}
              onOpen={() => setOpenId(lead.id)}
              onSave={save}
              error={rowError[lead.id]}
              unsent={pending.filter((p) => p.leadId === lead.id).length}
              onCallTap={onCallTap}
              askLogCall={callPrompt === lead.id}
              onCallPromptDone={() => setCallPrompt(null)}
              allLeads={data}
              reviewUrl={reviewUrl}
              onOpenLead={openLead}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** The morning view above the filters. */
function TodayBlock({
  summary,
  onDue,
  onOpen,
}: {
  summary: ReturnType<typeof todaySummary>;
  onDue: () => void;
  onOpen: (id: string) => void;
}) {
  const { walks, due, newLeads, quotes } = summary;
  const link = "text-primary hover:underline text-left";
  return (
    <section aria-label="Today" className="bg-card border border-border rounded-lg p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold mr-auto">Today</h2>
        <button onClick={onDue} className={`px-3 py-1.5 ${tap} rounded-md text-sm border border-border hover:bg-muted`}>
          {due} due
        </button>
      </div>

      {walks.length > 0 ? (
        <ul className="space-y-2">
          {walks.map((l) => (
            <li key={l.id} className="flex items-center gap-2">
              <button onClick={() => onOpen(l.id)} className="flex-1 min-w-0 text-left">
                <span className="text-sm font-medium">
                  <Footprints className="inline h-4 w-4 mr-1 text-accent" />
                  Walk{l.appointmentTime ? ` at ${fmtTime(l.appointmentTime)}` : ""}: {l.name || "(no name)"}
                </span>
                {l.address && <span className="block text-sm text-muted-foreground truncate">{l.address}</span>}
              </button>
              {l.address && (
                <a
                  href={directionsUrl(l.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 h-11 px-3 flex items-center gap-1.5 rounded-md border border-border text-sm hover:bg-muted"
                >
                  <Navigation className="h-4 w-4" />
                  Directions
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No site walks today.</p>
      )}

      {newLeads.length > 0 && (
        <p className="text-sm">
          <span className="text-muted-foreground">New since yesterday: </span>
          {newLeads.slice(0, 6).map((l, i) => (
            <span key={l.id}>
              {i > 0 && ", "}
              <button onClick={() => onOpen(l.id)} className={link}>
                {l.name || "(no name)"}
              </button>
            </span>
          ))}
          {newLeads.length > 6 && <span className="text-muted-foreground"> and {newLeads.length - 6} more</span>}
        </p>
      )}

      {quotes.length > 0 && (
        <p className="text-sm">
          <span className="text-muted-foreground">Quotes: </span>
          {quotes.slice(0, 6).map(({ lead, what }, i) => (
            <span key={lead.id}>
              {i > 0 && ", "}
              <button onClick={() => onOpen(lead.id)} className={link}>
                {lead.name || "(no name)"}
              </button>{" "}
              <span className={what === "accepted" ? "text-accent font-medium" : "text-secondary"}>{what}</span>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

function ActionRow({ lead, onCallTap }: { lead: Lead; onCallTap: (id: string) => void }) {
  const first = (lead.contactName || lead.name || "").trim().split(/\s+/)[0] || "";
  const personal = !["contractor-letter", "campground-letter"].includes(String(lead.source));
  const opener = `Hi${first && personal ? ` ${first}` : ""}, this is Bill with FiberNorth${
    lead.serviceType ? ` about your ${lead.serviceType.toLowerCase()} request` : ""
  }. Is now a good time to call?`;
  const btn = "h-12 rounded-md border flex items-center justify-center gap-2 text-sm font-medium";
  const on = `${btn} border-border hover:bg-muted`;
  const off = `${btn} border-border/50 text-muted-foreground/50 cursor-not-allowed`;
  return (
    <div className="grid grid-cols-3 gap-2 px-4 pb-3">
      {lead.phone ? (
        <a href={`tel:${lead.phone}`} onClick={() => onCallTap(lead.id)} className={`${on} text-primary border-primary/40`}>
          <Phone className="h-4 w-4" />
          Call
        </a>
      ) : (
        <span aria-disabled="true" className={off}>
          <Phone className="h-4 w-4" />
          Call
        </span>
      )}
      {lead.phone ? (
        <a href={smsUrl(lead.phone, opener)} className={on}>
          <MessageSquare className="h-4 w-4" />
          Text
        </a>
      ) : (
        <span aria-disabled="true" className={off}>
          <MessageSquare className="h-4 w-4" />
          Text
        </span>
      )}
      {lead.address ? (
        <a href={directionsUrl(lead.address)} target="_blank" rel="noopener noreferrer" className={on}>
          <Navigation className="h-4 w-4" />
          Directions
        </a>
      ) : (
        <span aria-disabled="true" className={off}>
          <Navigation className="h-4 w-4" />
          Directions
        </span>
      )}
    </div>
  );
}

type Snapshot = ReturnType<typeof snapshotOf>;
function snapshotOf(l: Lead) {
  return {
    name: l.name || "",
    source: String(l.source || ""),
    address: l.address || "",
    notes: l.notes || "",
    appointmentAt: l.appointmentAt || "",
    objection: l.objection || "",
    cashCollected: l.cashCollected || "",
    saleAmount: l.saleAmount || "",
    serviceType: l.serviceType || "",
    contactName: l.contactName || "",
    phone: l.phone || "",
    email: l.email || "",
    contactEveryDays: l.contactEveryDays ? String(l.contactEveryDays) : "",
    lastContactAt: l.lastContactAt || "",
    appointmentTime: l.appointmentTime || "",
  };
}

/**
 * When the lead changes underneath (a sync, another save), take the new
 * value only for fields the user hasn't edited; keep what they're typing.
 */
function mergeUnedited<T extends Record<string, string>>(current: T, before: T, after: T): T {
  const out = { ...current };
  for (const k of Object.keys(after) as Array<keyof T>) {
    if (current[k] === before[k]) out[k] = after[k];
  }
  return out;
}

function LeadCard({
  lead,
  open,
  onToggle,
  onOpen,
  onSave,
  error,
  unsent,
  onCallTap,
  askLogCall,
  onCallPromptDone,
  allLeads,
  reviewUrl,
  onOpenLead,
}: {
  lead: Lead;
  open: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onSave: SaveFn;
  error?: string;
  unsent: number;
  onCallTap: (id: string) => void;
  askLogCall: boolean;
  onCallPromptDone: () => void;
  allLeads: Lead[];
  reviewUrl: string;
  onOpenLead: (id: string) => void;
}) {
  const due = dueLabel(lead.nextActionAt);
  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState<LeadActivity["type"]>("call");
  const [next, setNext] = useState({ text: lead.nextAction || "", date: lead.nextActionAt || "" });
  const [calMsg, setCalMsg] = useState("");
  const [fields, setFields] = useState<Snapshot>(() => snapshotOf(lead));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState("");
  const today = todayISO();
  const stale = isStale(lead, today);

  // Only reset what the user isn't editing.
  const baseFields = useRef<Snapshot>(snapshotOf(lead));
  const baseNext = useRef({ text: lead.nextAction || "", date: lead.nextActionAt || "" });
  useEffect(() => {
    const after = snapshotOf(lead);
    const before = baseFields.current;
    baseFields.current = after;
    setFields((cur) => mergeUnedited(cur, before, after));
    const nAfter = { text: lead.nextAction || "", date: lead.nextActionAt || "" };
    const nBefore = baseNext.current;
    baseNext.current = nAfter;
    setNext((cur) => mergeUnedited(cur, nBefore, nAfter));
  }, [lead]);

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(""), 4000);
  };
  const report = (r: SaveResult, okMsg = "") => {
    if (r === "queued") showFlash("No signal. Saved on this phone, will send later.");
    else if (r === "ok" && okMsg) showFlash(okMsg);
  };

  const changeStage = async (stage: string) => {
    const r = await onSave(
      lead,
      { stage },
      { ts: now(), type: "stage", text: `Moved to ${STAGE_LABELS[stage as LeadStage] ?? stage}` }
    );
    report(r, stage === "nurture" ? "Moved to Long term. Check back set." : "");
  };

  // Email from the card: pick a starter, edit, send, then log it like any contact.
  const { getIdToken } = useAuth();
  const [sendMail, setSendMail] = useState(Boolean(lead.email));
  const [mailTo, setMailTo] = useState(lead.email || "");
  const [tplKey, setTplKey] = useState(LEAD_EMAIL_TEMPLATES[0].key);
  const firstFill = fillTemplate(LEAD_EMAIL_TEMPLATES[0], lead);
  const [mailSubject, setMailSubject] = useState(firstFill.subject);
  const [mailBody, setMailBody] = useState(firstFill.body);
  const [mailErr, setMailErr] = useState("");
  const [mailMsg, setMailMsg] = useState("");
  const emailing = noteType === "email" && sendMail;
  const pickTemplate = (key: string) => {
    const t = LEAD_EMAIL_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    const f = fillTemplate(t, lead, templateExtras(lead, reviewUrl));
    setTplKey(key);
    setMailSubject(f.subject);
    setMailBody(f.body);
  };
  /** From the suggested step: open the card on the email box with that starter. */
  const startEmail = (key: string) => {
    setNoteType("email");
    setSendMail(true);
    pickTemplate(LEAD_EMAIL_TEMPLATES.some((t) => t.key === key) ? key : LEAD_EMAIL_TEMPLATES[0].key);
    onOpen();
    setTimeout(() => document.getElementById(`mail-${lead.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };
  useEffect(() => {
    if (!mailTo && lead.email) setMailTo(lead.email);
  }, [lead.email, mailTo]);

  const addActivity = async () => {
    setMailErr("");
    setMailMsg("");
    if (emailing) {
      if (!mailTo.includes("@")) {
        setMailErr("Add the customer's email address.");
        return;
      }
      setSaving(true);
      try {
        const token = await getIdToken();
        if (!token) throw new Error("Session expired, sign in again");
        const r = await emailLead({ leadId: lead.id, to: mailTo, subject: mailSubject, body: mailBody }, token);
        if (!r.ok) {
          setMailErr(r.error || "Email failed");
          setSaving(false);
          return;
        }
      } catch (e) {
        setMailErr(e instanceof Error ? e.message : "Email failed");
        setSaving(false);
        return;
      }
      const text = note.trim() ? `${note.trim()} (emailed "${mailSubject}")` : `Emailed "${mailSubject}" to ${mailTo}`;
      const r = await onSave(lead, {}, { ts: now(), type: "email", text });
      setMailMsg(r === "error" ? `Sent to ${mailTo}, but the log didn't save.` : `Sent to ${mailTo} and logged.`);
      if (r !== "error") setNote("");
      pickTemplate(tplKey);
      setSaving(false);
      return;
    }
    if (!note.trim()) return;
    setSaving(true);
    const r = await onSave(lead, {}, { ts: now(), type: noteType, text: note.trim() });
    // Keep the typed note if it didn't save.
    if (r !== "error") setNote("");
    report(r);
    setSaving(false);
  };

  /** One tap: "Talked" or "No answer / left VM", using any typed note too. */
  const quickLog = async (kind: "talked" | "noanswer") => {
    setSaving(true);
    const extra = note.trim();
    let r: SaveResult;
    if (kind === "talked") {
      r = await onSave(lead, {}, { ts: now(), type: "call", text: extra || "Talked" });
      if (r !== "error") onOpen();
    } else {
      // Tried and missed: move a due follow-up to tomorrow so it drops off
      // today's list. Leads on the follow-up schedule get its next step
      // from the server instead.
      const dueNow = !lead.nextActionAt || lead.nextActionAt <= today;
      const bump =
        dueNow && lead.stage !== "won" && !nextCadenceStep(lead, today)
          ? { nextAction: lead.nextAction || "Call back", nextActionAt: addDays(today, 1) }
          : {};
      r = await onSave(lead, bump, {
        ts: now(),
        type: "attempt",
        text: extra ? `No answer, left VM. ${extra}` : "No answer, left VM",
      });
    }
    if (r !== "error") setNote("");
    report(r, kind === "talked" ? "Logged the call." : "Logged. Call back tomorrow.");
    setSaving(false);
    onCallPromptDone();
  };

  const saveNext = async () => {
    setSaving(true);
    report(await onSave(lead, { nextAction: next.text, nextActionAt: next.date }), "Next action set.");
    setSaving(false);
  };

  const quickNext = async (date: string, label: string) => {
    setSaving(true);
    const text = next.text.trim() && next.text !== lead.nextAction ? next.text.trim() : "Call back";
    setNext({ text, date });
    report(await onSave(lead, { nextAction: text, nextActionAt: date }), `${text}: ${label.toLowerCase()} (${date}).`);
    setSaving(false);
  };

  const clearNext = async () => {
    setSaving(true);
    const r = await onSave(
      lead,
      { nextAction: "", nextActionAt: "" },
      { ts: now(), type: "system", text: `Done: ${lead.nextAction || "follow-up"}` }
    );
    if (r !== "error") setNext({ text: "", date: "" });
    report(r);
    setSaving(false);
  };

  const saveFields = async () => {
    setSaving(true);
    setCalMsg("");
    const was = snapshotOf(lead);
    // Only send what changed, so a save never overwrites someone else's edit.
    const changed = (Object.keys(fields) as Array<keyof Snapshot>).filter((k) => fields[k] !== was[k]);
    if (changed.length === 0) {
      setCalMsg("No changes.");
      setSaving(false);
      return;
    }
    const patch: Record<string, unknown> = {};
    for (const k of changed) patch[k] = k === "contactEveryDays" ? Number(fields[k]) || 0 : fields[k];
    const apptChanged = changed.includes("appointmentAt") || changed.includes("appointmentTime");
    if (apptChanged) {
      patch.appointmentAt = fields.appointmentAt;
      patch.appointmentTime = fields.appointmentTime;
    }
    const activity: LeadActivity | undefined =
      apptChanged && fields.appointmentAt
        ? {
            ts: now(),
            type: "walk",
            text: `Walk scheduled for ${fields.appointmentAt}${fields.appointmentTime ? ` at ${fields.appointmentTime}` : ""}`,
          }
        : undefined;
    const r = await onSave(lead, patch as Partial<Lead>, activity);
    if (r === "queued") {
      setCalMsg("No signal. Saved on this phone; the calendar updates when it sends.");
    } else if (r === "ok") {
      setCalMsg("Saved.");
      if (apptChanged) {
        try {
          const token = await getIdToken();
          const res = await fetch("/api/admin/leads/calendar", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ leadId: lead.id }),
          });
          const json = await res.json();
          setCalMsg(res.ok ? (fields.appointmentAt ? "Saved. On the calendar." : "Saved. Removed from the calendar.") : json.error || "Calendar sync failed");
        } catch {
          setCalMsg("Saved, but the calendar sync failed.");
        }
      }
    }
    setSaving(false);
  };

  const activity = [...(lead.activity || [])].sort((a, b) => b.ts.localeCompare(a.ts));
  const chip = `px-3 py-1.5 ${tap} rounded-md text-sm border border-border hover:bg-muted disabled:opacity-50`;

  return (
    <div id={`lead-${lead.id}`} className="bg-card border border-border rounded-lg scroll-mt-4">
      <div className="px-4 py-3 flex items-start gap-3">
        <button onClick={onToggle} className="flex-1 text-left min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-semibold">{lead.name || "(no name)"}</span>
            {lead.serviceType && <span className="text-sm text-muted-foreground">· {lead.serviceType}</span>}
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {SOURCE_LABELS[lead.source as keyof typeof SOURCE_LABELS] ?? lead.source}
            </span>
            {unsent > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/20 text-secondary flex items-center gap-1">
                <CloudOff className="h-3 w-3" />
                Unsent{unsent > 1 ? ` (${unsent})` : ""}
              </span>
            )}
          </div>
          {lead.address && (
            <div className="text-sm mt-0.5 truncate flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">{lead.address}</span>
            </div>
          )}
          {(lead.contactName || lead.phone || lead.email || (!lead.address && lead.sourceNotes)) && (
            <div className="text-sm text-muted-foreground mt-0.5 truncate">
              {[lead.contactName, lead.phone, lead.email].filter(Boolean).join(" · ") ||
                (lead.address ? "" : (lead.sourceNotes || "").slice(0, 90))}
            </div>
          )}
          <div className="text-sm mt-1 flex flex-wrap gap-x-3">
            {(lead.nextAction || lead.nextActionAt) && (
              <span>
                <span className={due.cls}>{due.text}</span>
                {lead.nextAction && <span className="ml-2">{lead.nextAction}</span>}
              </span>
            )}
            {lead.appointmentAt && lead.appointmentAt >= today && (
              <span className="text-accent">
                Walk {lead.appointmentAt === today ? "today" : lead.appointmentAt}
                {lead.appointmentTime ? ` ${fmtTime(lead.appointmentTime)}` : ""}
              </span>
            )}
            <span className={stale ? "text-destructive font-medium" : "text-muted-foreground"}>
              Last contact {daysAgo(lead.lastContactAt)}
              {lead.contactEveryDays ? ` · every ${lead.contactEveryDays}d` : ""}
            </span>
            <PartnerLine lead={lead} leads={allLeads} />
          </div>
        </button>
        <div className="flex flex-col items-end gap-1.5 shrink-0 max-w-[45%]">
          <QuoteButton lead={lead} />
          <select
            value={lead.stage}
            onChange={(e) => changeStage(e.target.value)}
            aria-label="Stage"
            className={`text-sm sm:text-xs px-2.5 py-1 ${tap} rounded-full border-0 cursor-pointer ${STAGE_STYLES[lead.stage] ?? "bg-muted"}`}
          >
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
          <button
            onClick={onToggle}
            aria-label={open ? "Close" : "Open"}
            className="h-11 w-11 sm:h-8 sm:w-8 -mr-2 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <ActionRow lead={lead} onCallTap={onCallTap} />

      <SuggestedStep
        lead={lead}
        today={today}
        reviewUrl={reviewUrl}
        onCallTap={onCallTap}
        onEmail={startEmail}
        onSave={onSave}
      />

      {askLogCall && (
        <div className="mx-4 mb-3 border border-primary/40 bg-primary/5 rounded-md p-3 space-y-2">
          <p className="text-sm font-medium">Log that call?</p>
          <div className="flex flex-wrap gap-2">
            <button disabled={saving} onClick={() => quickLog("talked")} className={`${chip} border-primary text-primary`}>
              <Phone className="inline h-4 w-4 mr-1" />
              Talked
            </button>
            <button disabled={saving} onClick={() => quickLog("noanswer")} className={chip}>
              <PhoneOff className="inline h-4 w-4 mr-1" />
              No answer / left VM
            </button>
            <button onClick={onCallPromptDone} className={`${chip} text-muted-foreground`}>
              Not now
            </button>
          </div>
        </div>
      )}

      {flash && <p className="mx-4 mb-3 text-sm text-accent">{flash}</p>}

      {error && (
        <div className="mx-4 mb-3 border border-destructive/50 bg-destructive/10 text-destructive rounded-md p-2 text-sm">
          {error}
        </div>
      )}

      {open && (
        <div className="border-t border-border px-4 py-4 space-y-5">
          <CloseOut lead={lead} onSave={onSave} />
          <JobDone lead={lead} today={today} onSave={onSave} />
          {/* Log something */}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <button disabled={saving} onClick={() => quickLog("talked")} className={`${chip} flex items-center gap-1.5`}>
                <Phone className="h-4 w-4" />
                Talked
              </button>
              <button disabled={saving} onClick={() => quickLog("noanswer")} className={`${chip} flex items-center gap-1.5`}>
                <PhoneOff className="h-4 w-4" />
                No answer / left VM
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["call", Phone, "Call"],
                  ["text", MessageSquare, "Text"],
                  ["email", Mail, "Email"],
                  ["walk", Footprints, "Walk"],
                  ["letter", Mail, "Letter"],
                  ["note", FileText, "Note"],
                ] as const
              ).map(([t, Icon, label]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNoteType(t)}
                  className={`px-3 py-1 ${tap} rounded-md text-sm sm:text-xs border flex items-center gap-1 ${
                    noteType === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                  {label}
                </button>
              ))}
            </div>
            {noteType === "email" && (
              <label className={`flex items-center gap-2 text-sm cursor-pointer ${tap}`}>
                <input type="checkbox" checked={sendMail} onChange={(e) => setSendMail(e.target.checked)} className="h-5 w-5 sm:h-4 sm:w-4" />
                Send this email from here
              </label>
            )}
            {emailing && (
              <div id={`mail-${lead.id}`} className="space-y-2 border border-border rounded-md p-3 bg-muted/30 scroll-mt-4">
                <div className="flex flex-wrap gap-1.5">
                  {LEAD_EMAIL_TEMPLATES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => pickTemplate(t.key)}
                      className={`px-3 py-1 ${tap} rounded-full text-sm sm:text-xs border ${
                        tplKey === t.key ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <input value={mailTo} onChange={(e) => setMailTo(e.target.value)} placeholder="Customer email" className={inputCls} />
                <input value={mailSubject} onChange={(e) => setMailSubject(e.target.value)} placeholder="Subject" className={inputCls} />
                <textarea value={mailBody} onChange={(e) => setMailBody(e.target.value)} rows={9} className={`${inputCls} resize-y`} />
                <p className="text-xs text-muted-foreground">Comes from bill@fibernorth.com. You get a copy.</p>
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !emailing && addActivity()}
                placeholder={emailing ? "Note for the log (optional)" : "What happened? (Enter to save)"}
                className={inputCls}
              />
              <button
                onClick={addActivity}
                disabled={saving || (emailing ? !mailBody.trim() || !mailSubject.trim() : !note.trim())}
                className={`px-3 py-2 ${tap} text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50 whitespace-nowrap`}
              >
                {saving && emailing ? "Sending..." : emailing ? "Send & log" : "Log"}
              </button>
            </div>
            {mailErr && <p className="text-sm text-destructive">{mailErr}</p>}
            {mailMsg && <p className="text-sm text-accent">{mailMsg}</p>}
          </div>

          {/* Next action */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground w-full sm:w-auto">Call back:</span>
              {quickNextDates(today).map((d) => (
                <button key={d.label} disabled={saving} onClick={() => quickNext(d.date, d.label)} className={chip}>
                  {d.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
              <div className="space-y-1 col-span-2 sm:col-span-1">
                <label className="text-xs font-medium text-muted-foreground">Next action</label>
                <input
                  value={next.text}
                  onChange={(e) => setNext((n) => ({ ...n, text: e.target.value }))}
                  placeholder="Call back, send quote, walk the site..."
                  className={inputCls}
                />
              </div>
              <div className="space-y-1 col-span-2 sm:col-span-1">
                <label className="text-xs font-medium text-muted-foreground">When</label>
                <input
                  type="date"
                  value={next.date}
                  onChange={(e) => setNext((n) => ({ ...n, date: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <button onClick={saveNext} disabled={saving} className={`px-3 py-2 ${tap} text-sm border border-border rounded-md hover:bg-muted`}>
                Set
              </button>
              <button
                onClick={clearNext}
                disabled={saving || !(lead.nextAction || lead.nextActionAt)}
                className={`px-3 py-2 ${tap} text-sm bg-accent/15 text-accent rounded-md disabled:opacity-40`}
              >
                Done
              </button>
            </div>
          </div>

          <ReferralPanel lead={lead} leads={allLeads} today={today} onSave={onSave} onOpenLead={onOpenLead} />

          {/* Details, behind a button so a bump doesn't edit a field */}
          {!editing ? (
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => setEditing(true)} className={`${chip} flex items-center gap-1.5`}>
                <Pencil className="h-4 w-4" />
                Edit details
              </button>
              {calMsg && <span className="text-sm text-muted-foreground">{calMsg}</span>}
              {lead.calendarEventUrl && (
                <a href={lead.calendarEventUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                  Open calendar event
                </a>
              )}
            </div>
          ) : (
            <div className="space-y-3 border border-border rounded-md p-3">
              <div className="grid sm:grid-cols-3 gap-3">
                <Field label="Contact every (days)">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={fields.contactEveryDays}
                    onChange={(e) => setFields((f) => ({ ...f, contactEveryDays: e.target.value }))}
                    className={inputCls}
                    placeholder="14, 30, 90..."
                  />
                </Field>
                <Field label="Last contact">
                  <input type="date" value={fields.lastContactAt} onChange={(e) => setFields((f) => ({ ...f, lastContactAt: e.target.value }))} className={inputCls} />
                </Field>
                <Field label="Contact person">
                  <input value={fields.contactName} onChange={(e) => setFields((f) => ({ ...f, contactName: e.target.value }))} className={inputCls} placeholder="Who we talk to there" />
                </Field>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Customer name">
                  <input value={fields.name} onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="Person or company" />
                </Field>
                <Field label="Where they came from">
                  <select value={fields.source} onChange={(e) => setFields((f) => ({ ...f, source: e.target.value }))} className={inputCls}>
                    {!LEAD_SOURCES.includes(fields.source as (typeof LEAD_SOURCES)[number]) && fields.source && (
                      <option value={fields.source}>{fields.source}</option>
                    )}
                    {LEAD_SOURCES.map((s) => (
                      <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Phone">
                  <input type="tel" value={fields.phone} onChange={(e) => setFields((f) => ({ ...f, phone: e.target.value }))} className={inputCls} />
                </Field>
                <Field label="Email">
                  <input type="email" value={fields.email} onChange={(e) => setFields((f) => ({ ...f, email: e.target.value }))} className={inputCls} />
                </Field>
                <Field label="Address">
                  <input value={fields.address} onChange={(e) => setFields((f) => ({ ...f, address: e.target.value }))} className={inputCls} />
                </Field>
                <Field label="What they want">
                  <input value={fields.serviceType} onChange={(e) => setFields((f) => ({ ...f, serviceType: e.target.value }))} className={inputCls} />
                </Field>
                <Field label="Walk date (goes on the shared calendar)">
                  <div className="flex gap-2">
                    <input type="date" value={fields.appointmentAt} onChange={(e) => setFields((f) => ({ ...f, appointmentAt: e.target.value }))} className={inputCls} />
                    <input type="time" value={fields.appointmentTime} onChange={(e) => setFields((f) => ({ ...f, appointmentTime: e.target.value }))} className={`${inputCls} w-32`} />
                  </div>
                </Field>
                <Field label="Objection (if lost or stalled)">
                  <input value={fields.objection} onChange={(e) => setFields((f) => ({ ...f, objection: e.target.value }))} className={inputCls} placeholder="Price, timing, went with someone else..." />
                </Field>
                <Field label="Cash collected">
                  <input inputMode="decimal" value={fields.cashCollected} onChange={(e) => setFields((f) => ({ ...f, cashCollected: e.target.value }))} className={inputCls} placeholder="$" />
                </Field>
                <Field label="Total sale">
                  <input inputMode="decimal" value={fields.saleAmount} onChange={(e) => setFields((f) => ({ ...f, saleAmount: e.target.value }))} className={inputCls} placeholder="$" />
                </Field>
              </div>
              <Field label="Our notes">
                <textarea rows={3} value={fields.notes} onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))} className={`${inputCls} resize-none`} />
              </Field>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={saveFields} disabled={saving} className={`px-4 py-2 ${tap} text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50 flex items-center gap-2`}>
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save details
                </button>
                <button
                  onClick={() => {
                    setFields(snapshotOf(lead));
                    setEditing(false);
                    setCalMsg("");
                  }}
                  className={`px-4 py-2 ${tap} text-sm border border-border rounded-md hover:bg-muted`}
                >
                  Close
                </button>
                {calMsg && <span className="text-sm text-muted-foreground">{calMsg}</span>}
                {lead.calendarEventUrl && (
                  <a href={lead.calendarEventUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                    Open calendar event
                  </a>
                )}
              </div>
            </div>
          )}

          <LeadQuotes lead={lead} />

          <PartnerJobs lead={lead} leads={allLeads} onOpenLead={onOpenLead} />

          {(lead.email || lead.sourceNotes || lead.adSet || lead.leadAt) && (
            <div className="text-sm text-muted-foreground space-y-1 border-t border-border pt-3">
              {lead.email && (
                <p>
                  <a href={`mailto:${lead.email}`} className="text-primary hover:underline">{lead.email}</a>
                </p>
              )}
              {lead.leadAt && <p>Came in {lead.leadAt}{lead.isOwner ? ` · owner: ${lead.isOwner}` : ""}</p>}
              {lead.adSet && <p>Ad: {lead.creative || lead.adSet}</p>}
              {lead.sourceNotes && <p>Marketing firm notes: {lead.sourceNotes}</p>}
            </div>
          )}

          {activity.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">History</p>
              <ul className="space-y-1 text-sm">
                {activity.map((a, i) => (
                  <li key={i} className="flex flex-wrap gap-x-2">
                    <span className="text-muted-foreground whitespace-nowrap">{fmtWhen(a.ts)}</span>
                    <span className="text-muted-foreground capitalize">
                      {a.type === "attempt" ? "call attempt" : a.type}
                      {a.via === "sheet" ? " (sheet)" : a.via === "voice" ? " (voice)" : ""}
                    </span>
                    <span>{a.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ImportPanel({ onDone }: { onDone: () => void }) {
  const { getIdToken } = useAuth();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [letter, setLetter] = useState("3");
  const [cLetter, setCLetter] = useState("2");
  const [date, setDate] = useState(todayISO());

  const run = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    setMsg("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const res = await fetch("/api/admin/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      const extra = [
        json.skipped ? `${json.skipped} already had a lead` : "",
        json.notOnList ? `${json.notOnList} not on that letter's list, skipped` : "",
      ]
        .filter(Boolean)
        .join(", ");
      setMsg(`Done: ${json.created} added, ${json.updated ?? 0} updated${extra ? `. ${extra}.` : "."}`);
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy("");
    }
  };

  const btn = "px-3 py-2 text-sm border border-border rounded-md hover:bg-muted disabled:opacity-50 flex items-center gap-2";
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <p className="text-sm text-muted-foreground">
        Safe to run more than once. Nothing gets duplicated.
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <button className={btn} disabled={!!busy} onClick={() => run("quotes", { source: "quotes" })}>
          {busy === "quotes" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Pull in website quotes that have no lead
        </button>
        <button className={btn} disabled={!!busy} onClick={() => run("camp", { source: "campgrounds" })}>
          {busy === "camp" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Add the 106 campgrounds (letters 1 and 2 logged)
        </button>
        <button className={btn} disabled={!!busy} onClick={() => run("contractors", { source: "contractors" })}>
          {busy === "contractors" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Add the 278 contractors (letter 1 logged on the 94)
        </button>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm">Log a mailed contractor letter on the people who got it:</span>
        <select value={cLetter} onChange={(e) => setCLetter(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="1">Letter 1 (the 94)</option>
          <option value="2">Letter 2 (the 217 core list)</option>
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} w-auto`} />
        <button
          className={btn}
          disabled={!!busy}
          onClick={() => run("cletter", { source: "contractors", letter: Number(cLetter), date })}
        >
          {busy === "cletter" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Log it
        </button>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm">Log a mailed letter on every campground on the list:</span>
        <select value={letter} onChange={(e) => setLetter(e.target.value)} className={`${inputCls} w-auto`}>
          {[3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              Letter {n}
            </option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} w-auto`} />
        <button
          className={btn}
          disabled={!!busy}
          onClick={() => run("letter", { source: "campgrounds", letter: Number(letter), date })}
        >
          {busy === "letter" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Log it
        </button>
      </div>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}

/**
 * Filters with a count each. On a phone they sit in one row that scrolls
 * sideways (bleeding to the screen edges) instead of wrapping into four rows
 * of bubbles; the chosen one is scrolled into view. From the small breakpoint
 * up they wrap as before.
 */
function FilterChips({
  chips,
  active,
  onPick,
}: {
  chips: Array<{ key: Filter; label: string; n: number }>;
  active: Filter;
  onPick: (f: Filter) => void;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [active]);
  return (
    <div
      role="tablist"
      aria-label="Lead filters"
      className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0"
    >
      {chips.map((c) => {
        const on = active === c.key;
        return (
          <button
            key={c.key}
            ref={on ? activeRef : undefined}
            role="tab"
            aria-selected={on}
            onClick={() => onPick(c.key)}
            className={`shrink-0 flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 ${tap} rounded-full text-sm border transition-colors ${
              on
                ? "bg-primary text-primary-foreground border-primary"
                : c.n === 0
                  ? "border-border text-muted-foreground/60 hover:text-foreground hover:bg-muted"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {c.label}
            <span
              className={`min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-xs tabular-nums text-center ${
                on ? "bg-primary-foreground/20" : "bg-muted"
              }`}
            >
              {c.n}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function QuoteButton({ lead }: { lead: Lead }) {
  const { getIdToken } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const q = lead.quote;
  const many = (lead.quoteCount || 0) > 1;
  const label = many
    ? `${lead.quoteCount} quotes · latest ${q?.status || "draft"}`
    : q && q.version
      ? `Quote · ${q.total ? `$${Math.round(q.total).toLocaleString()}` : ""} · ${q.status}`
      : lead.quoteId
        ? "Open quote"
        : "Make a quote";
  const go = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("no token");
      const { quoteId } = await ensureQuoteForLead(lead.id, token);
      router.push(`/admin/quotes/${quoteId}`);
    } catch {
      setBusy(false);
      alert("Couldn't open the quote. Try again.");
    }
  };
  if (lead.stage === "not_a_lead") return null;
  return (
    <button
      onClick={go}
      disabled={busy}
      className={`text-sm sm:text-xs px-2.5 py-1 ${tap} max-w-full rounded-md border flex items-center gap-1 capitalize ${
        q?.status === "accepted"
          ? "border-accent text-accent"
          : q?.version
            ? "border-primary text-primary"
            : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin shrink-0" /> : <FileText className="h-3 w-3 shrink-0" />}
      <span className="truncate">{label}</span>
    </button>
  );
}

function CloseOut({ lead, onSave }: { lead: Lead; onSave: SaveFn }) {
  const [mode, setMode] = useState<"" | "no" | "not">("");
  const chip = `px-3 py-1 ${tap} rounded-full text-sm sm:text-xs border border-border hover:bg-muted`;
  if (lead.stage === "not_a_lead" || lead.stage === "lost") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          {lead.stage === "not_a_lead"
            ? `Marked not a lead${lead.disqualifyReason ? ` (${DISQUALIFY_LABELS[lead.disqualifyReason as keyof typeof DISQUALIFY_LABELS] ?? lead.disqualifyReason})` : ""}.`
            : `Said no${lead.objection ? ` (${lead.objection})` : ""}.`}
        </span>
        <button
          onClick={() =>
            onSave(
              lead,
              { stage: "contacted", disqualifyReason: "", disqualifiedAt: "" },
              { ts: now(), type: "stage", text: "Reopened" }
            )
          }
          className={`underline ${tap} px-1`}
        >
          Reopen
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {mode === "" && (
        <>
          <span className="text-xs text-muted-foreground">Close out:</span>
          <button className={chip} onClick={() => setMode("no")}>Said no</button>
          <button className={chip} onClick={() => setMode("not")}>Not a lead</button>
        </>
      )}
      {mode === "no" && (
        <>
          <span className="text-xs text-muted-foreground">Why?</span>
          {LOST_REASONS.map((r) => (
            <button
              key={r}
              className={chip}
              onClick={() =>
                onSave(
                  lead,
                  { stage: "lost", objection: r, nextAction: "", nextActionAt: "" },
                  { ts: now(), type: "stage", text: `Said no: ${r}` }
                )
              }
            >
              {r}
            </button>
          ))}
          <button className={`text-sm sm:text-xs underline text-muted-foreground ${tap} px-1`} onClick={() => setMode("")}>Cancel</button>
        </>
      )}
      {mode === "not" && (
        <>
          <span className="text-xs text-muted-foreground">Why?</span>
          {DISQUALIFY_REASONS.map((r) => (
            <button
              key={r}
              className={chip}
              onClick={() =>
                onSave(
                  lead,
                  { stage: "not_a_lead", disqualifyReason: r, disqualifiedAt: now(), nextAction: "", nextActionAt: "" },
                  { ts: now(), type: "stage", text: `Not a lead: ${DISQUALIFY_LABELS[r]}` }
                )
              }
            >
              {DISQUALIFY_LABELS[r]}
            </button>
          ))}
          <button className={`text-sm sm:text-xs underline text-muted-foreground ${tap} px-1`} onClick={() => setMode("")}>Cancel</button>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function AddLeadForm({ onDone }: { onDone: () => void }) {
  const { getIdToken } = useAuth();
  const [f, setF] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    serviceType: "",
    source: "phone",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      await createDocument(
        "leads",
        {
          ...f,
          stage: "new",
          nextAction: "Call back",
          nextActionAt: todayISO(),
          touched: true,
          activity: [{ ts: now(), type: "system", text: "Added by hand" }],
        },
        token
      );
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't add the lead");
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <input required value={f.name} onChange={set("name")} placeholder="Name *" className={inputCls} />
        <input type="tel" value={f.phone} onChange={set("phone")} placeholder="Phone" className={inputCls} />
        <input type="email" value={f.email} onChange={set("email")} placeholder="Email" className={inputCls} />
        <input value={f.address} onChange={set("address")} placeholder="Address" className={inputCls} />
        <input value={f.serviceType} onChange={set("serviceType")} placeholder="What they want (water, power, fiber...)" className={inputCls} />
        <select value={f.source} onChange={set("source")} className={inputCls}>
          {LEAD_SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <textarea rows={2} value={f.notes} onChange={set("notes")} placeholder="Notes" className={`${inputCls} resize-none`} />
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className={`px-4 py-2 ${tap} text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50 flex items-center gap-2`}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Add
        </button>
        <button type="button" onClick={onDone} className={`px-4 py-2 ${tap} text-sm border border-border rounded-md hover:bg-muted`}>
          Cancel
        </button>
      </div>
    </form>
  );
}
