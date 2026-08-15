"use client";

import { useState } from "react";

import { useFirestoreCollection } from "@/hooks/use-firestore-collection";
import { useAuth } from "@/context/auth-provider";
import { updateDocument, deleteDocument } from "@/actions/crud";
import { DeleteDialog } from "@/components/admin/delete-dialog";
import { ClipboardList, Loader2 } from "lucide-react";
import { orderBy } from "firebase/firestore";
import type { JobApplication } from "@/lib/types";

const statusColors: Record<string, string> = {
  new: "bg-primary/10 text-primary",
  reviewed: "bg-secondary/10 text-secondary",
  contacted: "bg-accent/10 text-accent",
  hired: "bg-green-500/10 text-green-500",
  declined: "bg-muted text-muted-foreground",
};

export default function AdminApplicationsPage() {
  const { data, loading } = useFirestoreCollection<JobApplication>("jobApplications", {
    constraints: [orderBy("createdAt", "desc")],
  });
  const { getIdToken } = useAuth();

  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [notesSaving, setNotesSaving] = useState<Record<string, boolean>>({});

  const setErr = (id: string, msg: string) =>
    setRowError((prev) => ({ ...prev, [id]: msg }));

  const updateStatus = async (id: string, status: string) => {
    setErr(id, "");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("no token");
      await updateDocument("jobApplications", id, { status }, token);
    } catch {
      setErr(id, "Couldn't save the status change — try again.");
    }
  };

  const saveNotes = async (id: string) => {
    setErr(id, "");
    setNotesSaving((prev) => ({ ...prev, [id]: true }));
    try {
      const token = await getIdToken();
      if (!token) throw new Error("no token");
      await updateDocument("jobApplications", id, { notes: notesDraft[id] ?? "" }, token);
    } catch {
      setErr(id, "Couldn't save the notes — try again.");
    } finally {
      setNotesSaving((prev) => ({ ...prev, [id]: false }));
    }
  };

  const deleteApplication = async (id: string) => {
    const token = await getIdToken();
    if (!token) throw new Error("Session expired — log in again");
    await deleteDocument("jobApplications", id, token);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardList className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Job Applications</h1>
        {data.length > 0 && (
          <span className="text-sm bg-primary/10 text-primary px-2.5 py-0.5 rounded-full">
            {data.filter((a) => a.status === "new").length} new
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <p className="text-muted-foreground">No applications yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.map((app) => (
            <div key={app.id} className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h3 className="font-semibold">{app.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {app.phone} &middot; {app.email}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={app.status}
                    onChange={(e) => updateStatus(app.id, e.target.value)}
                    className={`text-xs px-2.5 py-1 rounded-full border-0 cursor-pointer ${statusColors[app.status] || ""}`}
                  >
                    <option value="new">New</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="contacted">Contacted</option>
                    <option value="hired">Hired</option>
                    <option value="declined">Declined</option>
                  </select>
                  <DeleteDialog
                    itemName={`application from ${app.name}`}
                    onDelete={() => deleteApplication(app.id)}
                  />
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-2 text-sm mb-3">
                <div>
                  <span className="text-muted-foreground">Positions: </span>
                  <span>{(app.positionsInterested || []).join(", ") || "Not specified"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">CDL: </span>
                  <span>{app.hasCDL === true ? "Yes" : app.hasCDL === false ? "No" : "Not specified"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Heard from: </span>
                  <span>{app.howHeard || "Not specified"}</span>
                </div>
              </div>
              {app.equipmentExperience && (
                <p className="text-sm text-muted-foreground bg-muted rounded p-3">
                  <strong>Experience:</strong> {app.equipmentExperience}
                </p>
              )}
              {app.resumeUrl && (
                <a href={app.resumeUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline mt-2 inline-block">
                  View Resume
                </a>
              )}
              {rowError[app.id] && (
                <p role="alert" className="text-sm text-destructive mt-3">
                  {rowError[app.id]}
                </p>
              )}
              <div className="mt-3">
                <label htmlFor={`notes-${app.id}`} className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Notes
                </label>
                <div className="flex gap-2 mt-1">
                  <textarea
                    id={`notes-${app.id}`}
                    rows={2}
                    value={notesDraft[app.id] ?? app.notes ?? ""}
                    onChange={(e) => setNotesDraft((prev) => ({ ...prev, [app.id]: e.target.value }))}
                    placeholder="Internal notes — interview date, impressions, etc."
                    className="flex-1 px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                  <button
                    onClick={() => saveNotes(app.id)}
                    disabled={notesSaving[app.id]}
                    className="self-end px-3 py-2 text-xs border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {notesSaving[app.id] ? "Saving..." : "Save Notes"}
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {app.createdAt ? new Date(app.createdAt).toLocaleString() : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
