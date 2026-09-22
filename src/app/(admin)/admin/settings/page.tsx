"use client";

import { useState } from "react";
import { useFirestoreDocument } from "@/hooks/use-firestore-document";
import { useAuth } from "@/context/auth-provider";
import { updateSettings, updateIntegrationSecret } from "@/actions/crud";
import { Settings, Save, Loader2 } from "lucide-react";

export default function AdminSettingsPage() {
  const { data, loading } = useFirestoreDocument<Record<string, unknown>>("siteSettings/general");
  const { data: boreOnSecret } = useFirestoreDocument<Record<string, unknown>>(
    "integrationSecrets/boreOn"
  );
  const { data: leadsSyncSecret } = useFirestoreDocument<Record<string, unknown>>(
    "integrationSecrets/leadsSync"
  );
  const { getIdToken } = useAuth();
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [boreOn, setBoreOn] = useState<Record<string, string>>({});
  const [leadsSync, setLeadsSync] = useState<string | null>(null);
  const [writeBack, setWriteBack] = useState<boolean | null>(null);
  const { data: anthropicSecret } = useFirestoreDocument<Record<string, unknown>>(
    "integrationSecrets/anthropic"
  );
  const [anthropicKey, setAnthropicKey] = useState<string | null>(null);
  const { data: calSecret } = useFirestoreDocument<Record<string, unknown>>(
    "integrationSecrets/googleCalendar"
  );
  const [cal, setCal] = useState<Record<string, string>>({});
  const [calInit, setCalInit] = useState(false);
  const [calMsg, setCalMsg] = useState("");
  const [connecting, setConnecting] = useState(false);

  if (calSecret && !calInit) {
    setCal({
      clientId: typeof calSecret.clientId === "string" ? calSecret.clientId : "",
      clientSecret: typeof calSecret.clientSecret === "string" ? calSecret.clientSecret : "",
    });
    setCalInit(true);
  }
  const calConnected = Boolean(calSecret?.refreshToken);

  const connectCalendar = async () => {
    setConnecting(true);
    setCalMsg("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      await updateIntegrationSecret(
        "googleCalendar",
        { clientId: cal.clientId ?? "", clientSecret: cal.clientSecret ?? "" },
        token
      );
      const res = await fetch("/api/google/oauth/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      window.location.href = json.url;
    } catch (e) {
      setCalMsg(e instanceof Error ? e.message : "Couldn't start the Google sign-in");
      setConnecting(false);
    }
  };
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [boreOnInit, setBoreOnInit] = useState(false);

  if (data && !initialized) {
    const fields: Record<string, string> = {};
    Object.entries(data).forEach(([key, value]) => {
      if (typeof value === "string") fields[key] = value;
    });
    setFormData(fields);
    setInitialized(true);
  }

  if (boreOnSecret && !boreOnInit) {
    setBoreOn({
      baseUrl: typeof boreOnSecret.baseUrl === "string" ? boreOnSecret.baseUrl : "",
      apiKey: typeof boreOnSecret.apiKey === "string" ? boreOnSecret.apiKey : "",
    });
    setBoreOnInit(true);
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
      if (boreOn.baseUrl !== undefined || boreOn.apiKey !== undefined) {
        await updateIntegrationSecret(
          "boreOn",
          { baseUrl: boreOn.baseUrl ?? "", apiKey: boreOn.apiKey ?? "" },
          token
        );
      }
      if (leadsSync !== null || writeBack !== null) {
        await updateIntegrationSecret(
          "leadsSync",
          {
            ...(leadsSync !== null ? { secret: leadsSync.trim() } : {}),
            ...(writeBack !== null ? { writeBack } : {}),
          },
          token
        );
      }
      if (anthropicKey !== null) {
        await updateIntegrationSecret("anthropic", { apiKey: anthropicKey.trim() }, token);
      }
      if (calInit) {
        await updateIntegrationSecret(
          "googleCalendar",
          { clientId: (cal.clientId ?? "").trim(), clientSecret: (cal.clientSecret ?? "").trim() },
          token
        );
      }
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
                <input value={formData.quoteSmsTo || ""} onChange={(e) => updateField("quoteSmsTo", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="+12312640757" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Slack incoming webhook (quotes and new leads)</label>
              <input value={formData.quoteSlackWebhook || ""} onChange={(e) => updateField("quoteSlackWebhook", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="https://hooks.slack.com/services/..." />
              <p className="text-xs text-muted-foreground">
                Slack: Apps &rarr; Incoming Webhooks &rarr; Add to channel, then paste the URL here.
              </p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6 space-y-5">
            <h2 className="text-lg font-semibold">Lead sync (Meta ads Google Sheet)</h2>
            <p className="text-sm text-muted-foreground">
              Make up a long random secret, save it here, then paste the same
              value into the sheet&apos;s Apps Script when it asks. New sheet rows
              become leads; your stages write back to the firm&apos;s tracker columns.
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Sync secret</label>
              <input
                type="password"
                value={leadsSync ?? ((leadsSyncSecret?.secret as string) || "")}
                onChange={(e) => setLeadsSync(e.target.value)}
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="something long and random"
              />
            </div>
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={writeBack ?? leadsSyncSecret?.writeBack === true}
                onChange={(e) => setWriteBack(e.target.checked)}
              />
              <span>
                <span className="font-medium">Write my statuses back to the firm&apos;s sheet.</span>
                <span className="block text-muted-foreground">
                  Off by default. When on, the sync only fills blank cells or moves a
                  status forward (blank to Yes, No to Yes). It never clears a cell and
                  never changes money or objection cells the firm already filled in.
                  Every cell it changes is logged on the lead&apos;s history.
                </span>
              </span>
            </label>
          </div>

          <div className="bg-card border border-border rounded-lg p-6 space-y-5">
            <h2 className="text-lg font-semibold">Voice assistant (Claude)</h2>
            <p className="text-sm text-muted-foreground">
              Powers the mic button in the admin: talk, it drafts the pipeline
              changes, you confirm. Get a key at console.anthropic.com.
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Anthropic API key</label>
              <input
                type="password"
                value={anthropicKey ?? ((anthropicSecret?.apiKey as string) || "")}
                onChange={(e) => setAnthropicKey(e.target.value)}
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="sk-ant-..."
              />
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6 space-y-5">
            <h2 className="text-lg font-semibold">Google Calendar (shared walks and appointments)</h2>
            <p className="text-sm text-muted-foreground">
              Every walk or appointment set on a lead goes on the admin@fibernorth.com
              calendar. Status:{" "}
              {calConnected ? (
                <span className="text-accent font-medium">
                  connected{typeof calSecret?.accountEmail === "string" && calSecret.accountEmail ? ` as ${calSecret.accountEmail}` : ""}
                </span>
              ) : (
                <span className="text-destructive font-medium">not connected</span>
              )}
            </p>
            <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
              <li>console.cloud.google.com, project fn-underground: APIs &amp; Services &rarr; Library &rarr; enable &quot;Google Calendar API&quot;.</li>
              <li>APIs &amp; Services &rarr; Credentials &rarr; Create credentials &rarr; OAuth client ID &rarr; Web application. Add this redirect URI: <code>https://fibernorth.com/api/google/oauth/callback</code></li>
              <li>Paste the client ID and secret below, then click Connect and sign in as admin@fibernorth.com.</li>
            </ol>
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">OAuth client ID</label>
                <input
                  value={cal.clientId || ""}
                  onChange={(e) => setCal((p) => ({ ...p, clientId: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="....apps.googleusercontent.com"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">OAuth client secret</label>
                <input
                  type="password"
                  value={cal.clientSecret || ""}
                  onChange={(e) => setCal((p) => ({ ...p, clientSecret: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="GOCSPX-..."
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={connectCalendar}
                disabled={connecting || !cal.clientId || !cal.clientSecret}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {connecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {calConnected ? "Reconnect Google Calendar" : "Connect Google Calendar"}
              </button>
              {calMsg && <span className="text-sm text-destructive">{calMsg}</span>}
              {typeof window !== "undefined" && new URLSearchParams(window.location.search).get("calendar") === "connected" && (
                <span className="text-sm text-accent">Connected.</span>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6 space-y-5">
            <h2 className="text-lg font-semibold">Bore-ON Integration</h2>
            <p className="text-sm text-muted-foreground">
              Fill these in once the Design Center import API is live and the
              quote workbench gets a &quot;Send to Bore-ON&quot; button. The
              key is stored admin-only, never in public site data.
            </p>
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Bore-ON base URL</label>
                <input
                  value={boreOn.baseUrl || ""}
                  onChange={(e) => setBoreOn((p) => ({ ...p, baseUrl: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="https://app.bore-on.com"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">API key</label>
                <input
                  type="password"
                  value={boreOn.apiKey || ""}
                  onChange={(e) => setBoreOn((p) => ({ ...p, apiKey: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="paste the key from Bore-ON"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
