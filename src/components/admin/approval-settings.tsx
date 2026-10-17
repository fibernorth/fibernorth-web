"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/auth-provider";
import { useAdminAccess } from "@/context/admin-access";
import { saveApprovalSettings } from "@/actions/access";
import { OwnerOnlyNote } from "@/components/admin/owner-only";
import { cleanApprovers } from "@/lib/roles";

/**
 * Settings -> Quote approvals (owner only): who approves sales quotes, and
 * training mode. Saved on its own (adminSettings/approvals, server only).
 */
export function ApprovalSettings() {
  const { getIdToken } = useAuth();
  const access = useAdminAccess();
  const [list, setList] = useState("");
  const [training, setTraining] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!access.loaded) return;
    setList(access.approvers.join("\n"));
    setTraining(access.trainingMode);
  }, [access.loaded, access.approvers, access.trainingMode]);

  const save = async () => {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const r = await saveApprovalSettings({ approvers: cleanApprovers(list), trainingMode: training }, token);
      if (!r.ok) throw new Error(r.error);
      setList(r.approvers.join("\n"));
      access.refresh();
      setMsg("Saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-4">
      <h2 className="text-lg font-semibold">Quote approvals (sales accounts)</h2>
      <p className="text-sm text-muted-foreground">
        Quotes from a Sales account go to the approval queue instead of the customer when training mode is on, or when
        the price is below the price rules. Approvers see them under Quotes &rarr; Waiting for approval and get an email.
        Owners always approve.
      </p>
      {!access.owner ? (
        <p className="text-sm text-muted-foreground">
          <OwnerOnlyNote>Owner only.</OwnerOnlyNote> Training mode is {access.trainingMode ? "on" : "off"}.
        </p>
      ) : !access.loaded ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <>
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 accent-primary"
              checked={training}
              onChange={(e) => setTraining(e.target.checked)}
            />
            <span>
              <span className="font-medium">Training mode</span>
              <span className="block text-muted-foreground">
                Every quote a sales account sends waits for approval. Off: only quotes priced below the rules wait.
              </span>
            </span>
          </label>
          <div className="space-y-1.5">
            <label htmlFor="approvers" className="text-sm font-medium">
              Approvers (one email per line)
            </label>
            <textarea
              id="approvers"
              rows={3}
              value={list}
              onChange={(e) => setList(e.target.value)}
              className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="bill@fibernorth.com"
            />
            <p className="text-xs text-muted-foreground">
              A sales account can never approve, even if its email is listed.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50 flex items-center gap-2"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save approvals
            </button>
            {msg && <span className="text-sm text-accent">{msg}</span>}
            {err && <span className="text-sm text-destructive">{err}</span>}
          </div>
        </>
      )}
    </div>
  );
}
