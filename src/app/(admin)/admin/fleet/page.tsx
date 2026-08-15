"use client";

import { CrudPage } from "@/components/admin/crud-page";
import { ImageUpload } from "@/components/admin/image-upload";
import { Truck } from "lucide-react";
import type { Equipment } from "@/lib/types";
import { orderBy } from "firebase/firestore";

const columns = [
  {
    key: "name" as const,
    label: "Equipment",
    render: (item: Equipment) => (
      <span className="font-medium">{item.manufacturer} {item.model}</span>
    ),
  },
  { key: "year" as const, label: "Year", render: (item: Equipment) => item.year > 0 ? String(item.year) : "—" },
  { key: "capability" as const, label: "Capability" },
  {
    key: "isActive" as const,
    label: "Active",
    render: (item: Equipment) => (
      <span className={`text-xs px-2 py-0.5 rounded-full ${item.isActive ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}`}>
        {item.isActive ? "Active" : "Inactive"}
      </span>
    ),
  },
];

const defaultValues = {
  name: "",
  year: 0,
  model: "",
  manufacturer: "",
  capability: "",
  description: "",
  image: "",
  isActive: true,
  sortOrder: 0,
};

export default function AdminFleetPage() {
  return (
    <CrudPage<Equipment>
      title="Fleet"
      itemLabel="Fleet Vehicle"
      collection="fleet"
      columns={columns}
      icon={<Truck className="h-6 w-6 text-primary" />}
      defaultValues={defaultValues}
      constraints={[orderBy("sortOrder", "asc")]}
      orderByField="sortOrder"
      renderForm={(_, onChange, formData) => (
        <>
          <div className="grid sm:grid-cols-3 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Manufacturer *</label>
              <input value={(formData.manufacturer as string) || ""} onChange={(e) => onChange("manufacturer", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Model *</label>
              <input value={(formData.model as string) || ""} onChange={(e) => onChange("model", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Year</label>
              <input type="number" value={(formData.year as number) || 0} onChange={(e) => onChange("year", parseInt(e.target.value) || 0)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Capability</label>
            <input value={(formData.capability as string) || ""} onChange={(e) => onChange("capability", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <textarea value={(formData.description as string) || ""} onChange={(e) => onChange("description", e.target.value)} rows={3} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Photo</label>
            <ImageUpload value={(formData.image as string) || ""} onChange={(url) => onChange("image", url)} folder="fleet" />
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
