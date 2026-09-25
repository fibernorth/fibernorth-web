"use client";

import { useEffect, useState } from "react";
import { useFirestoreDocument } from "@/hooks/use-firestore-document";
import { useAuth } from "@/context/auth-provider";
import { updateSettings, updateIntegrationSecret } from "@/actions/crud";
import { SITE_URL } from "@/lib/proposal";
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

  // QuickBooks Online: same shape as the calendar connection, plus which
  // items the work and the materials bill against.
  const { data: qboSecret } = useFirestoreDocument<Record<string, unknown>>("integrationSecrets/quickbooks");
  const [qbo, setQbo] = useState<Record<string, string>>({});
  const [qboFlags, setQboFlags] = useState<{ recordEstimates: boolean; emailFromQuickBooks: boolean }>({ recordEstimates: true, emailFromQuickBooks: false });
  const [qboInit, setQboInit] = useState(false);
  const [qboMsg, setQboMsg] = useState("");
  const [qboConnecting, setQboConnecting] = useState(false);
  const [qboItems, setQboItems] = useState<Array<{ id: string; name: string; taxable: boolean }> | null>(null);
  if (qboSecret && !qboInit) {
    const str = (k: string) => (typeof qboSecret[k] === "string" ? (qboSecret[k] as string) : "");
    setQbo({
      clientId: str("clientId"),
      clientSecret: str("clientSecret"),
      environment: str("environment") === "sandbox" ? "sandbox" : "production",
      workItemId: str("workItemId"),
      materialItemId: str("materialItemId"),
    });
    setQboFlags({
      recordEstimates: qboSecret.recordEstimates !== false,
      emailFromQuickBooks: qboSecret.emailFromQuickBooks === true,
    });
    setQboInit(true);
  }
  const qboConnected = Boolean(qboSecret?.refreshToken && qboSecret?.realmId);
  useEffect(() => {
    if (!qboConnected || qboItems !== null) return;
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/quickbooks/items", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => ({}));
      setQboItems(res.ok ? json.items : []);
      if (!res.ok) setQboMsg(json.error || "Couldn't list the QuickBooks items.");
    })();
  }, [qboConnected, qboItems, getIdToken]);

  const connectQuickBooks = async () => {
    setQboConnecting(true);
    setQboMsg("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      await updateIntegrationSecret(
        "quickbooks",
        { clientId: (qbo.clientId ?? "").trim(), clientSecret: (qbo.clientSecret ?? "").trim(), environment: qbo.environment || "production" },
        token
      );
      const res = await fetch("/api/quickbooks/oauth/start", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      window.location.href = json.url;
    } catch (e) {
      setQboMsg(e instanceof Error ? e.message : "Couldn't start the QuickBooks sign-in");
      setQboConnecting(false);
    }
  };

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
      webhookSecret: typeof boreOnSecret.webhookSecret === "string" ? boreOnSecret.webhookSecret : "",
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
      if (boreOnInit) {
        await updateIntegrationSecret(
          "boreOn",
          {
            baseUrl: (boreOn.baseUrl ?? "").trim(),
            apiKey: (boreOn.apiKey ?? "").trim(),
            webhookSecret: (boreOn.webhookSecret ?? "").trim(),
          },
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
      if (qboInit) {
        const pick = (id: string) => qboItems?.find((i) => i.id === id);
        await updateIntegrationSecret(
          "quickbooks",
          {
            clientId: (qbo.clientId ?? "").trim(),
            clientSecret: (qbo.clientSecret ?? "").trim(),
            environment: qbo.environment || "production",
            workItemId: qbo.workItemId || "",
            workItemName: pick(qbo.workItemId || "")?.name || "",
            materialItemId: qbo.materialItemId || "",
            materialItemName: pick(qbo.materialItemId || "")?.name || "",
            recordEstimates: qboFlags.recordEstimates,
            emailFromQuickBooks: qboFlags.emailFromQuickBooks,
          },
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
            <h2 className="text-lg font-semibold">QuickBooks Online (estimates)</h2>
            <p className="text-sm text-muted-foreground">
              Every quote you send becomes an estimate in QuickBooks, updated when you re-send and
              marked accepted or rejected when the customer answers. Status:{" "}
              {qboConnected ? (
                <span className="text-accent font-medium">
                  connected{typeof qboSecret?.companyName === "string" && qboSecret.companyName ? ` to ${qboSecret.companyName}` : ""}
                  {qbo.environment === "sandbox" ? " (sandbox)" : ""}
                </span>
              ) : (
                <span className="text-destructive font-medium">not connected</span>
              )}
            </p>
            <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
              <li>developer.intuit.com &rarr; Create an app &rarr; QuickBooks Online and Payments. Name it &quot;FiberNorth CRM&quot;.</li>
              <li>Keys &amp; credentials: add this redirect URI: <code>https://fibernorth.com/api/quickbooks/oauth/callback</code>. Sandbox keys work right away; production keys unlock after Intuit&apos;s short app questionnaire.</li>
              <li>Paste the client ID and secret below, pick the environment, click Connect and sign in to QuickBooks. Then pick the two items and Save.</li>
            </ol>
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Client ID</label>
                <input
                  value={qbo.clientId || ""}
                  onChange={(e) => setQbo((p) => ({ ...p, clientId: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="AB...."
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Client secret</label>
                <input
                  type="password"
                  value={qbo.clientSecret || ""}
                  onChange={(e) => setQbo((p) => ({ ...p, clientSecret: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Environment</label>
                <select
                  value={qbo.environment || "production"}
                  onChange={(e) => setQbo((p) => ({ ...p, environment: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="production">Production (the real books)</option>
                  <option value="sandbox">Sandbox (test company)</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={connectQuickBooks}
                disabled={qboConnecting || !qbo.clientId || !qbo.clientSecret}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {qboConnecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {qboConnected ? "Reconnect QuickBooks" : "Connect QuickBooks"}
              </button>
              {qboMsg && <span className="text-sm text-destructive">{qboMsg}</span>}
              {typeof window !== "undefined" && new URLSearchParams(window.location.search).get("quickbooks") === "connected" && (
                <span className="text-sm text-accent">Connected.</span>
              )}
              {typeof window !== "undefined" && (new URLSearchParams(window.location.search).get("quickbooks") || "").startsWith("error") && (
                <span className="text-sm text-destructive">QuickBooks didn&apos;t connect. Check the keys and the redirect URI, then try again.</span>
              )}
            </div>
            {qboConnected && (
              <div className="space-y-4 border-t border-border pt-4">
                <div className="grid sm:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Work bills against</label>
                    <select
                      value={qbo.workItemId || ""}
                      onChange={(e) => setQbo((p) => ({ ...p, workItemId: e.target.value }))}
                      className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">{qboItems === null ? "Loading items..." : "Pick a service item"}</option>
                      {(qboItems ?? []).map((i) => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">Usually &quot;Directional Drilling&quot;. Not taxed.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Materials bill against</label>
                    <select
                      value={qbo.materialItemId || ""}
                      onChange={(e) => setQbo((p) => ({ ...p, materialItemId: e.target.value }))}
                      className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">{qboItems === null ? "Loading items..." : "Pick a materials item"}</option>
                      {(qboItems ?? []).map((i) => (
                        <option key={i.id} value={i.id}>{i.name}{i.taxable ? " (taxable)" : ""}</option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">A taxable item; QuickBooks adds Michigan sales tax itself.</p>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={qboFlags.recordEstimates}
                    onChange={(e) => setQboFlags((f) => ({ ...f, recordEstimates: e.target.checked }))}
                  />
                  Record every sent quote as an estimate
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={qboFlags.emailFromQuickBooks}
                    onChange={(e) => setQboFlags((f) => ({ ...f, emailFromQuickBooks: e.target.checked }))}
                  />
                  Also email the estimate from QuickBooks
                  <span className="text-xs text-muted-foreground">(our own email already carries the approve link and the map)</span>
                </label>
              </div>
            )}
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
                  value={boreOn.baseUrl || ""}
                  onChange={(e) => setBoreOn((p) => ({ ...p, baseUrl: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="https://bore-on.com"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">API key</label>
                <input
                  type="password"
                  value={boreOn.apiKey || ""}
                  onChange={(e) => setBoreOn((p) => ({ ...p, apiKey: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="bo.<company>.<secret>"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Callback secret</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={boreOn.webhookSecret || ""}
                    onChange={(e) => setBoreOn((p) => ({ ...p, webhookSecret: e.target.value }))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="shared with Bore-ON"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const bytes = new Uint8Array(32);
                      crypto.getRandomValues(bytes);
                      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
                      setBoreOn((p) => ({ ...p, webhookSecret: hex }));
                    }}
                    className="shrink-0 px-3 py-2 border border-border rounded-md text-sm hover:bg-muted transition-colors"
                  >
                    Generate
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Paste the same secret on the key in Bore-ON so it can sign what it sends us.
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
