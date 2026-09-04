"use client";

import Link from "next/link";
import {
  LayoutDashboard,
  MessageSquareQuote,
  ClipboardList,
  BookOpen,
  FolderOpen,
  MailOpen,
} from "lucide-react";
import { useFirestoreCollection } from "@/hooks/use-firestore-collection";
import { useFirestoreDocument } from "@/hooks/use-firestore-document";

interface LinkStats {
  total?: number;
  days?: Record<string, number>;
  lastVisit?: string;
}

export default function AdminDashboard() {
  const { data: quotes } = useFirestoreCollection("quoteRequests");
  const { data: applications } = useFirestoreCollection("jobApplications");
  const { data: blogPosts } = useFirestoreCollection("blog");
  const { data: projects } = useFirestoreCollection("projects");
  const { data: campStats } = useFirestoreDocument<LinkStats>("linkStats/camp");

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
        <p className="text-xs text-muted-foreground mt-3">
          Counts everyone who typed the letter link or scanned its QR code.
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
