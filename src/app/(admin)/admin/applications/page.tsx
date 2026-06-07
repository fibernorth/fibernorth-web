"use client";

import { useFirestoreCollection } from "@/hooks/use-firestore-collection";
import { useAuth } from "@/context/auth-provider";
import { updateDocument } from "@/actions/crud";
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

  const updateStatus = async (id: string, status: string) => {
    const token = await getIdToken();
    if (!token) return;
    await updateDocument("jobApplications", id, { status }, token);
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
