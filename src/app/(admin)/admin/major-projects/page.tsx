"use client";

import { CrudPage } from "@/components/admin/crud-page";
import { MultiImageUpload } from "@/components/admin/image-upload";
import { Building2 } from "lucide-react";
import type { MajorProject } from "@/lib/types";

const columns = [
  { key: "title" as const, label: "Title" },
  { key: "client" as const, label: "Client" },
  { key: "location" as const, label: "Location" },
  {
    key: "isPublished" as const,
    label: "Status",
    render: (item: MajorProject) => (
      <span className={`text-xs px-2 py-0.5 rounded-full ${item.isPublished ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}`}>
        {item.isPublished ? "Published" : "Draft"}
      </span>
    ),
  },
];

const defaultValues = {
  title: "",
  client: "",
  description: "",
  images: [],
  scope: "",
  duration: "",
  location: "",
  isPublished: false,
  sortOrder: 0,
};

export default function AdminMajorProjectsPage() {
  return (
    <CrudPage<MajorProject>
      title="Major Projects"
      collection="majorProjects"
      columns={columns}
      icon={<Building2 className="h-6 w-6 text-primary" />}
      defaultValues={defaultValues}
      renderForm={(_, onChange, formData) => (
        <>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title *</label>
              <input value={(formData.title as string) || ""} onChange={(e) => onChange("title", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Client</label>
              <input value={(formData.client as string) || ""} onChange={(e) => onChange("client", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <textarea value={(formData.description as string) || ""} onChange={(e) => onChange("description", e.target.value)} rows={3} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
          </div>
          <div className="grid sm:grid-cols-3 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Scope</label>
              <input value={(formData.scope as string) || ""} onChange={(e) => onChange("scope", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Duration</label>
              <input value={(formData.duration as string) || ""} onChange={(e) => onChange("duration", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Location</label>
              <input value={(formData.location as string) || ""} onChange={(e) => onChange("location", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Photos</label>
            <MultiImageUpload values={(formData.images as string[]) || []} onChange={(urls) => onChange("images", urls)} folder="major-projects" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="sortOrder" className="text-sm font-medium">Sort Order</label>
            <input
              id="sortOrder"
              type="number"
              value={(formData.sortOrder as number) || 0}
              onChange={(e) => onChange("sortOrder", parseInt(e.target.value) || 0)}
              className="w-32 px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground">Lower numbers show first.</p>
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="isPublished" checked={(formData.isPublished as boolean) || false} onChange={(e) => onChange("isPublished", e.target.checked)} className="h-4 w-4" />
            <label htmlFor="isPublished" className="text-sm font-medium">Published</label>
          </div>
        </>
      )}
    />
  );
}
