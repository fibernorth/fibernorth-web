// Lead replies from bill@fibernorth.com's Gmail. Lead emails go out from
// bill@ (reply-to bill@), so a lead's answer lands in that inbox. Every few
// minutes, while someone has the admin open, this reads the new inbox mail
// (metadata only: From, Subject, Date and Gmail's short snippet) and, for each
// message from a lead's address, logs "Replied by email" on the lead through
// the normal save rules: it counts as them responding (New -> Contacted, last
// contact date, Lead Answered = Yes) and puts "Reply to their email" on Due.
//
// Connection: integrationSecrets/gmail holds the refresh token (same Google
// OAuth client as the calendar, from integrationSecrets/googleCalendar).
// integrationStatus/gmail holds the run lease, the last check and the result.
// gmailSeen/{messageId}: one doc per message already logged, created before
// the lead is written so a message is never logged twice.

import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getCalendarSecret, refreshGoogleAccessToken } from "@/lib/google-calendar";
import { saveLeadServer } from "@/services/lead-writes";
import {
  MAX_PAGES,
  PAGE_SIZE,
  buildEmailIndex,
  gmailQuery,
  isGmailId,
  leadsForSender,
  messageTs,
  replyActivity,
  replyPatch,
  shouldRun,
  type LeadForMatch,
} from "@/lib/gmail-replies";
import { todayISO } from "@/lib/leads";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailSecret {
  refreshToken?: string;
  accountEmail?: string;
  connectedAt?: string;
  pendingState?: string;
  pendingStateAt?: string;
}

export interface GmailStatus {
  /** Lease: when the current or last run started (ISO). */
  runStartedAt?: string;
  /** Unix seconds the last successful run started; the next search starts here (minus the overlap). */
  lastCheckedEpoch?: number;
  lastOkAt?: string;
  lastError?: string;
  lastErrorAt?: string;
  /** Last successful run: messages read, replies logged. */
  lastScanned?: number;
  lastLogged?: number;
  /** Replies logged since connecting. */
  totalLogged?: number;
  /** The last run stopped at the page limit (older mail in the window was left). */
  truncated?: boolean;
}

function db(): Firestore {
  return getFirestore(initializeAdminApp());
}

export async function getGmailSecret(): Promise<GmailSecret> {
  const snap = await db().collection("integrationSecrets").doc("gmail").get();
  return (snap.data() as GmailSecret | undefined) ?? {};
}

export async function saveGmailSecret(patch: Partial<GmailSecret>): Promise<void> {
  await db()
    .collection("integrationSecrets")
    .doc("gmail")
    .set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
}

/** Forget the Gmail login (Google is asked to revoke it, best effort). */
export async function disconnectGmail(): Promise<{ revoked: boolean }> {
  const s = await getGmailSecret();
  let revoked = false;
  if (s.refreshToken) {
    try {
      const res = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: s.refreshToken }),
      });
      revoked = res.ok;
    } catch {
      // Forget it here either way.
    }
  }
  await saveGmailSecret({ refreshToken: "", accountEmail: "", connectedAt: "", pendingState: "", pendingStateAt: "" });
  // The next connection starts a fresh three-day look back.
  await db()
    .collection("integrationStatus")
    .doc("gmail")
    .set({ lastCheckedEpoch: 0, lastError: "", lastErrorAt: "" }, { merge: true });
  return { revoked };
}

export type GmailSyncResult =
  | { ok: true; skipped: true; reason: "not_connected" | "throttled" }
  | { ok: true; skipped: false; scanned: number; logged: number; leads: number; truncated: boolean }
  | { ok: false; error: string };

interface GmailMessage {
  id: string;
  internalDate?: string;
  snippet?: string;
  payload?: { headers?: Array<{ name?: string; value?: string }> };
}

async function gmailGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GMAIL_API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const reason = /"message"\s*:\s*"([^"]+)"/.exec(detail)?.[1] || "";
    if (res.status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(detail)) {
      throw new Error("The Gmail API is turned off for this Google Cloud project. Turn it on (APIs & Services -> Library -> Gmail API), then Check now.");
    }
    if (res.status === 403 && /insufficient|scope/i.test(detail)) {
      throw new Error("Google didn't grant mail access. In Settings, click Reconnect Gmail and allow it.");
    }
    throw new Error(`Gmail ${res.status}${reason ? `: ${reason}` : ""}`);
  }
  return (await res.json()) as T;
}

/** Message ids matching the search, newest first, up to MAX_PAGES pages. */
async function listMessageIds(token: string, q: string): Promise<{ ids: string[]; truncated: boolean }> {
  const ids: string[] = [];
  let pageToken = "";
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ q, maxResults: String(PAGE_SIZE), ...(pageToken ? { pageToken } : {}) });
    const json = await gmailGet<{ messages?: Array<{ id: string }>; nextPageToken?: string }>(token, `/messages?${params}`);
    for (const m of json.messages || []) if (isGmailId(m.id)) ids.push(m.id);
    if (!json.nextPageToken) return { ids, truncated: false };
    pageToken = json.nextPageToken;
  }
  return { ids, truncated: true };
}

