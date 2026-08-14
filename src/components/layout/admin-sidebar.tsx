"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/icons/logo";
import {
  LayoutDashboard,
  FileText,
  FolderOpen,
  Building2,
  Truck,
  Users,
  BookOpen,
  Star,
  Briefcase,
  MessageSquareQuote,
  ClipboardList,
  Settings,
  Menu,
  X,
} from "lucide-react";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/pages", label: "Pages", icon: FileText },
  { href: "/admin/projects", label: "Projects", icon: FolderOpen },
  { href: "/admin/major-projects", label: "Major Projects", icon: Building2 },
  { href: "/admin/fleet", label: "Fleet", icon: Truck },
  { href: "/admin/team", label: "Team", icon: Users },
  { href: "/admin/blog", label: "Blog", icon: BookOpen },
  { href: "/admin/testimonials", label: "Testimonials", icon: Star },
  { href: "/admin/jobs", label: "Job Postings", icon: Briefcase },
  { href: "/admin/quotes", label: "Quotes", icon: MessageSquareQuote },
  { href: "/admin/applications", label: "Applications", icon: ClipboardList },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const closeMenu = () => setOpen(false);

  return (
    <>
      {/* Mobile toggle button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Toggle sidebar"
        className="lg:hidden fixed top-3 left-3 z-50 p-2 bg-card border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile backdrop */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "w-64 bg-card border-r border-border flex flex-col h-full",
          "fixed inset-y-0 left-0 z-40 transform transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:translate-x-0 lg:transform-none lg:z-auto"
        )}
      >
        <div className="p-4 border-b border-border">
          <Link href="/admin" className="flex items-center gap-2" onClick={closeMenu}>
            <LogoMark />
            <span className="text-xs text-muted-foreground font-medium">
              ADMIN
            </span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMenu}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border">
          <Link
            href="/"
            onClick={closeMenu}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
          >
            View Site →
          </Link>
        </div>
      </aside>
    </>
  );
}
