"use client";

import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { useAuth } from "@/context/auth-provider";
import { useIsOwner } from "@/hooks/use-is-owner";
import { mergeLeads, previewLeadMerge, type MergePreview } from "@/actions/leads";
import { STAGE_LABELS, type Lead, type LeadStage } from "@/lib/leads";
import type { DuplicateMatch } from "@/lib/lead-merge";
import type { SaveFn } from "@/components/admin/lead-sales";

const SOURCE_SHORT: Record<string, string> = {
  "meta-ads": "Meta ads",
  website: "website quote",
  "google-ads": "Google ads",
  phone: "phone call",
};

/**
 * "Same person as ..." on a lead that shares a phone or email with another.
 * Merge folds the two into one (preview first); "Not the same" stops asking.
 */
export function DuplicateBanner({
  lead,
  matches,
  allLeads,
  onSave,
  onOpenLead,
}: {
  lead: Lead;
  matches: DuplicateMatch[];
  allLeads: Lead[];
  onSave: SaveFn;
  onOpenLead: (id: string) => void;
}) {
  const { getIdToken } = useAuth();
  const isOwner = useIsOwner();
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  if (!matches.length) return null;

  const look = async (otherId: string) => {
    setErr("");
    setBusy(otherId);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      setPreview(await previewLeadMerge(lead.id, otherId, token));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't check that lead");
    } finally {
      setBusy("");
    }
  };

  const merge = async () => {
    if (!preview) return;
    setErr("");
    setBusy("merge");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const r = await mergeLeads(preview.keepId, preview.dropId, token);
      if (!r.ok) throw new Error(r.error);
      setPreview(null);
      onOpenLead(r.keepId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't merge");
    } finally {
      setBusy("");
    }
  };

  const notSame = async (otherId: string) => {
    setBusy(otherId);
    await onSave(
      lead,
      { notDuplicateOf: [...new Set([...(lead.notDuplicateOf || []), otherId])] },
      { ts: new Date().toISOString(), type: "system", text: `Marked not the same person as ${allLeads.find((l) => l.id === otherId)?.name || "another lead"}` }
    );
    setBusy("");
  };

  return (
    <div className="rounded-md border border-secondary/60 bg-secondary/10 p-3 space-y-2 text-sm">
      {matches.map((m) => {
        const other = allLeads.find((l) => l.id === m.id);
        return (
          <div key={m.id} className="flex flex-wrap items-center gap-2">
            <Copy className="h-4 w-4 text-secondary shrink-0" />
            <span className="flex-1 min-w-[12rem]">
              Looks like the same person as{" "}
              <button type="button" className="underline text-primary" onClick={() => onOpenLead(m.id)}>
                {m.name || "another lead"}
              </button>{" "}
              <span className="text-muted-foreground">
                (same {m.by}
                {other ? `, ${SOURCE_SHORT[String(other.source)] ?? other.source}, ${STAGE_LABELS[other.stage as LeadStage] ?? other.stage}` : ""})
              </span>
            </span>
            {isOwner && (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void look(m.id)}
                className="px-3 py-1.5 rounded-md border border-primary text-primary font-medium disabled:opacity-50"
              >
                {busy === m.id ? "Checking…" : "Merge…"}
              </button>
            )}
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void notSame(m.id)}
              className="px-3 py-1.5 rounded-md border border-border text-muted-foreground disabled:opacity-50"
            >
              Not the same
            </button>
          </div>
        );
      })}
      {!isOwner && <p className="text-xs text-muted-foreground">Merging is done by an owner account.</p>}

      {preview && (
        <div className="rounded-md border border-border bg-card p-3 space-y-2">
          <p className="font-semibold">
            Merge {preview.dropName} into {preview.keepName}?
          </p>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-0.5">
            <li>
              Keeps <b className="text-foreground">{preview.keepName}</b> because {preview.keepWhy}. Blank details are filled in from the
              other one.
            </li>
            <li>
              Stage after: <b className="text-foreground">{STAGE_LABELS[preview.stage as LeadStage] ?? preview.stage}</b>
              {preview.phone ? ` · ${preview.phone}` : ""}
              {preview.email ? ` · ${preview.email}` : ""}
            </li>
            <li>
              Moves {preview.quotes} {preview.quotes === 1 ? "quote" : "quotes"}
              {preview.jobs ? ` and ${preview.jobs} ${preview.jobs === 1 ? "job" : "jobs"}` : ""}; combines both histories ({preview.history}{" "}
              entries).
            </li>
            <li>{preview.dropName} goes to the Trash (it can be restored).</li>
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy === "merge"}
              onClick={() => void merge()}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              {busy === "merge" && <Loader2 className="h-4 w-4 animate-spin" />} Merge them
            </button>
            <button type="button" onClick={() => setPreview(null)} className="px-4 py-2 rounded-md border border-border">
              Cancel
            </button>
          </div>
        </div>
      )}
      {err && <p className="text-destructive">{err}</p>}
    </div>
  );
}
