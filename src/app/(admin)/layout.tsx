"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { AuthProvider, useAuth } from "@/context/auth-provider";
import { isAdminIdentity } from "@/lib/admin-allowlist";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { AdminHeader } from "@/components/layout/admin-header";
import { AdminTabBar } from "@/components/layout/admin-tab-bar";
import { VoiceAssistant } from "@/components/admin/voice-assistant";

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  // null = still checking. Same rule as the server (UID list, admin claim,
  // or verified allowlisted email), read from the ID token's claims.
  const [admin, setAdmin] = useState<{ uid: string; ok: boolean } | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  const check = useCallback(
    async (forceRefresh: boolean) => {
      if (!user) return;
      setChecking(true);
      try {
        const res = await user.getIdTokenResult(forceRefresh);
        let ok = isAdminIdentity(user.uid, user.email, res.claims);
        // A claim granted after sign-in only shows up on a fresh token.
        if (!ok && !forceRefresh) {
          const fresh = await user.getIdTokenResult(true);
          ok = isAdminIdentity(user.uid, user.email, fresh.claims);
        }
        setAdmin({ uid: user.uid, ok });
      } catch {
        // Can't read the token (offline): let the screens try; the server
        // still checks every read and write.
        setAdmin({ uid: user.uid, ok: true });
      } finally {
        setChecking(false);
      }
    },
    [user]
  );

  useEffect(() => {
    void check(false);
  }, [check]);

  const adminKnown = !!user && admin?.uid === user.uid;

  if (loading || (user && !adminKnown)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (!admin?.ok) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <div role="alert" className="max-w-md w-full bg-card border border-border rounded-lg p-6 space-y-4 text-center">
          <ShieldAlert className="h-10 w-10 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold">No access</h1>
          <p className="text-sm text-muted-foreground">
            You&apos;re signed in as <span className="font-medium text-foreground">{user.email || "this account"}</span>,
            which isn&apos;t set up as a FiberNorth admin. Ask Bill to add you under Admin &rarr; Users, then check again.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={() => void check(true)}
              disabled={checking}
              className="min-h-11 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50"
            >
              {checking ? "Checking…" : "Check again"}
            </button>
            <button
              onClick={() => void logout()}
              className="min-h-11 px-4 py-2 text-sm border border-border rounded-md hover:bg-muted"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <AdminSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <AdminHeader />
        <main className="flex-1 overflow-y-auto p-4 pb-28 sm:p-6 sm:pb-28 lg:pb-24 bg-muted/10">
          {children}
        </main>
      </div>
      <AdminTabBar />
      <VoiceAssistant />
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <AdminGuard>{children}</AdminGuard>
    </AuthProvider>
  );
}
