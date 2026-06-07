"use client";

import { useAuth } from "@/context/auth-provider";
import { LogOut } from "lucide-react";

export function AdminHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6">
      <h1 className="text-sm font-medium text-muted-foreground">
        FiberNorth Underground Admin
      </h1>

      <div className="flex items-center gap-4">
        <span className="text-xs text-muted-foreground">{user?.email}</span>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Logout
        </button>
      </div>
    </header>
  );
}
