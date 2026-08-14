"use client";

import { CrudPage } from "@/components/admin/crud-page";
import { Briefcase } from "lucide-react";
import type { JobPosting } from "@/lib/types";
import { orderBy } from "firebase/firestore";

const columns = [
  { key: "title" as const, label: "Position", render: (item: JobPosting) => <span className="font-medium">{item.title}</span> },
  { key: "payRange" as const, label: "Pay" },
  { key: "type" as const, label: "Type" },
  {
    key: "isActive" as const,
    label: "Status",
    render: (item: JobPosting) => (
      <span className={`text-xs px-2 py-0.5 rounded-full ${item.isActive ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}`}>
        {item.isActive ? "Active" : "Closed"}
      </span>
    ),
  },
];

const defaultValues = { title: "", payRange: "", season: "", schedule: "", duties: [], requirements: [], type: "seasonal", indeedUrl: "", isActive: true, sortOrder: 0 };

export default function AdminJobsPage() {
  return (
    <CrudPage<JobPosting>
      title="Job Postings"
      collection="jobPostings"
      columns={columns}
      icon={<Briefcase className="h-6 w-6 text-primary" />}
      defaultValues={defaultValues}
      constraints={[orderBy("sortOrder", "asc")]}
      orderByField="sortOrder"
      renderForm={(_, onChange, formData) => (
        <>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Position Title *</label>
              <input value={(formData.title as string) || ""} onChange={(e) => onChange("title", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Pay Range</label>
              <input value={(formData.payRange as string) || ""} onChange={(e) => onChange("payRange", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="$25-$35/hour" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Season</label>
              <input value={(formData.season as string) || ""} onChange={(e) => onChange("season", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Mid-March through Mid-December" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Schedule</label>
              <input value={(formData.schedule as string) || ""} onChange={(e) => onChange("schedule", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Monday-Friday" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Duties (one per line)</label>
            <textarea
              value={((formData.duties as string[]) || []).join("\n")}
              onChange={(e) => onChange("duties", e.target.value.split("\n"))}
              rows={5}
              className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Requirements (one per line)</label>
            <textarea
              value={((formData.requirements as string[]) || []).join("\n")}
              onChange={(e) => onChange("requirements", e.target.value.split("\n"))}
              rows={5}
              className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Indeed Listing URL</label>
            <input value={(formData.indeedUrl as string) || ""} onChange={(e) => onChange("indeedUrl", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="https://www.indeed.com/viewjob?jk=..." />
            <p className="text-xs text-muted-foreground">Optional — adds an &quot;Apply on Indeed&quot; button to this posting on the careers page.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Type</label>
              <select value={(formData.type as string) || "seasonal"} onChange={(e) => onChange("type", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="full-time">Full-time</option>
                <option value="seasonal">Seasonal</option>
                <option value="part-time">Part-time</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Sort Order</label>
              <input type="number" value={(formData.sortOrder as number) || 0} onChange={(e) => onChange("sortOrder", parseInt(e.target.value) || 0)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input type="checkbox" id="isActive" checked={(formData.isActive as boolean) ?? true} onChange={(e) => onChange("isActive", e.target.checked)} className="h-4 w-4" />
              <label htmlFor="isActive" className="text-sm font-medium">Active</label>
            </div>
          </div>
        </>
      )}
    />
  );
}
