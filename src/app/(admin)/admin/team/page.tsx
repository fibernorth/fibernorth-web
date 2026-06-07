"use client";

import { CrudPage } from "@/components/admin/crud-page";
import { ImageUpload } from "@/components/admin/image-upload";
import { Users } from "lucide-react";
import type { TeamMember } from "@/lib/types";
import { orderBy } from "firebase/firestore";

const columns = [
  { key: "name" as const, label: "Name", render: (item: TeamMember) => <span className="font-medium">{item.name}</span> },
  { key: "title" as const, label: "Title" },
  {
    key: "isActive" as const,
    label: "Active",
    render: (item: TeamMember) => (
      <span className={`text-xs px-2 py-0.5 rounded-full ${item.isActive ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}`}>
        {item.isActive ? "Active" : "Inactive"}
      </span>
    ),
  },
];

const defaultValues = {
  name: "",
  title: "",
  bio: "",
  photo: "",
  sortOrder: 0,
  isActive: true,
};

export default function AdminTeamPage() {
  return (
    <CrudPage<TeamMember>
      title="Team Members"
      collection="team"
      columns={columns}
      icon={<Users className="h-6 w-6 text-primary" />}
      defaultValues={defaultValues}
      constraints={[orderBy("sortOrder", "asc")]}
      orderByField="sortOrder"
      renderForm={(_, onChange, formData) => (
        <>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name *</label>
              <input value={(formData.name as string) || ""} onChange={(e) => onChange("name", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title *</label>
              <input value={(formData.title as string) || ""} onChange={(e) => onChange("title", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Bio</label>
            <textarea value={(formData.bio as string) || ""} onChange={(e) => onChange("bio", e.target.value)} rows={3} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Photo</label>
            <ImageUpload value={(formData.photo as string) || ""} onChange={(url) => onChange("photo", url)} folder="team" />
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
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
