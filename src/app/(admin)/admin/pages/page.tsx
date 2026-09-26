"use client";

import { useState } from "react";
import { useFirestoreDocument } from "@/hooks/use-firestore-document";
import { useAuth } from "@/context/auth-provider";
import { updatePageContent } from "@/actions/content";
import { FileText, Save, Loader2 } from "lucide-react";

const pages = [
  { id: "home", label: "Home" },
  { id: "about", label: "About" },
  { id: "services", label: "Services" },
  { id: "whyTrenchless", label: "Why Trenchless" },
  { id: "contact", label: "Contact" },
];

export default function AdminPagesPage() {
  const [activeTab, setActiveTab] = useState("home");
  const { data, loading } = useFirestoreDocument<Record<string, unknown>>(
    `siteContent/${activeTab}`
  );
  const { getIdToken } = useAuth();
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  // What the editor loaded (to send only changed fields) and the page's
  // updatedAt then (the server refuses a save over a newer version).
  const [loaded, setLoaded] = useState<Record<string, string>>({});
  const [baseUpdatedAt, setBaseUpdatedAt] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  // Sync Firestore data to form when it loads (or when the page doesn't exist yet)
  if (!loading && !initialized && (!data || data.id === activeTab)) {
    const fields: Record<string, string> = {};
    Object.entries(data ?? {}).forEach(([key, value]) => {
      if (typeof value === "string" && key !== "updatedAt" && key !== "id") fields[key] = value;
    });
    setFormData(fields);
    setLoaded(fields);
    setBaseUpdatedAt(typeof data?.updatedAt === "string" ? data.updatedAt : "");
    setInitialized(true);
  }

  const handleTabChange = (id: string) => {
    setActiveTab(id);
    setFormData({});
    setLoaded({});
    setStatus(null);
    setInitialized(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const token = await getIdToken();
      if (!token) {
        setStatus({ kind: "error", text: "Your session has expired. Sign in again." });
        return;
      }
      const changed = Object.fromEntries(Object.entries(formData).filter(([k, v]) => v !== (loaded[k] ?? "")));
      if (!Object.keys(changed).length) {
        setStatus({ kind: "ok", text: "No changes." });
        return;
      }
      const r = await updatePageContent(activeTab, changed, token, baseUpdatedAt);
      if (!r.ok) {
        setStatus({ kind: "error", text: r.error });
        return;
      }
      setStatus({ kind: "ok", text: "Saved." });
      // What was saved is the new base.
      setLoaded((prev) => ({ ...prev, ...changed }));
      if (r.updatedAt) setBaseUpdatedAt(r.updatedAt);
    } catch (err) {
      console.error("Save failed:", err);
      setStatus({ kind: "error", text: "Save failed. Please try again; if it keeps happening, sign out and back in." });
    } finally {
      setSaving(false);
    }
  };

  const updateField = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Page Content</h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Changes
        </button>
      </div>

      {status && (
        <p
          role={status.kind === "error" ? "alert" : "status"}
          className={
            status.kind === "error"
              ? "border border-destructive/50 bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
              : "text-sm text-muted-foreground"
          }
        >
          {status.text}
        </p>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {pages.map((page) => (
          <button
            key={page.id}
            onClick={() => handleTabChange(page.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === page.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {page.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg p-6 space-y-5">
          {activeTab === "home" && (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hero Title</label>
                <input value={formData.heroTitle || ""} onChange={(e) => updateField("heroTitle", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="We Bore So You Don't Have to Dig" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hero Subtitle</label>
                <textarea value={formData.heroSubtitle || ""} onChange={(e) => updateField("heroSubtitle", e.target.value)} rows={2} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">CTA Button Text</label>
                <input value={formData.ctaText || ""} onChange={(e) => updateField("ctaText", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Get a Free Quote" />
              </div>
            </>
          )}
          {activeTab === "about" && (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Company Story</label>
                <textarea value={formData.story || ""} onChange={(e) => updateField("story", e.target.value)} rows={8} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
            </>
          )}
          {activeTab === "services" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Services Page Introduction</label>
              <textarea value={formData.intro || ""} onChange={(e) => updateField("intro", e.target.value)} rows={4} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
            </div>
          )}
          {activeTab === "whyTrenchless" && (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Page Introduction</label>
                <textarea value={formData.intro || ""} onChange={(e) => updateField("intro", e.target.value)} rows={4} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Cost Comparison Text</label>
                <textarea value={formData.costComparison || ""} onChange={(e) => updateField("costComparison", e.target.value)} rows={4} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
            </>
          )}
          {activeTab === "contact" && (
            <p className="text-sm text-muted-foreground">
              Contact page content is managed in Settings (phone, email, address, hours).
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Note: this editor saves to the database, but the public pages do not read from it yet — text changes here will not appear on the site. Ask your developer to wire a page up before relying on it.
          </p>
        </div>
      )}
    </div>
  );
}
