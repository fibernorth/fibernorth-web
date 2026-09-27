"use client";

import { useEffect, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { useAuth } from "@/context/auth-provider";
import { isAdminIdentity } from "@/lib/admin-allowlist";

// Same accounts as /login. Once a phone has signed in and been confirmed as
// an admin, that's remembered so the app still opens with no signal at the
// field (Firebase keeps the sign-in on the phone).

const OK_KEY = "pc.okUid";

function rememberedUid(): string {
  try {
    return localStorage.getItem(OK_KEY) || "";
  } catch {
    return "";
  }
}
function remember(uid: string) {
  try {
    if (uid) localStorage.setItem(OK_KEY, uid);
    else localStorage.removeItem(OK_KEY);
  } catch {
    // ignore
  }
}

export function PitchGate({ children }: { children: (signOut: () => void) => React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const [state, setState] = useState<"checking" | "ok" | "denied">("checking");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setState("denied");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await user.getIdTokenResult();
        const ok = isAdminIdentity(user.uid, user.email, res.claims);
        if (cancelled) return;
        remember(ok ? user.uid : "");
        setState(ok ? "ok" : "denied");
      } catch {
        // Offline and the token needs a refresh: trust this phone if it was
        // confirmed before for this same account.
        if (!cancelled) setState(rememberedUid() === user.uid ? "ok" : "denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  const signOut = () => {
    remember("");
    void logout();
  };

  if (loading || (user && state === "checking")) {
    return <div className="min-h-dvh bg-[#0C1017]" />;
  }
  if (user && state === "ok") return <>{children(signOut)}</>;
  return <SignIn signedInAs={user?.email || ""} onSignOut={signOut} />;
}

function SignIn({ signedInAs, onSignOut }: { signedInAs: string; onSignOut: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const field =
    "w-full rounded-lg border border-white/15 bg-black/40 px-3 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-amber-400";

  return (
    <div className="min-h-dvh bg-[#0C1017] text-white flex items-center justify-center p-6">
      <form
        className="w-full max-w-sm space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
          } catch (err) {
            const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
            setError(
              /invalid-credential|wrong-password|user-not-found/.test(code)
                ? "Wrong email or password."
                : /network/.test(code)
                  ? "No signal. Sign in once with signal, then it works offline."
                  : "Couldn't sign in. Try again."
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="text-center">
          <div className="pc-olde text-white text-8xl leading-none mb-2">D</div>
          <div className="text-3xl font-black tracking-wide">
            TC <span className="text-amber-400">Diamonds</span>
          </div>
          <div className="text-sm text-white/60 mt-1">Pitch calling</div>
        </div>
        {signedInAs && (
          <p className="text-sm text-red-300">
            {signedInAs} can&apos;t use this app.{" "}
            <button type="button" className="underline" onClick={onSignOut}>
              Sign out
            </button>
          </p>
        )}
        {error && <p className="text-sm text-red-300">{error}</p>}
        <input className={field} type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          className={field}
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button disabled={busy} className="w-full rounded-lg bg-amber-400 text-black font-bold py-3 disabled:opacity-60">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-xs text-white/40 text-center">Same email and password as the FiberNorth admin.</p>
      </form>
    </div>
  );
}
