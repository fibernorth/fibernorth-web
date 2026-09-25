"use client";

import { useCallback, useEffect, useState } from "react";
import { useFirestoreDocument } from "@/hooks/use-firestore-document";
import { useAuth } from "@/context/auth-provider";
import { updateSettings, updateIntegrationSecret } from "@/actions/crud";
import {
  getIntegrationStatus,
  type IntegrationStatus,
  type SecretHint,
} from "@/actions/integrations";
import { SITE_URL } from "@/lib/proposal";
import { Settings, Save, Loader2 } from "lucide-react";

function secretPlaceholder(h: SecretHint | undefined, fallback: string): string {
  if (!h?.set) return fallback;
  return `Saved${h.last4 ? ` (ends ${h.last4})` : ""} \u2014 type to replace`;
}

export default function AdminSettingsPage() {
  const { data, loading } = useFirestoreDocument<Record<string, unknown>>("siteSettings/general");
  const { getIdToken } = useAuth();
  const [formData, setFormData] = useState<Record<string, string>>({});
  // Secrets are never read into the browser: the server returns only
  // set/not-set + last-4 hints. Secret inputs start blank; blank = keep.
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [boreOnBaseUrl, setBoreOnBaseUrl] = useState<string | null>(null);
  const [boreOnApiKey, setBoreOnApiKey] = useState("");
  const [boreOnWebhookSecret, setBoreOnWebhookSecret] = useState("");
  const [leadsSync, setLeadsSync] = useState("");
  const [writeBack, setWriteBack] = useState<boolean | null>(null);
  const [anthropicKey, setAnthropicKey] = useState("");
  const [calClientId, setCalClientId] = useState<string | null>(null);
  const [calClientSecret, setCalClientSecret] = useState("");
  const [calMsg, setCalMsg] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      setStatus(await getIntegrationStatus(token));
      setStatusError("");
    } catch (err) {
      console.error("Couldn't load integration status:", err);
      setStatusError("Couldn't load integration status.");
    }
  }, [getIdToken]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const calSecret = status?.googleCalendar;
  const calConnected = Boolean(calSecret?.connected);
  const calClientIdValue = calClientId ?? calSecret?.clientId ?? "";
  const calHasSecret = Boolean(calClientSecret.trim() || calSecret?.clientSecret.set);

  const calendarPatch = (): Record<string, string> => ({
    ...(calClientId !== null ? { clientId: calClientId.trim() } : {}),
    ...(calClientSecret.trim() ? { clientSecret: calClientSecret.trim() } : {}),
  });

  const connectCalendar = async () => {
    setConnecting(true);
    setCalMsg("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const patch = calendarPatch();
      if (Object.keys(patch).length) {
        await updateIntegrationSecret("googleCalendar", patch, token);
      }
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
    setSaveMsg("");
    try {
      const token = await getIdToken();
      if (!token) return;
      await updateSettings("general", formData, token);
      // Only send what was edited; blank secret inputs keep the stored value.
      const boreOnPatch: Record<string, string> = {
        ...(boreOnBaseUrl !== null ? { baseUrl: boreOnBaseUrl.trim() } : {}),
        ...(boreOnApiKey.trim() ? { apiKey: boreOnApiKey.trim() } : {}),
        ...(boreOnWebhookSecret.trim() ? { webhookSecret: boreOnWebhookSecret.trim() } : {}),
      };
      if (Object.keys(boreOnPatch).length) {
        await updateIntegrationSecret("boreOn", boreOnPatch, token);
      }
      if (leadsSync.trim() || writeBack !== null) {
        await updateIntegrationSecret(
          "leadsSync",
          {
            ...(leadsSync.trim() ? { secret: leadsSync.trim() } : {}),
            ...(writeBack !== null ? { writeBack } : {}),
          },
          token
        );
      }
      if (anthropicKey.trim()) {
        await updateIntegrationSecret("anthropic", { apiKey: anthropicKey.trim() }, token);
      }
      const calPatch = calendarPatch();
      if (Object.keys(calPatch).length) {
        await updateIntegrationSecret("googleCalendar", calPatch, token);
      }
      setBoreOnBaseUrl(null);
      setBoreOnApiKey("");
      setBoreOnWebhookSecret("");
      setLeadsSync("");
      setWriteBack(null);
      setAnthropicKey("");
      setCalClientId(null);
      setCalClientSecret("");
      await loadStatus();
      setSaveMsg("Saved.");
    } catch (err) {
      console.error("Save failed:", err);
      setSaveMsg("Save failed.");
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
        <div className="flex items-center gap-3">
        {saveMsg && <span className="text-sm text-muted-foreground">{saveMsg}</span>}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </button>
        </div>
      </div>
      {statusError && <p className="text-sm text-destructive">{statusError}</p>}

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
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Google review link</label>
              <input
                type="url"
                inputMode="url"
                value={formData.googleReviewUrl || ""}
                onChange={(e) => updateField("googleReviewUrl", e.target.value.trim())}
                className="w-full px-3 py-2 min-h-11 sm:min-h-0 bg-muted border border-border rounded-md text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="https://g.page/r/.../review"
              />
              <p className="text-xs text-muted-foreground">
                Goes in the &quot;Ask for Google review&quot; text and email after a job is done. In Google Business
                Profile, choose &quot;Ask for reviews&quot; and copy the link. This is public, which is fine for a review link.
              </p>
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
                value={leadsSync}
                onChange={(e) => setLeadsSync(e.target.value)}
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={secretPlaceholder(status?.leadsSync.secret, "something long and random")}
                autoComplete="off"
              />
            </div>
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={writeBack ?? status?.leadsSync.writeBack ?? true}
                onChange={(e) => setWriteBack(e.target.checked)}
              />
              <span>
                <span className="font-medium">Write my statuses back to the firm&apos;s sheet.</span>
                <span className="block text-muted-foreground">
                  On by default. The sync only fills blank cells or moves a
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
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={secretPlaceholder(status?.anthropic.apiKey, "sk-ant-...")}
                autoComplete="off"
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
                  connected{calSecret?.accountEmail ? ` as ${calSecret.accountEmail}` : ""}
                  {calSecret?.calendarId ? ` (calendar ${calSecret.calendarId})` : ""}
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
                  value={calClientIdValue}
                  onChange={(e) => setCalClientId(e.target.value)}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="....apps.googleusercontent.com"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">OAuth client secret</label>
                <input
                  type="password"
                  value={calClientSecret}
                  onChange={(e) => setCalClientSecret(e.target.value)}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={secretPlaceholder(calSecret?.clientSecret, "GOCSPX-...")}
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={connectCalendar}
                disabled={connecting || !calClientIdValue.trim() || !calHasSecret}
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
              The quote workbench sends drawn jobs to Bore-ON Design Center and
              gets the finished design back. Mint the key in Bore-ON under
              Admin → Integrations → Design import API. Everything here is
              stored admin-only, never in public site data.
            </p>
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Bore-ON base URL</label>
                <input
                  value={boreOnBaseUrl ?? status?.boreOn.baseUrl ?? ""}
                  onChange={(e) => setBoreOnBaseUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="https://bore-on.com"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">API key</label>
                <input
                  type="password"
                  value={boreOnApiKey}
                  onChange={(e) => setBoreOnApiKey(e.target.value)}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={secretPlaceholder(status?.boreOn.apiKey, "bo.<company>.<secret>")}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Callback secret</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={boreOnWebhookSecret}
                    onChange={(e) => setBoreOnWebhookSecret(e.target.value)}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={secretPlaceholder(status?.boreOn.webhookSecret, "shared with Bore-ON")}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const bytes = new Uint8Array(32);
                      crypto.getRandomValues(bytes);
                      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
                      setBoreOnWebhookSecret(hex);
                    }}
                    className="shrink-0 px-3 py-2 border border-border rounded-md text-sm hover:bg-muted transition-colors"
                  >
                    Generate
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Paste the same secret on the key in Bore-ON so it can sign what it sends us.
                  A saved secret is never shown again, so copy a generated one before you save.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Callback URL (paste into Bore-ON)</label>
                <input
                  readOnly
                  value={`${SITE_URL}/api/bore-on/webhook`}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Bore-ON calls it when a design is drawn up, approved or changed, and the quote re-prices.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
