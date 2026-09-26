"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutDashboard, MailOpen, Phone, FileText, Trophy, DollarSign, Loader2, AlertTriangle } from "lucide-react";
import { useFirestoreCollection } from "@/hooks/use-firestore-collection";
import { useToday } from "@/hooks/use-today";
import { LEAD_STAGES, STAGE_LABELS, countByStage, type Lead } from "@/lib/leads";
import { sumLastDays } from "@/lib/link-stats";
import { cn } from "@/lib/utils";
import {
  SPEND_SOURCES,
  callsToday,
  costPerWonBySource,
  monthsBack,
  openQuotes,
  quoteWinRate,
  sourceLabel,
  wonLastDays,
  wonThisMonth,
  type MonthSpend,
} from "@/lib/sales-metrics";
import { loadMarketingSpend, saveMarketingSpend } from "@/actions/marketing-spend";
import { useAuth } from "@/context/auth-provider";

const dollars = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** How often the letter-campaign card and the server fallback refresh. */
const LINK_REFRESH_MS = 3 * 60_000;
const FALLBACK_REFRESH_MS = 60_000;
/** Tab-focus refreshes closer together than this are skipped. */
const FOCUS_MIN_GAP_MS = 20_000;

interface LinkStats {
  total?: number;
  days?: Record<string, number>;
  lastVisit?: string | null;
  /** Last 7 Detroit days, counted by the server from the visit log. */
  week?: number;
}

interface Visit {
  id: string;
  ts?: string;
  ip?: string;
  ua?: string;
}

interface LinkStatsResponse {
  camp: LinkStats;
  pros: LinkStats;
  campVisits: Visit[];
  prosVisits: Visit[];
}

function deviceLabel(ua = ""): string {
  if (/iPhone|iPad/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Macintosh/.test(ua)) return "Mac";
  return "Unknown device";
}

/**
 * Run `fn` now, every `intervalMs`, and when the tab comes back into view
 * (at most once per FOCUS_MIN_GAP_MS). Off while `enabled` is false.
 */
function usePolling(fn: () => void, intervalMs: number, enabled = true) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);
  useEffect(() => {
    if (!enabled) return;
    let last = 0;
    const run = () => {
      last = Date.now();
      fnRef.current();
    };
    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < FOCUS_MIN_GAP_MS) return;
      run();
    };
    run();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, intervalMs);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [intervalMs, enabled]);
}

type LoadState = "loading" | "error" | "ready";

/**
 * Leads for the dashboard: the live subscription, or (like the Leads page)
 * the Admin SDK route when the live read is refused, refreshed every minute
 * and on tab focus. Never reports an empty list as real while loading.
 */
function useDashboardLeads(): { leads: Lead[]; state: LoadState; viaServer: boolean; error: string } {
  const live = useFirestoreCollection<Lead>("leads");
  const { getIdToken } = useAuth();
  const [fallback, setFallback] = useState<Lead[] | null>(null);
  const [fallbackError, setFallbackError] = useState("");

  const loadFallback = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Signed out. Sign in again.");
      const res = await fetch("/api/admin/leads", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!res.ok) throw new Error(`Couldn't load leads (${res.status})`);
      const json = (await res.json()) as { leads: Lead[] };
      setFallback(json.leads);
      setFallbackError("");
    } catch (e) {
      setFallbackError(e instanceof Error ? e.message : "Couldn't load leads");
    }
  }, [getIdToken]);
  usePolling(() => void loadFallback(), FALLBACK_REFRESH_MS, Boolean(live.error));

  if (!live.error) {
    return { leads: live.data, state: live.loading ? "loading" : "ready", viaServer: false, error: "" };
  }
  // Keep showing the last good server copy if a refresh fails.
  if (fallback) return { leads: fallback, state: "ready", viaServer: true, error: fallbackError };
  return { leads: [], state: fallbackError ? "error" : "loading", viaServer: true, error: fallbackError };
}

/** A count that isn't a number yet: spinner while loading, "?" on error. */
function Pending({ state, className }: { state: LoadState; className?: string }) {
  if (state === "error") return <span className={cn("text-destructive", className)} title="Couldn't load">?</span>;
  return <Loader2 className={cn("h-4 w-4 animate-spin inline text-muted-foreground", className)} aria-label="Loading" />;
}

function collectionState(c: { loading: boolean; error: Error | null }): LoadState {
  return c.error ? "error" : c.loading ? "loading" : "ready";
}

