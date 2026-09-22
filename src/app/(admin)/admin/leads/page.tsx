"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { orderBy } from "firebase/firestore";
import {
  Users,
  Plus,
  Loader2,
  Phone,
  MessageSquare,
  Mail,
  Footprints,
  FileText,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";
import { useFirestoreCollection } from "@/hooks/use-firestore-collection";
import { useAuth } from "@/context/auth-provider";
import { createDocument, updateDocument } from "@/actions/crud";
import {
  LEAD_STAGES,
  STAGE_LABELS,
  OPEN_STAGES,
  LEAD_SOURCES,
  SOURCE_LABELS,
  todayISO,
  type Lead,
  type LeadActivity,
  type LeadStage,
} from "@/lib/leads";

const inputCls =
  "w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary";

const STAGE_STYLES: Record<string, string> = {
  new: "bg-primary/15 text-primary",
  contacted: "bg-secondary/15 text-secondary",
  walk_scheduled: "bg-secondary/15 text-secondary",
  walk_done: "bg-accent/15 text-accent",
  quoted: "bg-accent/15 text-accent",
  won: "bg-accent/25 text-accent",
  nurture: "bg-muted text-muted-foreground",
  lost: "bg-muted text-muted-foreground line-through",
};

type Filter = "due" | "open" | LeadStage | "all";

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
  const refetch = () => setTick((t) => t + 1);
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>("due");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(params.get("lead"));
  const [adding, setAdding] = useState(false);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  useEffect(() => {
    const id = params.get("lead");
    if (id) {
      setOpenId(id);
      setFilter("all");
    }
  }, [params]);

  const counts = useMemo(() => {
    const today = todayISO();
    const due = data.filter(
      (l) => OPEN_STAGES.includes(l.stage as LeadStage) && (l.nextActionAt || "") <= today && (l.nextActionAt || l.stage === "new")
    ).length;
    const open = data.filter((l) => OPEN_STAGES.includes(l.stage as LeadStage)).length;
    return { due, open };
  }, [data]);

  const visible = useMemo(() => {
    const today = todayISO();
    const needle = q.trim().toLowerCase();
    return data
      .filter((l) => {
        if (filter === "due")
          return (
            OPEN_STAGES.includes(l.stage as LeadStage) &&
            ((l.nextActionAt || "") <= today && (l.nextActionAt || l.stage === "new"))
          );
        if (filter === "open") return OPEN_STAGES.includes(l.stage as LeadStage);
        if (filter === "all") return true;
        return l.stage === filter;
      })
      .filter((l) => !source || l.source === source)
      .filter(
        (l) =>
          !needle ||
          [l.name, l.phone, l.email, l.address, l.serviceType, l.sourceNotes, l.notes]
            .join(" ")
            .toLowerCase()
            .includes(needle)
      )
      .sort((a, b) => {
        if (filter === "due") return (a.nextActionAt || "").localeCompare(b.nextActionAt || "");
        return 0;
      });
  }, [data, filter, source, q]);

  const save = async (lead: Lead, patch: Partial<Lead>, activity?: LeadActivity) => {
    setRowError((p) => ({ ...p, [lead.id]: "" }));
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const next: Record<string, unknown> = { ...patch, touched: true };
      if (activity) next.activity = [...(lead.activity || []), activity];
      await updateDocument("leads", lead.id, next, token);
      if (live.error) refetch();
    } catch (e) {
      setRowError((p) => ({
        ...p,
        [lead.id]: e instanceof Error ? e.message : "Couldn't save, try again",
      }));
    }
  };

  const chips: Array<{ key: Filter; label: string; n?: number }> = [
    { key: "due", label: "Due", n: counts.due },
    { key: "open", label: "Open", n: counts.open },
    ...LEAD_STAGES.map((s) => ({ key: s as Filter, label: STAGE_LABELS[s] })),
    { key: "all", label: "All" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Leads</h1>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add lead
        </button>
      </div>

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

      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              filter === c.key
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {c.label}
            {typeof c.n === "number" && (
              <span className="ml-1.5 text-xs opacity-80">{c.n}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
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
          {filter === "due" ? "Nothing due. Nice." : "No leads here."}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              open={openId === lead.id}
              onToggle={() => setOpenId(openId === lead.id ? null : lead.id)}
              onSave={save}
              error={rowError[lead.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LeadCard({
  lead,
  open,
  onToggle,
  onSave,
  error,
}: {
  lead: Lead;
  open: boolean;
  onToggle: () => void;
  onSave: (lead: Lead, patch: Partial<Lead>, activity?: LeadActivity) => Promise<void>;
  error?: string;
}) {
  const due = dueLabel(lead.nextActionAt);
  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState<LeadActivity["type"]>("call");
  const [next, setNext] = useState({ text: lead.nextAction || "", date: lead.nextActionAt || "" });
  const [fields, setFields] = useState({
    address: lead.address || "",
    notes: lead.notes || "",
    appointmentAt: lead.appointmentAt || "",
    objection: lead.objection || "",
    cashCollected: lead.cashCollected || "",
    saleAmount: lead.saleAmount || "",
    serviceType: lead.serviceType || "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNext({ text: lead.nextAction || "", date: lead.nextActionAt || "" });
    setFields({
      address: lead.address || "",
      notes: lead.notes || "",
      appointmentAt: lead.appointmentAt || "",
      objection: lead.objection || "",
      cashCollected: lead.cashCollected || "",
      saleAmount: lead.saleAmount || "",
      serviceType: lead.serviceType || "",
    });
  }, [lead]);

  const changeStage = async (stage: string) => {
    await onSave(
      lead,
      { stage },
      { ts: new Date().toISOString(), type: "stage", text: `Moved to ${STAGE_LABELS[stage as LeadStage] ?? stage}` }
    );
  };

  const addActivity = async () => {
    if (!note.trim()) return;
    setSaving(true);
    await onSave(lead, {}, { ts: new Date().toISOString(), type: noteType, text: note.trim() });
    setNote("");
    setSaving(false);
  };

  const saveNext = async () => {
    setSaving(true);
    await onSave(lead, { nextAction: next.text, nextActionAt: next.date });
    setSaving(false);
  };

  const clearNext = async () => {
    setSaving(true);
    await onSave(
      lead,
      { nextAction: "", nextActionAt: "" },
      { ts: new Date().toISOString(), type: "system", text: `Done: ${lead.nextAction || "follow-up"}` }
    );
    setNext({ text: "", date: "" });
    setSaving(false);
  };

  const saveFields = async () => {
    setSaving(true);
    await onSave(lead, fields);
    setSaving(false);
  };

  const activity = [...(lead.activity || [])].sort((a, b) => b.ts.localeCompare(a.ts));

  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="px-4 py-3 flex items-start gap-3">
        <button onClick={onToggle} className="flex-1 text-left min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-semibold">{lead.name || "(no name)"}</span>
            {lead.serviceType && (
              <span className="text-sm text-muted-foreground">· {lead.serviceType}</span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {SOURCE_LABELS[lead.source as keyof typeof SOURCE_LABELS] ?? lead.source}
            </span>
          </div>
          <div className="text-sm text-muted-foreground mt-0.5 truncate">
            {lead.address || lead.email || (lead.sourceNotes || "").slice(0, 90)}
          </div>
          {(lead.nextAction || lead.nextActionAt) && (
            <div className="text-sm mt-1">
              <span className={due.cls}>{due.text}</span>
              {lead.nextAction && <span className="ml-2">{lead.nextAction}</span>}
            </div>
          )}
        </button>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <select
            value={lead.stage}
            onChange={(e) => changeStage(e.target.value)}
            className={`text-xs px-2.5 py-1 rounded-full border-0 cursor-pointer ${STAGE_STYLES[lead.stage] ?? "bg-muted"}`}
          >
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
          {lead.phone && (
            <a
              href={`tel:${lead.phone}`}
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <Phone className="h-3.5 w-3.5" />
              {lead.phone}
            </a>
          )}
          <button onClick={onToggle} className="text-muted-foreground">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-3 border border-destructive/50 bg-destructive/10 text-destructive rounded-md p-2 text-sm">
          {error}
        </div>
      )}

      {open && (
        <div className="border-t border-border px-4 py-4 space-y-5">
          {/* Log something */}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["call", Phone, "Call"],
                  ["text", MessageSquare, "Text"],
                  ["email", Mail, "Email"],
                  ["walk", Footprints, "Walk"],
                  ["note", FileText, "Note"],
                ] as const
              ).map(([t, Icon, label]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNoteType(t)}
                  className={`px-2.5 py-1 rounded-md text-xs border flex items-center gap-1 ${
                    noteType === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addActivity()}
                placeholder="What happened? (Enter to save)"
                className={inputCls}
              />
              <button
                onClick={addActivity}
                disabled={saving || !note.trim()}
                className="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50"
              >
                Log
              </button>
            </div>
          </div>

          {/* Next action */}
          <div className="grid sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Next action</label>
              <input
                value={next.text}
                onChange={(e) => setNext((n) => ({ ...n, text: e.target.value }))}
                placeholder="Call back, send quote, walk the site..."
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">When</label>
              <input
                type="date"
                value={next.date}
                onChange={(e) => setNext((n) => ({ ...n, date: e.target.value }))}
                className={inputCls}
              />
            </div>
            <button onClick={saveNext} disabled={saving} className="px-3 py-2 text-sm border border-border rounded-md hover:bg-muted">
              Set
            </button>
            <button
              onClick={clearNext}
              disabled={saving || !(lead.nextAction || lead.nextActionAt)}
              className="px-3 py-2 text-sm bg-accent/15 text-accent rounded-md disabled:opacity-40"
            >
              Done
            </button>
          </div>

          {/* Details */}
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Address">
              <input value={fields.address} onChange={(e) => setFields((f) => ({ ...f, address: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="What they want">
              <input value={fields.serviceType} onChange={(e) => setFields((f) => ({ ...f, serviceType: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Appointment / walk date">
              <input type="date" value={fields.appointmentAt} onChange={(e) => setFields((f) => ({ ...f, appointmentAt: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Objection (if lost or stalled)">
              <input value={fields.objection} onChange={(e) => setFields((f) => ({ ...f, objection: e.target.value }))} className={inputCls} placeholder="Price, timing, went with someone else..." />
            </Field>
            <Field label="Cash collected">
              <input value={fields.cashCollected} onChange={(e) => setFields((f) => ({ ...f, cashCollected: e.target.value }))} className={inputCls} placeholder="$" />
            </Field>
            <Field label="Total sale">
              <input value={fields.saleAmount} onChange={(e) => setFields((f) => ({ ...f, saleAmount: e.target.value }))} className={inputCls} placeholder="$" />
            </Field>
          </div>
          <Field label="Our notes">
            <textarea rows={3} value={fields.notes} onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))} className={`${inputCls} resize-none`} />
          </Field>
          <div className="flex items-center gap-3">
            <button onClick={saveFields} disabled={saving} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save details
            </button>
            {lead.quoteId && (
              <Link href="/admin/quotes" className="text-sm text-primary hover:underline">
                Open quote and map (Bore-ON push lives there)
              </Link>
            )}
          </div>

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
                  <li key={i} className="flex gap-2">
                    <span className="text-muted-foreground whitespace-nowrap">{fmtWhen(a.ts)}</span>
                    <span className="text-muted-foreground capitalize">{a.type}</span>
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
      const now = new Date().toISOString();
      await createDocument(
        "leads",
        {
          ...f,
          stage: "new",
          nextAction: "Call back",
          nextActionAt: todayISO(),
          touched: true,
          activity: [{ ts: now, type: "system", text: "Added by hand" }],
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
        <input value={f.phone} onChange={set("phone")} placeholder="Phone" className={inputCls} />
        <input value={f.email} onChange={set("email")} placeholder="Email" className={inputCls} />
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
        <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50 flex items-center gap-2">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Add
        </button>
        <button type="button" onClick={onDone} className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted">
          Cancel
        </button>
      </div>
    </form>
  );
}
