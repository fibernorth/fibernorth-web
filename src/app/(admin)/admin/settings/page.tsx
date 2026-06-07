"use client";

import { useState } from "react";
import { useFirestoreDocument } from "@/hooks/use-firestore-document";
import { useAuth } from "@/context/auth-provider";
import { updateSettings } from "@/actions/crud";
import { Settings, Save, Loader2 } from "lucide-react";

export default function AdminSettingsPage() {
  const { data, loading } = useFirestoreDocument<Record<string, unknown>>("siteSettings/general");
  const { getIdToken } = useAuth();
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  if (data && !initialized) {
    const fields: Record<string, string> = {};
    Object.entries(data).forEach(([key, value]) => {
      if (typeof value === "string") fields[key] = value;
    });
    setFormData(fields);
    setInitialized(true);
  }

  const updateField = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      await updateSettings("general", formData, token);
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Site Settings</h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-6 space-y-5">
            <h2 className="text-lg font-semibold">Company Information</h2>
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Company Name</label>
                <input value={formData.companyName || ""} onChange={(e) => updateField("companyName", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="FiberNorth Underground" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Legal Name</label>
                <input value={formData.legalName || ""} onChange={(e) => updateField("legalName", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="FiberNorth, Inc." />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Phone</label>
                <input value={formData.phone || ""} onChange={(e) => updateField("phone", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email</label>
                <input value={formData.email || ""} onChange={(e) => updateField("email", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Address</label>
              <input value={formData.address || ""} onChange={(e) => updateField("address", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="grid sm:grid-cols-3 gap-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">City</label>
                <input value={formData.city || ""} onChange={(e) => updateField("city", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">State</label>
                <input value={formData.state || ""} onChange={(e) => updateField("state", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">ZIP</label>
                <input value={formData.zip || ""} onChange={(e) => updateField("zip", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6 space-y-5">
            <h2 className="text-lg font-semibold">Notification Settings</h2>
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Quote notifications email</label>
                <input value={formData.quoteEmailTo || ""} onChange={(e) => updateField("quoteEmailTo", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="office@fibernorth.com" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Quote notifications SMS</label>
                <input value={formData.quoteSmsTo || ""} onChange={(e) => updateField("quoteSmsTo", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="+12313840105" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
