"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { IntegrationStatus } from "@/actions/integrations";

// Admin -> Settings: connect bill@fibernorth.com's Gmail so lead replies are
// logged on the lead (src/services/gmail-replies.ts). Owner only; the page
// only shows this to owners and the routes check too.

type GmailInfo = IntegrationStatus["gmail"];

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// What the shared Google callback sends back as ?gmail=error:<reason>.
function connectError(reason: string): string {
  if (reason === "state") return "The Google sign-in took too long or was started in another tab. Click Connect Gmail again.";
  if (reason === "denied") return "Gmail access wasn't allowed. Click Connect Gmail and choose Allow on Google's page.";
  if (reason === "norefresh") return "Google didn't send a lasting login. Click Connect Gmail again.";
  if (reason.startsWith("token")) {
    return `Google didn't accept the sign-in${reason.length > 5 ? ` (HTTP ${reason.slice(5)})` : ""}. Check the calendar's client ID and secret, then try again.`;
  }
  return `Gmail connection failed (${reason}). Try again.`;
}

export function GmailConnect({
  gmail,
  statusKnown,
  hasClient,
  getToken,
  onChange,
}: {
  gmail: GmailInfo | undefined;
  statusKnown: boolean;
  /** The Google OAuth client ID and secret are saved (Google Calendar section). */
  hasClient: boolean;
  getToken: () => Promise<string | null>;
  onChange: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState<"" | "connect" | "disconnect" | "check">("");
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [result, setResult] = useState("");
  useEffect(() => {
    setResult(new URLSearchParams(window.location.search).get("gmail") || "");
  }, []);

  const connected = Boolean(gmail?.connected);
  const failing = Boolean(gmail?.lastError && gmail.lastErrorAt && (!gmail.lastOkAt || gmail.lastErrorAt > gmail.lastOkAt));

  const call = async (path: string, body?: unknown) => {
    const token = await getToken();
    if (!token) throw new Error("Session expired, sign in again");
    const res = await fetch(path, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
    return json;
  };

  const connect = async () => {
    setBusy("connect");
    setMsg(null);
    try {
      const json = await call("/api/google/gmail/start");
      window.location.href = json.url;
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Couldn't start the Google sign-in", error: true });
      setBusy("");
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect Gmail? Lead replies stop being logged until you connect again. Replies already logged stay.")) return;
    setBusy("disconnect");
    setMsg(null);
    try {
      await call("/api/google/gmail/disconnect");
      setResult("");
      await onChange();
      setMsg({ text: "Disconnected.", error: false });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Couldn't disconnect", error: true });
    } finally {
      setBusy("");
    }
  };

  const checkNow = async () => {
    setBusy("check");
    setMsg(null);
    try {
      const json = (await call("/api/gmail/sync", { force: true })) as {
        skipped?: boolean;
        reason?: string;
        scanned?: number;
        logged?: number;
      };
      if (json.skipped) {
        setMsg({
          text: json.reason === "not_connected" ? "Gmail isn't connected." : "A check just ran. Try again in a few seconds.",
          error: false,
        });
      } else {
        const n = json.logged || 0;
        setMsg({
          text: `Checked ${json.scanned || 0} new message${json.scanned === 1 ? "" : "s"}; ${n} lead repl${n === 1 ? "y" : "ies"} logged.`,
          error: false,
        });
      }
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Check failed", error: true });
    } finally {
      setBusy("");
      await onChange();
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-5">
      <h2 className="text-lg font-semibold">Gmail (lead replies)</h2>
      <p className="text-sm text-muted-foreground">
        When a lead answers one of your emails, the reply is logged on their lead, they count as contacted, and
        &quot;Reply to their email&quot; goes on Due. Checked every few minutes while the admin is open. Status:{" "}
        {!statusKnown ? (
          <span className="text-muted-foreground">checking…</span>
        ) : connected ? (
          <span className={failing ? "text-secondary font-medium" : "text-accent font-medium"}>
            connected{gmail?.accountEmail ? ` as ${gmail.accountEmail}` : ""}
            {failing ? ", but the last check failed" : ""}
          </span>
        ) : (
          <span className="text-destructive font-medium">not connected</span>
        )}
      </p>
      {connected && gmail && (
        <div className="text-sm space-y-0.5">
          {failing && (
            <p className="text-destructive">
              Last check failed {fmtWhen(gmail.lastErrorAt)}: {gmail.lastError}
              {/invalid_grant|token refresh failed \((400|401)\)/i.test(gmail.lastError)
                ? " Google may have revoked access; click Reconnect Gmail."
                : ""}
            </p>
          )}
          <p className="text-muted-foreground">
            {gmail.lastOkAt ? `Last checked ${fmtWhen(gmail.lastOkAt)}.` : "Not checked yet."} Replies logged:{" "}
            {gmail.totalLogged}
            {gmail.lastOkAt ? ` (${gmail.lastLogged} on the last check)` : ""}.
          </p>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Uses the same Google sign-in setup as the calendar. In Google Cloud, turn on the Gmail API for that project,
        then press Connect Gmail and sign in as bill@fibernorth.com.
      </p>
      {!hasClient && statusKnown && (
        <p className="text-sm text-secondary">Save the OAuth client ID and secret under Google Calendar first.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={connect}
          disabled={Boolean(busy) || !hasClient}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          {busy === "connect" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {connected ? "Reconnect Gmail" : "Connect Gmail"}
        </button>
        {connected && (
          <>
            <button
              type="button"
              onClick={checkNow}
              disabled={Boolean(busy)}
              className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted disabled:opacity-50 flex items-center gap-2"
            >
              {busy === "check" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Check now
            </button>
            <button
              type="button"
              onClick={disconnect}
              disabled={Boolean(busy)}
              className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted disabled:opacity-50 flex items-center gap-2"
            >
              {busy === "disconnect" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Disconnect
            </button>
          </>
        )}
        {msg && <span className={msg.error ? "text-sm text-destructive" : "text-sm text-accent"}>{msg.text}</span>}
        {!msg && result === "connected" && <span className="text-sm text-accent">Connected.</span>}
        {!msg && result.startsWith("error:") && (
          <span className="text-sm text-destructive">{connectError(result.slice(6))}</span>
        )}
      </div>
    </div>
  );
}
