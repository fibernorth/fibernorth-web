"use client";

import { CrudPage } from "@/components/admin/crud-page";
import { ImageUpload, MultiImageUpload } from "@/components/admin/image-upload";
import { FolderOpen } from "lucide-react";
import type { Project } from "@/lib/types";

const columns = [
  { key: "title" as const, label: "Title" },
  { key: "category" as const, label: "Category" },
  { key: "location" as const, label: "Location" },
  {
    key: "isPublished" as const,
    label: "Status",
    render: (item: Project) => (
      <span
        className={`text-xs px-2 py-0.5 rounded-full ${
          item.isPublished
            ? "bg-accent/10 text-accent"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {item.isPublished ? "Published" : "Draft"}
      </span>
    ),
  },
];

const defaultValues = {
  title: "",
  description: "",
  category: "",
  images: [],
  location: "",
  date: "",
  isPublished: false,
  sortOrder: 0,
};

export default function AdminProjectsPage() {
  return (
    <CrudPage<Project>
      title="Projects"
      collection="projects"
      columns={columns}
      icon={<FolderOpen className="h-6 w-6 text-primary" />}
      defaultValues={defaultValues}
      renderForm={(_, onChange, formData) => (
        <>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title *</label>
              <input
                value={(formData.title as string) || ""}
                onChange={(e) => onChange("title", e.target.value)}
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Category</label>
              <select
                value={(formData.category as string) || ""}
                onChange={(e) => onChange("category", e.target.value)}
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select...</option>
                <option value="water-lines">Water Lines</option>
                <option value="septic">Septic</option>
                <option value="drainage">Drainage</option>
                <option value="power">Power</option>
                <option value="gas">Gas</option>
                <option value="irrigation">Irrigation</option>
                <option value="fiber">Fiber</option>
                <option value="culvert-driveway">Culvert/Driveway</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <textarea
              value={(formData.description as string) || ""}
              onChange={(e) => onChange("description", e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Location</label>
              <input
                value={(formData.location as string) || ""}
                onChange={(e) => onChange("location", e.target.value)}
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Date</label>
              <input
                type="date"
                value={(formData.date as string) || ""}
                onChange={(e) => onChange("date", e.target.value)}
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Photos</label>
            <MultiImageUpload
              values={(formData.images as string[]) || []}
              onChange={(urls) => onChange("images", urls)}
              folder="projects"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isPublished"
              checked={(formData.isPublished as boolean) || false}
              onChange={(e) => onChange("isPublished", e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="isPublished" className="text-sm font-medium">
              Published (visible on site)
            </label>
          </div>
        </>
      )}
    />
  );
}
