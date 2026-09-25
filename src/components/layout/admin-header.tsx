"use client";

import { useAuth } from "@/context/auth-provider";
import { LogOut } from "lucide-react";

export function AdminHeader() {
  const { user, logout } = useAuth();

  return (
    // On a phone the menu button sits at the left edge of this bar, so the
    // bar leaves room for it and drops the title and email.
    <header className="h-14 shrink-0 border-b border-border bg-card flex items-center justify-between pl-16 pr-4 lg:px-6">
      <h1 className="hidden lg:block text-sm font-medium text-muted-foreground">
        FiberNorth Underground Admin
      </h1>
      <span className="lg:hidden text-sm font-semibold">FiberNorth</span>

      <div className="flex items-center gap-4">
        <span className="hidden lg:inline text-xs text-muted-foreground">{user?.email}</span>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 min-h-11 px-2 -mr-2 lg:min-h-0 lg:px-0 lg:mr-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Logout
        </button>
      </div>
    </header>
  );
}
