"use client";

import {
  LayoutDashboard,
  MessageSquareQuote,
  ClipboardList,
  BookOpen,
  FolderOpen,
} from "lucide-react";
import { useFirestoreCollection } from "@/hooks/use-firestore-collection";
import { where } from "firebase/firestore";

export default function AdminDashboard() {
  const { data: quotes } = useFirestoreCollection("quoteRequests");
  const { data: applications } = useFirestoreCollection("jobApplications");
  const { data: blogPosts } = useFirestoreCollection("blog");
  const { data: projects } = useFirestoreCollection("projects");

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
            <a
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
            </a>
          );
        })}
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
