"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFirestoreDocument } from "@/hooks/use-firestore-document";
import { useAuth } from "@/context/auth-provider";
import { updateSettings, updateIntegrationSecret } from "@/actions/crud";
import {
  getIntegrationStatus,
  type IntegrationStatus,
  type SecretHint,
} from "@/actions/integrations";
import { SITE_URL } from "@/lib/proposal";
import { changedFields, dropCaughtUpEdits, editField, staleEdits, type FieldEdits } from "@/lib/settings-form";
import { Settings, Save, Loader2 } from "lucide-react";
import { RepairRecords } from "@/components/admin/repair-records";
import { OwnerOnlyNote } from "@/components/admin/owner-only";
import { useIsOwner } from "@/hooks/use-is-owner";
import { OWNER_SETTINGS_FIELDS } from "@/lib/settings-fields";

function secretPlaceholder(h: SecretHint | undefined, fallback: string): string {
  if (!h?.set) return fallback;
  return `Saved${h.last4 ? ` (ends ${h.last4})` : ""} \u2014 type to replace`;
}

const FIELD_LABELS: Record<string, string> = {
  companyName: "Company Name",
  legalName: "Legal Name",
  phone: "Phone",
  email: "Email",
  address: "Address",
  city: "City",
  state: "State",
  zip: "ZIP",
  googleReviewUrl: "Google review link",
  quoteEmailTo: "Quote notifications email",
  quoteSmsTo: "Quote notifications SMS",
  quoteSlackWebhook: "Slack webhook",
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function AdminSettingsPage() {
  const { data, loading, error: settingsError } = useFirestoreDocument<Record<string, unknown>>("siteSettings/general");
  const { getIdToken } = useAuth();
  // Notification recipients, integrations and repair are owner only; staff
  // see a short note instead (the server checks too).
  const isOwner = useIsOwner();
  // The stored doc stays live; the form only holds the fields this person
  // edited (with the value they started from), so Save writes just those and
  // a change made elsewhere shows up in every field nobody touched here.
  const stored = useMemo(() => {
    const out: Record<string, string> = {};
    Object.entries(data ?? {}).forEach(([key, value]) => {
      if (typeof value === "string") out[key] = value;
    });
    return out;
  }, [data]);
  const [edits, setEdits] = useState<FieldEdits>({});
  useEffect(() => {
    // An edit that now matches what's stored (saved, or someone else typed
    // the same thing) is no longer an edit.
    setEdits((prev) => dropCaughtUpEdits(prev, stored));
  }, [stored]);
  const val = (key: string) => (key in edits ? edits[key].value : (stored[key] ?? ""));
  const conflicts = staleEdits(edits, stored);
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
    // Re-check when the tab comes back, so the calendar's last sync result
    // and connection state aren't from when the page was opened.
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadStatus();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadStatus]);

  const calSecret = status?.googleCalendar;
  const calConnected = Boolean(calSecret?.connected);
  // The last sync failed more recently than one worked.
  const calFailing = Boolean(
    calSecret?.lastError && calSecret.lastErrorAt && (!calSecret.lastOkAt || calSecret.lastErrorAt > calSecret.lastOkAt)
  );
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
        const r = await updateIntegrationSecret("googleCalendar", patch, token);
        if (!r.ok) throw new Error(r.error);
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

  const updateField = (key: string, value: string) => {
    setEdits((prev) => editField(prev, stored, key, value));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const token = await getIdToken();
      if (!token) return;
      // Only the fields edited here; everything else stays as stored.
      const changed = changedFields(edits, stored);
      if (!isOwner) for (const k of OWNER_SETTINGS_FIELDS) delete changed[k];
      if (Object.keys(changed).length) {
        const r = await updateSettings("general", changed, token);
        if (!r.ok) throw new Error(r.error);
      }
      const saveSecret = async (id: string, data: Record<string, unknown>) => {
        const r = await updateIntegrationSecret(id, data, token);
        if (!r.ok) throw new Error(r.error);
      };
      // Only send what was edited; blank secret inputs keep the stored value.
      const boreOnPatch: Record<string, string> = {
        ...(boreOnBaseUrl !== null ? { baseUrl: boreOnBaseUrl.trim() } : {}),
        ...(boreOnApiKey.trim() ? { apiKey: boreOnApiKey.trim() } : {}),
        ...(boreOnWebhookSecret.trim() ? { webhookSecret: boreOnWebhookSecret.trim() } : {}),
      };
      if (isOwner && Object.keys(boreOnPatch).length) {
        await saveSecret("boreOn", boreOnPatch);
      }
      if (isOwner && (leadsSync.trim() || writeBack !== null)) {
        await saveSecret("leadsSync", {
          ...(leadsSync.trim() ? { secret: leadsSync.trim() } : {}),
          ...(writeBack !== null ? { writeBack } : {}),
        });
      }
      if (isOwner && anthropicKey.trim()) {
        await saveSecret("anthropic", { apiKey: anthropicKey.trim() });
      }
      const calPatch = calendarPatch();
      if (isOwner && Object.keys(calPatch).length) {
        await saveSecret("googleCalendar", calPatch);
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
      const m = err instanceof Error ? err.message : "";
      setSaveMsg(m && !m.includes("Server Components") ? `Save failed: ${m}` : "Save failed.");
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
          disabled={saving || loading || Boolean(settingsError && !data)}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </button>
        </div>
      </div>
      {statusError && <p className="text-sm text-destructive">{statusError}</p>}
      {settingsError && (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t load the saved settings ({settingsError.message}). Don&apos;t save until it loads.
        </p>
      )}
      {conflicts.length > 0 && (
        <p role="alert" className="text-sm border border-secondary/50 bg-secondary/10 rounded-md px-3 py-2">
          Changed elsewhere while you were editing:{" "}
          {conflicts.map((k) => FIELD_LABELS[k] ?? k).join(", ")}. Saving keeps your version of{" "}
          {conflicts.length === 1 ? "that field" : "those fields"}; clear your edit to keep theirs.
        </p>
      )}

      {loading || (settingsError && !data) ? (
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
                <input value={val("companyName")} onChange={(e) => updateField("companyName", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="FiberNorth Underground" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Legal Name</label>
                <input value={val("legalName")} onChange={(e) => updateField("legalName", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="FiberNorth, Inc." />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Phone</label>
                <input value={val("phone")} onChange={(e) => updateField("phone", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email</label>
                <input value={val("email")} onChange={(e) => updateField("email", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Address</label>
              <input value={val("address")} onChange={(e) => updateField("address", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="grid sm:grid-cols-3 gap-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">City</label>
                <input value={val("city")} onChange={(e) => updateField("city", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">State</label>
                <input value={val("state")} onChange={(e) => updateField("state", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">ZIP</label>
                <input value={val("zip")} onChange={(e) => updateField("zip", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Google review link</label>
              <input
                type="url"
                inputMode="url"
                value={val("googleReviewUrl")}
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
            {!isOwner && (
              <p className="text-sm text-muted-foreground">
                <OwnerOnlyNote>Owner only.</OwnerOnlyNote> Where quote and lead notifications go can only be changed by Bill.
              </p>
            )}
            <fieldset disabled={!isOwner} className="space-y-5 disabled:opacity-60">
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Quote notifications email</label>
                <input value={val("quoteEmailTo")} onChange={(e) => updateField("quoteEmailTo", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="office@fibernorth.com" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Quote notifications SMS</label>
                <input value={val("quoteSmsTo")} onChange={(e) => updateField("quoteSmsTo", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="+12312640757" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Slack incoming webhook (quotes and new leads)</label>
              <input value={val("quoteSlackWebhook")} onChange={(e) => updateField("quoteSlackWebhook", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="https://hooks.slack.com/services/..." />
              <p className="text-xs text-muted-foreground">
                Slack: Apps &rarr; Incoming Webhooks &rarr; Add to channel, then paste the URL here.
              </p>
            </div>
            </fieldset>
          </div>

          {!isOwner && (
            <div className="bg-card border border-border rounded-lg p-6 space-y-2">
              <h2 className="text-lg font-semibold">Integrations</h2>
              <p className="text-sm text-muted-foreground">
                <OwnerOnlyNote>Owner only.</OwnerOnlyNote> The lead sheet sync, voice assistant key, Google Calendar
                connection, Bore-ON keys and the record repair tool are managed by Bill.
              </p>
            </div>
          )}

          {isOwner && (
          <>

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
                  status forward (blank to Yes, No to Yes). It never clears a cell the
                  firm filled in and never changes their money or objection cells. It
                  can correct a cell it wrote itself (an undone acceptance). Every
                  cell it writes is logged on the lead&apos;s history.
                </span>
              </span>
            </label>
            <div className="text-sm space-y-1 border-t border-border pt-4">
              <p className="font-medium">Sheet check</p>
              <p className="text-muted-foreground">
                The sheet is the master list of ad leads. Corrections the firm makes
                there (name, phone, email) come into the CRM, and their status or sale
                entries show up in the lead&apos;s history.
              </p>
              {status?.leadsSync.lastSyncAt ? (
                <>
                  <p>
                    Last sync {fmtWhen(status.leadsSync.lastSyncAt)}: {status.leadsSync.sheetRows} sheet rows,{" "}
                    {status.leadsSync.matched} matched to leads.
                  </p>
                  {status.leadsSync.tripped && (
                    <p className="text-destructive font-medium">
                      Safety brake ({fmtWhen(status.leadsSync.tripped.at)}): {status.leadsSync.tripped.reason}
                    </p>
                  )}
                  {status.leadsSync.deferred > 0 && (
                    <p className="text-muted-foreground">
                      {status.leadsSync.deferred} new rows are waiting and come in over the next syncs (at most 200 at a time).
                    </p>
                  )}
                  {status.leadsSync.missingCount > 0 ? (
                    <p className={status.leadsSync.missingChecked ? "text-secondary" : "text-destructive"}>
                      {status.leadsSync.missingChecked
                        ? `${status.leadsSync.missingCount} ad lead${status.leadsSync.missingCount === 1 ? " is" : "s are"} in the CRM but no longer on the sheet (tagged on the lead): `
                        : `${status.leadsSync.missingCount} ad leads didn't match this sync, too many to be real, so nothing was tagged. Check the sheet wasn't mid-edit: `}
                      {status.leadsSync.missing.map((m) => m.name || m.id).join(", ")}
                    </p>
                  ) : (
                    <p className="text-accent">Every ad lead in the CRM is on the sheet.</p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">No sync recorded yet.</p>
              )}
            </div>
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
              {status === null ? (
                statusError ? (
                  <span className="text-destructive font-medium">
                    couldn&apos;t check.{" "}
                    <button type="button" onClick={() => void loadStatus()} className="underline">
                      Try again
                    </button>
                  </span>
                ) : (
                  <span className="text-muted-foreground">checking…</span>
                )
              ) : calConnected ? (
                <span className={calFailing ? "text-secondary font-medium" : "text-accent font-medium"}>
                  connected{calSecret?.accountEmail ? ` as ${calSecret.accountEmail}` : ""}
                  {calSecret?.calendarId ? ` (calendar ${calSecret.calendarId})` : ""}
                  {calFailing ? ", but the last update failed" : ""}
                </span>
              ) : (
                <span className="text-destructive font-medium">not connected</span>
              )}
            </p>
            {calSecret && (calSecret.lastOkAt || calFailing) && (
              <div className="text-sm space-y-0.5">
                {calFailing && (
                  <p className="text-destructive">
                    Last update failed {fmtWhen(calSecret.lastErrorAt)}: {calSecret.lastError}
                    {/invalid_grant|token refresh failed \((400|401)\)/i.test(calSecret.lastError)
                      ? " Google may have revoked access; click Reconnect."
                      : ""}
                  </p>
                )}
                {calSecret.lastOkAt && (
                  <p className="text-muted-foreground">Last worked {fmtWhen(calSecret.lastOkAt)}.</p>
                )}
              </div>
            )}
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
          <RepairRecords />
          </>
          )}
        </div>
      )}
    </div>
  );
}