async function getMetadata(token: string, id: string): Promise<GmailMessage> {
  const params = new URLSearchParams({ format: "metadata" });
  for (const h of ["From", "Subject", "Date"]) params.append("metadataHeaders", h);
  return gmailGet<GmailMessage>(token, `/messages/${encodeURIComponent(id)}?${params}`);
}

function header(m: GmailMessage, name: string): string {
  const h = (m.payload?.headers || []).find((x) => (x.name || "").toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

/** Take the run lease, or say why not. */
async function takeLease(d: Firestore, nowMs: number, force: boolean): Promise<GmailStatus | null> {
  const ref = d.collection("integrationStatus").doc("gmail");
  return d.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const st = (snap.data() as GmailStatus | undefined) ?? {};
    if (!shouldRun(st.runStartedAt, nowMs, force)) return null;
    tx.set(ref, { runStartedAt: new Date(nowMs).toISOString() }, { merge: true });
    return st;
  });
}

function isAlreadyExists(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code;
  return code === 6 || code === "already-exists" || /ALREADY_EXISTS/.test(String((e as Error)?.message || ""));
}

/**
 * Check the inbox for lead replies and log them. Safe to call often and from
 * several tabs: runs at most every two minutes (`force` from Check now: 15
 * seconds), and each message is logged once.
 */
export async function syncGmailReplies(opts: { force?: boolean; now?: Date } = {}): Promise<GmailSyncResult> {
  const d = db();
  const secret = await getGmailSecret();
  if (!secret.refreshToken) return { ok: true, skipped: true, reason: "not_connected" };
  const cal = await getCalendarSecret();
  if (!cal.clientId || !cal.clientSecret) return { ok: true, skipped: true, reason: "not_connected" };

  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  const status = await takeLease(d, nowMs, Boolean(opts.force));
  if (!status) return { ok: true, skipped: true, reason: "throttled" };
  const statusRef = d.collection("integrationStatus").doc("gmail");

  try {
    const token = await refreshGoogleAccessToken(cal.clientId, cal.clientSecret, secret.refreshToken);
    const { ids, truncated } = await listMessageIds(token, gmailQuery(status.lastCheckedEpoch, nowMs));

    // Skip messages already logged before fetching them.
    const seen = new Set<string>();
    if (ids.length) {
      const refs = ids.map((id) => d.collection("gmailSeen").doc(id));
      const snaps = await Promise.all(refs.map((r) => r.get()));
      snaps.forEach((s, i) => s.exists && seen.add(ids[i]));
    }
    const fresh = ids.filter((id) => !seen.has(id));

    const messages: GmailMessage[] = [];
    for (let i = 0; i < fresh.length; i += 10) {
      messages.push(...(await Promise.all(fresh.slice(i, i + 10).map((id) => getMetadata(token, id)))));
    }

    let logged = 0;
    const touchedLeads = new Set<string>();
    if (messages.length) {
      const snap = await d.collection("leads").select("email", "stage", "isAccount", "updatedAt", "name").get();
      const leads = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<LeadForMatch, "id">) }) as LeadForMatch);
      const index = buildEmailIndex(leads);
      const nowIso = now.toISOString();
      // Oldest first, so the history reads in order.
      messages.sort((a, b) => Number(a.internalDate || 0) - Number(b.internalDate || 0));
      for (const m of messages) {
        const from = header(m, "From");
        const targets = leadsForSender(index, from);
        if (!targets.length) continue;
        const seenRef = d.collection("gmailSeen").doc(m.id);
        // The claim: create() fails if another run already took this message.
        try {
          await seenRef.create({ at: nowIso, from: from.slice(0, 200), leadIds: targets.map((t) => t.id) });
        } catch (e) {
          if (isAlreadyExists(e)) continue;
          throw e;
        }
        const entry = replyActivity({ subject: header(m, "Subject"), snippet: m.snippet, ts: messageTs(m.internalDate, header(m, "Date"), nowIso) });
        try {
          for (const t of targets) {
            try {
              await saveLeadServer(d, t.id, (lead) => replyPatch(lead, todayISO(now)), entry);
              touchedLeads.add(t.id);
            } catch (e) {
              // Deleted (moved to the trash) since the list was read: nothing to log on.
              if (!(e instanceof Error && e.message === "Lead not found")) throw e;
            }
          }
          logged++;
        } catch (e) {
          // Let the next run try this message again.
          await seenRef.delete().catch(() => {});
          throw e;
        }
      }
    }

    const okAt = new Date().toISOString();
    await statusRef.set(
      {
        lastCheckedEpoch: Math.floor(nowMs / 1000),
        lastOkAt: okAt,
        lastScanned: ids.length,
        lastLogged: logged,
        totalLogged: FieldValue.increment(logged),
        truncated,
      },
      { merge: true }
    );
    return { ok: true, skipped: false, scanned: ids.length, logged, leads: touchedLeads.size, truncated };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await statusRef
      .set({ lastError: error.slice(0, 500), lastErrorAt: new Date().toISOString() }, { merge: true })
      .catch((err) => console.error("integrationStatus/gmail write failed:", err));
    return { ok: false, error };
  }
}
