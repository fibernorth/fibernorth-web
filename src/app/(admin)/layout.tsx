"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { AuthProvider, useAuth } from "@/context/auth-provider";
import { sendEmailVerification } from "firebase/auth";
import { ADMIN_EMAILS, isAdminIdentity } from "@/lib/admin-allowlist";
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
  const [verifyMsg, setVerifyMsg] = useState("");

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
        // Picks up an email confirmed since sign-in (the link in the
        // confirmation email) before the token is refreshed.
        if (forceRefresh) await user.reload().catch(() => {});
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
    const ownerEmailUnconfirmed = !!user.email && ADMIN_EMAILS.has(user.email.toLowerCase()) && !user.emailVerified;
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <div role="alert" className="max-w-md w-full bg-card border border-border rounded-lg p-6 space-y-4 text-center">
          <ShieldAlert className="h-10 w-10 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold">No access</h1>
          {ownerEmailUnconfirmed ? (
            <div className="text-sm text-muted-foreground space-y-3">
              <p>
                You&apos;re signed in as <span className="font-medium text-foreground">{user.email}</span>. This address is
                an owner, but Firebase hasn&apos;t confirmed that this account really holds it, so the admin stays locked
                (that stops anyone else from signing up with your address).
              </p>
              <p>
                Tap <span className="font-medium text-foreground">Confirm my email</span>, open the email Firebase sends to{" "}
                {user.email} (check spam), click the link, then come back and tap Check again.
              </p>
              <button
                onClick={async () => {
                  setVerifyMsg("");
                  try {
                    try {
                      await sendEmailVerification(user, { url: `${window.location.origin}/admin` });
                    } catch (e) {
                      // The return link needs this domain on Firebase's list; without
                      // it, send a plain confirmation (no "continue" button).
                      if (e instanceof Error && /continue-uri|unauthorized-domain/.test(e.message)) {
                        await sendEmailVerification(user);
                      } else {
                        throw e;
                      }
                    }
                    setVerifyMsg(`Sent. Open the email to ${user.email}, click the link, then tap Check again.`);
                  } catch (e) {
                    setVerifyMsg(
                      e instanceof Error && /too-many-requests/.test(e.message)
                        ? "Already sent a few. Wait a minute, or use the one in your inbox."
                        : "Couldn't send it. Try again in a minute."
                    );
                  }
                }}
                className="min-h-11 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md"
              >
                Confirm my email
              </button>
              {verifyMsg && <p className="text-foreground">{verifyMsg}</p>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              You&apos;re signed in as <span className="font-medium text-foreground">{user.email || "this account"}</span>,
              which isn&apos;t set up as a FiberNorth admin. Ask Bill to add you under Admin &rarr; Users, then check again.
            </p>
          )}
          <p className="text-xs text-muted-foreground break-all">Account ID: {user.uid}</p>
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
