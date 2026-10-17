"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LayoutDashboard, MessageSquareQuote, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePendingApprovals } from "@/context/admin-access";

// Bottom tabs on a phone: the places Bill goes all day. The right end is
// left open for the voice mic button, which sits in the bar.

const tabs = [
  { href: "/admin/leads", label: "Today", icon: Sun, external: false },
  { href: "/admin/quotes", label: "Quotes", icon: MessageSquareQuote, external: false },
  { href: "https://calendar.google.com/calendar/r", label: "Calendar", icon: CalendarDays, external: true },
  { href: "/admin", label: "Home", icon: LayoutDashboard, external: false },
];

export function AdminTabBar() {
  const pathname = usePathname();
  // Approvers: how many sales quotes are waiting, on the Quotes tab.
  const waiting = usePendingApprovals().length;
  return (
    <nav
      aria-label="Main"
      className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex h-16 pr-[4.75rem]">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = !t.external && (t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href));
          const cls = cn(
            "flex-1 flex flex-col items-center justify-center gap-0.5 text-xs",
            active ? "text-primary font-medium" : "text-muted-foreground"
          );
          return t.external ? (
            <a key={t.href} href={t.href} target="_blank" rel="noopener noreferrer" className={cls}>
              <Icon className="h-5 w-5" />
              {t.label}
            </a>
          ) : (
            <Link key={t.href} href={t.href} className={cn(cls, "relative")} aria-current={active ? "page" : undefined}>
              <Icon className="h-5 w-5" />
              {t.label}
              {t.href === "/admin/quotes" && waiting > 0 && (
                <span
                  className="absolute top-1.5 left-1/2 ml-2 text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-secondary text-background font-semibold"
                  aria-label={`${waiting} waiting for approval`}
                >
                  {waiting}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