export default function AdminDashboard() {
  const quotesC = useFirestoreCollection("quoteRequests");
  const applicationsC = useFirestoreCollection("jobApplications");
  const blogC = useFirestoreCollection("blog");
  const projectsC = useFirestoreCollection("projects");
  const bidsC = useFirestoreCollection("bids");
  const { leads: leadList, state: leadsState, viaServer, error: leadsError } = useDashboardLeads();
  const { getIdToken } = useAuth();
  // Same rules and the same Michigan "today" as the Leads page, kept current.
  const todayStr = useToday();

  // Letter-campaign stats come from a server route (Admin SDK), not a direct
  // client Firestore read, so the card works regardless of whether the
  // linkStats client-read rules are published. Refreshed every few minutes
  // and when the tab comes back into view.
  const [linkData, setLinkData] = useState<LinkStatsResponse | null>(null);
  const [linkError, setLinkError] = useState(false);
  const [linkAt, setLinkAt] = useState<number | null>(null);
  const loadLinks = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/admin/link-stats", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as LinkStatsResponse;
      setLinkData(json);
      setLinkError(false);
      setLinkAt(Date.now());
    } catch {
      setLinkError(true);
    }
  }, [getIdToken]);
  usePolling(() => void loadLinks(), LINK_REFRESH_MS);
  const linkState: LoadState = linkData ? "ready" : linkError ? "error" : "loading";

  const campStats = linkData?.camp;
  const prosStats = linkData?.pros;

  const recentVisits = [
    ...(linkData?.campVisits ?? []).map((v) => ({ ...v, link: "/camp" })),
    ...(linkData?.prosVisits ?? []).map((v) => ({ ...v, link: "/pros" })),
  ]
    .sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""))
    .slice(0, 12);

  // Last 7 Detroit days: the server's count from the visit log when it sent
  // one, else the day map summed by Detroit day.
  const weekOf = (st?: LinkStats) => (typeof st?.week === "number" ? st.week : sumLastDays(st?.days, todayStr, 7));

  const openBids = (bidsC.data as Array<Record<string, unknown>>).filter((b) =>
    ["tracking", "bidding", "submitted"].includes(String(b.status))
  ).length;

  const calls = useMemo(() => callsToday(leadList, todayStr), [leadList, todayStr]);
  const open = useMemo(() => openQuotes(leadList, todayStr), [leadList, todayStr]);
  const win = useMemo(() => quoteWinRate(leadList, todayStr, 90), [leadList, todayStr]);
  const month = useMemo(() => wonThisMonth(leadList, todayStr), [leadList, todayStr]);
  const recent = useMemo(() => wonLastDays(leadList, todayStr, 90), [leadList, todayStr]);

  const byStage = countByStage(leadList as Array<{ stage?: string }>);
  const newQuotes = (quotesC.data as Array<Record<string, unknown>>).filter((q) => q.status === "new").length;
  const newApps = (applicationsC.data as Array<Record<string, unknown>>).filter((a) => a.status === "new").length;

  const contentLinks = [
    { label: "Quote requests", n: newQuotes, note: "new", href: "/admin/quotes", state: collectionState(quotesC) },
    { label: "Bids", n: openBids, note: "open", href: "/admin/bids", state: collectionState(bidsC) },
    { label: "Applications", n: newApps, note: "new", href: "/admin/applications", state: collectionState(applicationsC) },
    { label: "Blog", n: blogC.data.length, note: "posts", href: "/admin/blog", state: collectionState(blogC) },
    { label: "Projects", n: projectsC.data.length, note: "", href: "/admin/projects", state: collectionState(projectsC) },
  ];
  const leadsReady = leadsState === "ready";

  const card = "bg-card border border-border rounded-lg p-4 sm:p-5";
  const small = "text-sm text-muted-foreground";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <LayoutDashboard className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Dashboard</h1>
      </div>

      {viaServer && leadsReady && (
        <p className="text-xs text-muted-foreground border border-border rounded-md px-3 py-2">
          Live updates aren&apos;t available, so these numbers are a copy from the server, refreshed every minute.
          {leadsError ? <span className="text-destructive"> Last refresh failed: {leadsError}</span> : null}
        </p>
      )}

      {!leadsReady ? (
        <div
          role={leadsState === "error" ? "alert" : "status"}
          className={cn(
            card,
            "flex items-center gap-3 text-sm",
            leadsState === "error" && "border-destructive/50 bg-destructive/10 text-destructive"
          )}
        >
          {leadsState === "error" ? (
            <>
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>
                Couldn&apos;t load the leads, so the sales numbers aren&apos;t shown. {leadsError} It will try again
                every minute; if it keeps happening, sign out and back in.
              </span>
            </>
          ) : (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">Loading leads…</span>
            </>
          )}
        </div>
      ) : (
      <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Link href="/admin/leads?filter=due" className={cn(card, "hover:border-primary/50 transition-colors block")}>
          <div className="flex items-center justify-between">
            <p className={small}>Leads to call today</p>
            <Phone className="h-5 w-5 text-primary opacity-60" />
          </div>
          <p className="text-3xl font-bold mt-1">{calls.total}</p>
          {calls.bySource.length > 0 ? (
            <ul className="mt-2 text-sm space-y-0.5">
              {calls.bySource.map((s) => (
                <li key={s.source} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="tabular-nums">{s.n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={cn(small, "mt-2")}>Nothing due. Nice.</p>
          )}
        </Link>

        <div className={card}>
          <div className="flex items-center justify-between">
            <p className={small}>Open quotes</p>
            <FileText className="h-5 w-5 text-secondary opacity-60" />
          </div>
          <p className="text-3xl font-bold mt-1">
            {open.count} <span className="text-lg font-semibold text-muted-foreground">· {dollars(open.dollars)}</span>
          </p>
          {open.oldest && open.oldestDays !== null && (
            <p className="text-sm mt-2">
              <span className="text-muted-foreground">Oldest: </span>
              <Link href={`/admin/leads?lead=${open.oldest.id}`} className="text-primary hover:underline">
                {open.oldest.name || "(no name)"}
              </Link>
              , {open.oldestDays} {open.oldestDays === 1 ? "day" : "days"}
            </p>
          )}
          {open.expiringSoon.length > 0 && (
            <div className="text-sm mt-1">
              <span className="text-destructive font-medium">Expiring this week: </span>
              {open.expiringSoon.map(({ lead, expires }, i) => (
                <span key={lead.id}>
                  {i > 0 && ", "}
                  <Link href={`/admin/leads?lead=${lead.id}`} className="text-primary hover:underline">
                    {lead.name || "(no name)"}
                  </Link>{" "}
                  <span className="text-muted-foreground">({expires.slice(5)})</span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className={card}>
          <div className="flex items-center justify-between">
            <p className={small}>Win rate on quotes sent (90 days)</p>
            <Trophy className="h-5 w-5 text-accent opacity-60" />
          </div>
          <p className="text-3xl font-bold mt-1">{win.rate === null ? "—" : `${Math.round(win.rate * 100)}%`}</p>
          <p className="text-sm mt-2 text-muted-foreground">
            {win.sent
              ? `${win.won} won of ${win.sent} sent · ${win.lost} said no · ${win.open} still open`
              : "No quotes sent in the last 90 days."}
          </p>
        </div>

        <div className={card}>
          <div className="flex items-center justify-between">
            <p className={small}>Won this month</p>
            <DollarSign className="h-5 w-5 text-accent opacity-60" />
          </div>
          <p className="text-3xl font-bold mt-1">{dollars(month.dollars)}</p>
          <p className="text-sm mt-2 text-muted-foreground">
            {month.count} {month.count === 1 ? "job" : "jobs"}
            {month.avgJob !== null ? ` · avg ${dollars(month.avgJob)}` : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            Avg job, last 90 days: {recent.avgJob !== null ? dollars(recent.avgJob) : "—"}
            {recent.count ? ` (${recent.count})` : ""}
          </p>
        </div>
      </div>

      <CostPerWonJob leads={leadList} today={todayStr} />

      {/* Every lead stage with its count; one row that scrolls sideways on a phone. */}
      <div className="bg-card border border-border rounded-lg p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-base font-semibold">Leads by stage</h2>
          <Link href="/admin/leads?filter=all" className="text-sm text-primary hover:underline">
            All leads
          </Link>
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0">
          {LEAD_STAGES.map((stage) => (
            <Link
              key={stage}
              href={`/admin/leads?filter=${stage}`}
              className={`shrink-0 flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full text-sm border border-border hover:bg-muted transition-colors ${
                byStage[stage] === 0 ? "text-muted-foreground/60" : "text-foreground"
              }`}
            >
              {STAGE_LABELS[stage]}
              <span className="min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-xs tabular-nums text-center bg-muted">
                {byStage[stage]}
              </span>
            </Link>
          ))}
        </div>
      </div>
      </>
      )}

      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-3">
          <MailOpen className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Letter Campaign — fibernorth.com/camp</h2>
        </div>
        {linkError && (
          <div
            role="alert"
            className="border border-destructive/50 bg-destructive/10 text-destructive rounded-lg p-4 text-sm mb-4"
          >
            {linkData && linkAt
              ? `Couldn't refresh campaign stats; showing numbers from ${new Date(linkAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. It will try again in a few minutes.`
              : "Couldn't load campaign stats. It will try again in a few minutes; if it keeps happening, sign out and back in."}
          </div>
        )}
        <div className="flex flex-wrap gap-8 text-sm">
          <div>
            <p className="text-muted-foreground">Total visits</p>
            <p className="text-2xl font-bold mt-0.5">
              {linkState === "ready" ? (campStats?.total ?? 0) : <Pending state={linkState} />}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Last 7 days</p>
            <p className="text-2xl font-bold mt-0.5">
              {linkState === "ready" ? weekOf(campStats) : <Pending state={linkState} />}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Last visit</p>
            <p className="text-sm font-medium mt-2">
              {linkState !== "ready" ? (
                <Pending state={linkState} />
              ) : campStats?.lastVisit ? (
                new Date(campStats.lastVisit).toLocaleString()
              ) : (
                "None yet"
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-8 text-sm mt-4 pt-4 border-t border-border">
          <div>
            <p className="text-muted-foreground">Contractor letters (/pros)</p>
            <p className="text-2xl font-bold mt-0.5">
              {linkState === "ready" ? (prosStats?.total ?? 0) : <Pending state={linkState} />}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Last 7 days</p>
            <p className="text-2xl font-bold mt-0.5">
              {linkState === "ready" ? weekOf(prosStats) : <Pending state={linkState} />}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Last visit</p>
            <p className="text-sm font-medium mt-2">
              {linkState !== "ready" ? (
                <Pending state={linkState} />
              ) : prosStats?.lastVisit ? (
                new Date(prosStats.lastVisit).toLocaleString()
              ) : (
                "None yet"
              )}
            </p>
          </div>
        </div>
        {recentVisits.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-sm font-medium mb-2">Recent visits</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="pr-4 pb-1.5 font-medium">When</th>
                    <th className="pr-4 pb-1.5 font-medium">Link</th>
                    <th className="pr-4 pb-1.5 font-medium">IP</th>
                    <th className="pb-1.5 font-medium">Device</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentVisits.map((v) => (
                    <tr key={`${v.link}-${v.id}`}>
                      <td className="pr-4 py-1.5 whitespace-nowrap">
                        {v.ts ? new Date(v.ts).toLocaleString() : "—"}
                      </td>
                      <td className="pr-4 py-1.5">{v.link}</td>
                      <td className="pr-4 py-1.5">
                        {v.ip && v.ip !== "unknown" ? (
                          <a
                            href={`https://ipinfo.io/${v.ip}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {v.ip}
                          </a>
                        ) : (
                          "unknown"
                        )}
                      </td>
                      <td className="py-1.5">{deviceLabel(v.ua)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Click an IP to see whose network it is — recognize your own and
              you know that visit was you.
            </p>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          Counts everyone who typed a letter link or scanned its QR code.
          Bots are filtered out.
        </p>
      </div>

      <nav aria-label="Website and other sections" className="flex flex-wrap gap-2 text-sm">
        {contentLinks.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="min-h-11 sm:min-h-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            {l.label}
            <span className="tabular-nums text-xs bg-muted rounded-full px-1.5 py-0.5">
              {l.state === "ready" ? l.n : <Pending state={l.state} className="h-3 w-3" />}
              {l.note ? ` ${l.note}` : ""}
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

const RANGES = [
  { key: "1", label: "This month", months: 1 },
  { key: "3", label: "3 months", months: 3 },
  { key: "12", label: "12 months", months: 12 },
] as const;

/**
 * Spend, leads, won jobs and cost per won job by source, with a small form
 * to type in each month's spend (marketingSpend/{YYYY-MM}).
 */
function CostPerWonJob({ leads, today }: { leads: Lead[]; today: string }) {
  const { getIdToken } = useAuth();
  const [spend, setSpend] = useState<Record<string, MonthSpend> | null>(null);
  // Each month's updatedAt when loaded: sent back so a stale save is refused.
  const [stamps, setStamps] = useState<Record<string, string>>({});
  const [loadErr, setLoadErr] = useState("");
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("3");
  const [editing, setEditing] = useState(false);
  const [editMonth, setEditMonth] = useState(today.slice(0, 7));
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const r = await loadMarketingSpend(token);
      setSpend(r.spend);
      setStamps(r.stamps);
      setLoadErr("");
    } catch {
      setLoadErr("Couldn't load the spend numbers. Refresh to try again.");
    }
  }, [getIdToken]);
  useEffect(() => {
    void load();
  }, [load]);

  // Fill the form from what's saved for the chosen month.
  useEffect(() => {
    const m = spend?.[editMonth] || {};
    setForm(Object.fromEntries(SPEND_SOURCES.map((s) => [s, m[s] ? String(m[s]) : ""])));
  }, [spend, editMonth]);

  const months = useMemo(() => monthsBack(today, RANGES.find((r) => r.key === range)!.months), [today, range]);
  const rows = useMemo(() => costPerWonBySource(leads, spend || {}, months), [leads, spend, months]);
  const totals = rows.reduce(
    (t, r) => ({ spend: t.spend + r.spend, won: t.won + r.won, dollars: t.dollars + r.dollars, leads: t.leads + r.leads }),
    { spend: 0, won: 0, dollars: 0, leads: 0 }
  );

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const r = await saveMarketingSpend(editMonth, form, token, stamps[editMonth] ?? "");
      if (!r.ok) throw new Error(r.error);
      await load();
      setMsg(`Saved ${editMonth}.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full px-3 py-2 min-h-11 sm:min-h-0 bg-muted border border-border rounded-md text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <section className="bg-card border border-border rounded-lg p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold mr-auto">Cost per won job, by source</h2>
        <div className="flex gap-1" role="tablist" aria-label="Range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              role="tab"
              aria-selected={range === r.key}
              onClick={() => setRange(r.key)}
              className={cn(
                "min-h-11 sm:min-h-0 px-3 py-1.5 rounded-full text-sm border",
                range === r.key ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loadErr && <p className="text-sm text-destructive">{loadErr}</p>}
      {spend === null && !loadErr ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <table className="w-full text-sm min-w-[32rem]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                <th className="pr-3 pb-1.5 font-medium">Source</th>
                <th className="pr-3 pb-1.5 font-medium text-right">Spend</th>
                <th className="pr-3 pb-1.5 font-medium text-right">Leads</th>
                <th className="pr-3 pb-1.5 font-medium text-right">Won</th>
                <th className="pr-3 pb-1.5 font-medium text-right">$ won</th>
                <th className="pb-1.5 font-medium text-right">Cost per won job</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular-nums">
              {rows.map((r) => (
                <tr key={r.source}>
                  <td className="pr-3 py-1.5">{r.label}</td>
                  <td className="pr-3 py-1.5 text-right">{r.spend ? dollars(r.spend) : "—"}</td>
                  <td className="pr-3 py-1.5 text-right">{r.leads}</td>
                  <td className="pr-3 py-1.5 text-right">{r.won}</td>
                  <td className="pr-3 py-1.5 text-right">{r.dollars ? dollars(r.dollars) : "—"}</td>
                  <td className="py-1.5 text-right font-medium">
                    {r.costPerWon !== null ? dollars(r.costPerWon) : r.spend > 0 ? "no wins yet" : "—"}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="pr-3 py-1.5">All</td>
                <td className="pr-3 py-1.5 text-right">{dollars(totals.spend)}</td>
                <td className="pr-3 py-1.5 text-right">{totals.leads}</td>
                <td className="pr-3 py-1.5 text-right">{totals.won}</td>
                <td className="pr-3 py-1.5 text-right">{dollars(totals.dollars)}</td>
                <td className="py-1.5 text-right">{totals.won && totals.spend ? dollars(totals.spend / totals.won) : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Leads count in the month they came in (the sheet&apos;s date for sheet leads), wins in the month they were won.
        Letter-campaign names count as leads once they talk to you or get a quote. Spend is what you type in below.
      </p>

      {!editing ? (
        <button
          onClick={() => setEditing(true)}
          className="min-h-11 sm:min-h-0 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted"
        >
          Enter monthly spend
        </button>
      ) : (
        <div className="border border-border rounded-md p-3 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="block text-xs font-medium text-muted-foreground">Month</span>
              <input type="month" value={editMonth} onChange={(e) => setEditMonth(e.target.value)} className={cn(inputCls, "w-auto")} />
            </label>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {SPEND_SOURCES.map((s) => (
              <label key={s} className="space-y-1">
                <span className="block text-xs font-medium text-muted-foreground">{sourceLabel(s)}</span>
                <input
                  inputMode="decimal"
                  value={form[s] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [s]: e.target.value }))}
                  placeholder="$0"
                  className={inputCls}
                />
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Ad spend from the Meta and Google bills; printing and postage for letters; referral fees paid out go under Referral.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="min-h-11 sm:min-h-0 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save {editMonth}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setMsg("");
              }}
              className="min-h-11 sm:min-h-0 px-4 py-2 text-sm border border-border rounded-md hover:bg-muted"
            >
              Close
            </button>
            {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
