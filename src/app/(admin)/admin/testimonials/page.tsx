"use client";

import { CrudPage } from "@/components/admin/crud-page";
import { Star } from "lucide-react";
import type { Testimonial } from "@/lib/types";

const columns = [
  { key: "name" as const, label: "Name", render: (item: Testimonial) => <span className="font-medium">{item.name}</span> },
  { key: "location" as const, label: "Location" },
  { key: "projectType" as const, label: "Project Type" },
  {
    key: "isVisible" as const,
    label: "Visible",
    render: (item: Testimonial) => (
      <span className={`text-xs px-2 py-0.5 rounded-full ${item.isVisible ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}`}>
        {item.isVisible ? "Visible" : "Hidden"}
      </span>
    ),
  },
];

const defaultValues = { name: "", location: "", text: "", rating: 5, projectType: "", isVisible: true };

export default function AdminTestimonialsPage() {
  return (
    <CrudPage<Testimonial>
      title="Testimonials"
      collection="testimonials"
      columns={columns}
      icon={<Star className="h-6 w-6 text-primary" />}
      defaultValues={defaultValues}
      renderForm={(_, onChange, formData) => (
        <>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Customer Name *</label>
              <input value={(formData.name as string) || ""} onChange={(e) => onChange("name", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Location</label>
              <input value={(formData.location as string) || ""} onChange={(e) => onChange("location", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Traverse City, MI" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Testimonial Text *</label>
            <textarea value={(formData.text as string) || ""} onChange={(e) => onChange("text", e.target.value)} rows={4} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
          </div>
          <div className="grid sm:grid-cols-3 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Rating (1-5)</label>
              <input type="number" min={1} max={5} value={(formData.rating as number) || 5} onChange={(e) => onChange("rating", parseInt(e.target.value) || 5)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Project Type</label>
              <input value={(formData.projectType as string) || ""} onChange={(e) => onChange("projectType", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Water Line" />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input type="checkbox" id="isVisible" checked={(formData.isVisible as boolean) ?? true} onChange={(e) => onChange("isVisible", e.target.checked)} className="h-4 w-4" />
              <label htmlFor="isVisible" className="text-sm font-medium">Visible on site</label>
            </div>
          </div>
        </>
      )}
    />
  );
}
