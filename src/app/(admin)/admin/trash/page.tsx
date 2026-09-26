"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useAuth } from "@/context/auth-provider";
import { useIsOwner } from "@/hooks/use-is-owner";
import { listTrash, purgeTrashItem, restoreTrashItem, type TrashItem } from "@/actions/trash";
import { OwnerOnlyNote } from "@/components/admin/owner-only";

const COLLECTION_LABELS: Record<string, string> = {
  quoteRequests: "Quote",
  blog: "Blog post",
  projects: "Project",
  majorProjects: "Major project",
  fleet: "Fleet",
  team: "Team member",
  testimonials: "Testimonial",
  jobPostings: "Job posting",
  jobApplications: "Application",
  bids: "Bid",
  services: "Service",
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function TrashPage() {
  const { getIdToken } = useAuth();
  const isOwner = useIsOwner();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      setItems(await listTrash(token));
    } catch {
      setError("Couldn't load the trash.");
    }
  }, [getIdToken]);

  useEffect(() => {
    if (isOwner) void load();
  }, [isOwner, load]);

  const act = async (item: TrashItem, kind: "restore" | "purge") => {
    const what = `${COLLECTION_LABELS[item.col] ?? item.col} "${item.label}"`;
    if (kind === "purge" && !window.confirm(`Delete ${what} for good? This can't be undone.`)) return;
    setBusy(item.trashId);
    setError("");
    setNotice("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const r = kind === "restore" ? await restoreTrashItem(item.trashId, token) : await purgeTrashItem(item.trashId, token);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setNotice(
        kind === "restore"
          ? `Restored ${what}.${item.col === "quoteRequests" ? " It is back on its lead as a draft; send it again to give the customer a working link." : ""}`
          : `Deleted ${what} for good.`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setBusy("");
    }
  };

  if (!isOwner) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Trash</h1>
        <OwnerOnlyNote />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Trash2 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Trash</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Deleted quotes, site entries, bids and applications land here. Restore puts one back exactly where it was
        (unless something new has taken its place). A restored quote comes back as a draft: the links the customer
        had stay void.
      </p>
      {error && (
        <div role="alert" className="border border-destructive/50 bg-destructive/10 text-destructive rounded-lg p-4 text-sm">
          {error}
        </div>
      )}
      {notice && <div className="border border-border bg-muted/40 rounded-lg p-4 text-sm">{notice}</div>}

      {items === null ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">The trash is empty.</p>
      ) : (
        <ul className="bg-card border border-border rounded-lg divide-y divide-border">
          {items.map((item) => (
            <li key={item.trashId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">
                  <span className="text-muted-foreground font-normal">{COLLECTION_LABELS[item.col] ?? item.col}: </span>
                  {item.label}
                </p>
                <p className="text-sm text-muted-foreground">
                  Deleted {fmtWhen(item.deletedAt)} by {item.deletedBy || "unknown"}
                  {item.note ? ` · ${item.note}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void act(item, "restore")}
                  disabled={busy === item.trashId}
                  className="min-h-11 sm:min-h-0 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted flex items-center gap-1.5 disabled:opacity-50"
                >
                  {busy === item.trashId ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Restore
                </button>
                <button
                  onClick={() => void act(item, "purge")}
                  disabled={busy === item.trashId}
                  className="min-h-11 sm:min-h-0 px-3 py-1.5 text-sm border border-border rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  Delete for good
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
