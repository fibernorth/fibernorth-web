"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/context/auth-provider";
import { useIsOwner } from "@/hooks/use-is-owner";
import { listAuditLog } from "@/actions/audit-log";
import type { AuditEntry } from "@/services/audit";
import { OwnerOnlyNote } from "@/components/admin/owner-only";

const COLLECTION_LABELS: Record<string, string> = {
  users: "Users",
  integrationSecrets: "Integration keys",
  siteSettings: "Settings",
  siteContent: "Page content",
  quoteRequests: "Quotes",
  marketingSpend: "Marketing spend",
  linkStats: "Letter counters",
  blog: "Blog",
  projects: "Projects",
  majorProjects: "Major projects",
  fleet: "Fleet",
  team: "Team",
  testimonials: "Testimonials",
  jobPostings: "Job postings",
  jobApplications: "Applications",
  bids: "Bids",
  services: "Services",
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(blank)";
  if (typeof v === "string") return v.length > 140 ? `${v.slice(0, 140)}…` : v;
  const t = JSON.stringify(v);
  return t.length > 140 ? `${t.slice(0, 140)}…` : t;
}

/** One line per field: "field: before → after". */
function changes(e: AuditEntry): Array<{ k: string; b: string; a: string }> {
  const keys = [...new Set([...Object.keys(e.before ?? {}), ...Object.keys(e.after ?? {})])];
  return keys.map((k) => ({
    k,
    b: e.before ? show(e.before[k]) : "",
    a: e.after ? show(e.after[k]) : "",
  }));
}

export default function ChangeLogPage() {
  const { getIdToken } = useAuth();
  const isOwner = useIsOwner();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState("");
  const [col, setCol] = useState("");
  const [person, setPerson] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) return;
      setEntries(await listAuditLog(token, { col: col || undefined, actor: person || undefined }));
    } catch {
      setError("Couldn't load the change log.");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, col, person]);

  useEffect(() => {
    if (isOwner) void load();
  }, [isOwner, load]);

  const people = useMemo(
    () => [...new Set((entries ?? []).map((e) => e.actor?.email).filter(Boolean))].sort(),
    [entries]
  );

  if (!isOwner) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Change log</h1>
        <OwnerOnlyNote />
      </div>
    );
  }

  const selectCls = "px-3 py-2 min-h-11 sm:min-h-0 bg-muted border border-border rounded-md text-sm";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <History className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold mr-auto">Change log</h1>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="px-3 py-2 text-sm border border-border rounded-md hover:bg-muted flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        Who changed what in the admin, newest first: users, settings, integration keys (which ones, never the
        values), page content, CMS entries, quotes, deletes and restores, and marketing spend. Lead changes are on
        each lead&apos;s history.
      </p>

      <div className="flex flex-wrap gap-3">
        <select value={col} onChange={(e) => setCol(e.target.value)} className={selectCls} aria-label="What">
          <option value="">Everything</option>
          {Object.entries(COLLECTION_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select value={person} onChange={(e) => setPerson(e.target.value)} className={selectCls} aria-label="Who">
          <option value="">Everyone</option>
          {person && !people.includes(person) && <option value={person}>{person}</option>}
          {people.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {entries === null ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        <ul className="bg-card border border-border rounded-lg divide-y divide-border">
          {entries.map((e) => (
            <li key={e.id} className="px-4 py-3 space-y-1 text-sm">
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                <span className="text-muted-foreground whitespace-nowrap">{fmtWhen(e.at)}</span>
                <span className="font-medium">{e.actor?.email || e.actor?.uid}</span>
                <span className="text-muted-foreground">{e.action}</span>
                <span className="text-muted-foreground break-all">
                  {COLLECTION_LABELS[e.target?.col] ?? e.target?.col} / {e.target?.id}
                </span>
              </div>
              {e.note && <p className="text-muted-foreground">{e.note}</p>}
              <ul className="space-y-0.5">
                {changes(e).map((c) => (
                  <li key={c.k} className="break-words">
                    <span className="text-muted-foreground">{c.k}:</span>{" "}
                    {e.before && e.after ? (
                      <>
                        <span className="line-through decoration-destructive/60">{c.b}</span> → <span>{c.a}</span>
                      </>
                    ) : e.after ? (
                      <span>{c.a}</span>
                    ) : (
                      <span className="line-through decoration-destructive/60">{c.b}</span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
