"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { PAIRING_MESSAGES } from "@/lib/bore-on/pairing";

// The one-click way to connect Bore-ON: press Connect, approve in Bore-ON, and
// come back connected. The key and the callback secret never pass through the
// browser, so there is nothing to copy. Owner only (the routes check too).

function when(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function BoreOnConnect({
  connected, connectedAt, company, getToken, onChanged,
}: {
  connected: boolean;
  connectedAt: string;
  company: string;
  getToken: () => Promise<string | null>;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<"connect" | "disconnect" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  // Where Bore-ON sent the browser back: ?boreon=connected, denied, state, ...
  const returned = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("boreon") : null;
  const returnedMessage = returned ? PAIRING_MESSAGES[returned] : undefined;

  const post = async (path: string) => {
    const token = await getToken();
    if (!token) throw new Error("Session expired, sign in again");
    const res = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
    return json as { url?: string };
  };

  const connect = async () => {
    setBusy("connect");
    setError("");
    try {
      const { url } = await post("/api/bore-on/connect/start");
      if (!url) throw new Error("Bore-ON didn't answer");
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the connection");
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    setError("");
    try {
      await post("/api/bore-on/connect/disconnect");
      setConfirming(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't disconnect");
    }
    setBusy(null);
  };

  return (
    <div className="rounded-md border border-border bg-muted/40 p-4 space-y-3">
      {connected ? (
        <p className="text-sm">
          <span className="font-semibold text-accent">Connected</span> to Bore-ON
          {company ? ` (${company})` : ""}
          {connectedAt ? ` since ${when(connectedAt)}` : ""}.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          One click: you approve the connection in Bore-ON and it comes back connected. No keys to copy.
        </p>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={connect}
          disabled={busy !== null}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          {busy === "connect" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {connected ? "Reconnect to Bore-ON" : "Connect to Bore-ON"}
        </button>
        {connected && !confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy !== null}
            className="px-3 py-2 text-sm border border-border rounded-md hover:bg-muted disabled:opacity-50"
          >
            Disconnect
          </button>
        )}
        {connected && confirming && (
          <span className="flex items-center gap-2 text-sm">
            Forget the key here?
            <button type="button" onClick={disconnect} disabled={busy !== null} className="px-3 py-1.5 text-sm border border-destructive text-destructive rounded-md disabled:opacity-50">
              {busy === "disconnect" ? "Disconnecting..." : "Yes, disconnect"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-sm text-muted-foreground hover:underline">Cancel</button>
          </span>
        )}
      </div>
      {connected && confirming && (
        <p className="text-xs text-muted-foreground">
          This only forgets the key here. To revoke it in Bore-ON, use Admin → Integrations → Disconnect there.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {returnedMessage && !error && (
        <p className={`text-sm ${returned === "connected" ? "text-accent" : "text-destructive"}`}>{returnedMessage}</p>
      )}
    </div>
  );
}
