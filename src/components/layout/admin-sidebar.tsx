"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/icons/logo";
import { useIsOwner } from "@/hooks/use-is-owner";
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
  Gavel,
  CalendarDays,
  UserCog,
  Settings,
  History,
  Trash2,
  Menu,
  X,
  Globe,
  ChevronDown,
  Wrench,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
}

// Daily work stays on top; what feeds the public website and the office
// settings fold into their own dropdowns so the list stays short.
const mainItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/leads", label: "Leads", icon: Users },
  { href: "/admin/quotes", label: "Quotes", icon: MessageSquareQuote },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/admin/bids", label: "Bid Board", icon: Gavel },
];

const groups: Array<{ key: string; label: string; icon: LucideIcon; items: NavItem[] }> = [
  {
    key: "website",
    label: "Website",
    icon: Globe,
    items: [
      { href: "/admin/pages", label: "Pages", icon: FileText },
      { href: "/admin/projects", label: "Projects", icon: FolderOpen },
      { href: "/admin/major-projects", label: "Major Projects", icon: Building2 },
      { href: "/admin/fleet", label: "Fleet", icon: Truck },
      { href: "/admin/team", label: "Team", icon: Users },
      { href: "/admin/blog", label: "Blog", icon: BookOpen },
      { href: "/admin/testimonials", label: "Testimonials", icon: Star },
      { href: "/admin/jobs", label: "Job Postings", icon: Briefcase },
    ],
  },
  {
    key: "office",
    label: "Office",
    icon: Wrench,
    items: [
      { href: "/admin/applications", label: "Applications", icon: ClipboardList },
      { href: "/admin/users", label: "Users", icon: UserCog },
      { href: "/admin/settings", label: "Settings", icon: Settings },
      { href: "/admin/changes", label: "Change log", icon: History, ownerOnly: true },
      { href: "/admin/trash", label: "Trash", icon: Trash2, ownerOnly: true },
    ],
  },
];

const isActiveHref = (pathname: string, href: string) =>
  pathname === href || (href !== "/admin" && pathname.startsWith(href));

export function AdminSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isOwner = useIsOwner();

  const closeMenu = () => setOpen(false);
  // Which dropdowns are open; the one holding the current page always is.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("fn.navGroups") || "{}");
      if (saved && typeof saved === "object") setOpenGroups(saved);
    } catch {
      // storage blocked or bad value
    }
  }, []);
  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem("fn.navGroups", JSON.stringify(next));
      } catch {
        // storage blocked
      }
      return next;
    });

  const renderItem = (item: NavItem, nested = false) => {
    const isActive = isActiveHref(pathname, item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={closeMenu}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 lg:py-2 min-h-11 lg:min-h-0 rounded-md text-sm transition-colors",
          nested && "pl-9",
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {item.label}
      </Link>
    );
  };

  return (
    <>
      {/* Mobile toggle button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Toggle sidebar"
        className="lg:hidden fixed top-1.5 left-2 z-50 h-11 w-11 flex items-center justify-center bg-card border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors"
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
        <div className="p-4 pl-16 lg:pl-4 border-b border-border">
          <Link href="/admin" className="flex items-center gap-2" onClick={closeMenu}>
            <LogoMark />
            <span className="text-xs text-muted-foreground font-medium">
              ADMIN
            </span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {mainItems.map((item) => renderItem(item))}
          {groups.map((g) => {
            const items = g.items.filter((item) => !item.ownerOnly || isOwner);
            const holdsCurrent = items.some((item) => isActiveHref(pathname, item.href));
            const expanded = holdsCurrent || Boolean(openGroups[g.key]);
            const GroupIcon = g.icon;
            return (
              <div key={g.key} className="pt-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(g.key)}
                  aria-expanded={expanded}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 lg:py-2 min-h-11 lg:min-h-0 rounded-md text-sm transition-colors",
                    holdsCurrent ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <GroupIcon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{g.label}</span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
                </button>
                {expanded && <div className="space-y-1 mt-1">{items.map((item) => renderItem(item, true))}</div>}
              </div>
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
