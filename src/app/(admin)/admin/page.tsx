"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  MessageSquareQuote,
  ClipboardList,
  BookOpen,
  FolderOpen,
  MailOpen,
  Gavel,
} from "lucide-react";
import { useFirestoreCollection } from "@/hooks/use-firestore-collection";
import { useAuth } from "@/context/auth-provider";

interface LinkStats {
  total?: number;
  days?: Record<string, number>;
  lastVisit?: string | null;
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

export default function AdminDashboard() {
  const { data: quotes } = useFirestoreCollection("quoteRequests");
  const { data: applications } = useFirestoreCollection("jobApplications");
  const { data: blogPosts } = useFirestoreCollection("blog");
  const { data: projects } = useFirestoreCollection("projects");
  const { data: bids } = useFirestoreCollection("bids");
  const { getIdToken } = useAuth();

  // Letter-campaign stats come from a server route (Admin SDK), not a direct
  // client Firestore read, so the card works regardless of whether the
  // linkStats client-read rules are published.
  const [linkData, setLinkData] = useState<LinkStatsResponse | null>(null);
  const [linkError, setLinkError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch("/api/admin/link-stats", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as LinkStatsResponse;
        if (!cancelled) setLinkData(json);
      } catch {
        if (!cancelled) setLinkError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getIdToken]);

  const campStats = linkData?.camp;
  const prosStats = linkData?.pros;

  const recentVisits = [
    ...(linkData?.campVisits ?? []).map((v) => ({ ...v, link: "/camp" })),
    ...(linkData?.prosVisits ?? []).map((v) => ({ ...v, link: "/pros" })),
  ]
    .sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""))
    .slice(0, 12);

  const campTotal = campStats?.total ?? 0;
  const campWeek = (() => {
    const days = campStats?.days ?? {};
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      sum += days[d] ?? 0;
    }
    return sum;
  })();

  const openBids =
    bids?.filter((b: Record<string, unknown>) =>
      ["tracking", "bidding", "submitted"].includes(String(b.status))
    ).length ?? 0;

  const newQuotes = quotes?.filter((q: Record<string, unknown>) => q.status === "new").length ?? 0;
  const newApps = applications?.filter((a: Record<string, unknown>) => a.status === "new").length ?? 0;
  const blogCount = blogPosts?.length ?? 0;
  const projectCount = projects?.length ?? 0;

  const stats = [
    {
      label: "New Quote Requests",
      value: newQuotes,
      icon: MessageSquareQuote,
      color: "text-primary",
      href: "/admin/quotes",
    },
    {
      label: "Open Bids",
      value: openBids,
      icon: Gavel,
      color: "text-secondary",
      href: "/admin/bids",
    },
    {
      label: "New Applications",
      value: newApps,
      icon: ClipboardList,
      color: "text-secondary",
      href: "/admin/applications",
    },
    {
      label: "Blog Posts",
      value: blogCount,
      icon: BookOpen,
      color: "text-accent",
      href: "/admin/blog",
    },
    {
      label: "Projects",
      value: projectCount,
      icon: FolderOpen,
      color: "text-primary",
      href: "/admin/projects",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <LayoutDashboard className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.label}
              href={stat.href}
              className="bg-card border border-border rounded-lg p-5 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                </div>
                <Icon className={`h-8 w-8 ${stat.color} opacity-50`} />
              </div>
            </Link>
          );
        })}
      </div>

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
            Couldn&apos;t load campaign stats. Refresh the page; if it keeps
            happening, sign out and back in.
          </div>
        )}
        <div className="flex flex-wrap gap-8 text-sm">
          <div>
            <p className="text-muted-foreground">Total visits</p>
            <p className="text-2xl font-bold mt-0.5">{campTotal}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Last 7 days</p>
            <p className="text-2xl font-bold mt-0.5">{campWeek}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Last visit</p>
            <p className="text-sm font-medium mt-2">
              {campStats?.lastVisit
                ? new Date(campStats.lastVisit).toLocaleString()
                : "None yet"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-8 text-sm mt-4 pt-4 border-t border-border">
          <div>
            <p className="text-muted-foreground">Contractor letters (/pros)</p>
            <p className="text-2xl font-bold mt-0.5">{prosStats?.total ?? 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Last visit</p>
            <p className="text-sm font-medium mt-2">
              {prosStats?.lastVisit
                ? new Date(prosStats.lastVisit).toLocaleString()
                : "None yet"}
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

      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-2">
          Welcome to FiberNorth Underground Admin
        </h2>
        <p className="text-muted-foreground text-sm">
          Manage your website content, view quote requests, and update your
          portfolio from here. Use the sidebar to navigate between sections.
        </p>
      </div>
    </div>
  );
}
