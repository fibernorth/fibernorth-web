// Delivery for the office's notices (customer accepted/declined/opened a
// quote, a website quote request, a job application) and the customer's own
// copies: check the response, retry a few times with a short pause, and
// keep a record in notices/{id} so a notice that never arrived shows up in
// the CRM instead of vanishing.
//
// Everything here is awaited by the caller: on serverless hosting, work left
// running after the response can be dropped.

import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";

/** Pauses between attempts (3 attempts in all). Tests swap `sleep`. */
export const noticeTiming = {
  backoffMs: [400, 1200],
  sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
};

export interface ChannelResult {
  /** true sent, false failed, null skipped (not configured). */
  ok: boolean | null;
  attempts: number;
  error: string;
  /** Resend's message id, when there is one. */
  id?: string;
}

export const SKIPPED: ChannelResult = { ok: null, attempts: 0, error: "" };

/** A status worth another try: rate limited or a server error. */
const retryable = (status: number) => status === 429 || status >= 500;

async function withRetry(
  label: string,
  send: () => Promise<Response>
): Promise<ChannelResult & { res?: Response }> {
  const max = noticeTiming.backoffMs.length + 1;
  let error = "";
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      const res = await send();
      if (res.ok) return { ok: true, attempts: attempt, error: "", res };
      let why = "";
      try {
        why = (await res.text()).slice(0, 200);
      } catch {
        /* no body */
      }
      error = `${label} said ${res.status}${why ? `: ${why}` : ""}`;
      if (!retryable(res.status)) return { ok: false, attempts: attempt, error };
    } catch (err) {
      error = `${label} unreachable: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300);
    }
    if (attempt < max) await noticeTiming.sleep(noticeTiming.backoffMs[attempt - 1]);
  }
  return { ok: false, attempts: max, error };
}

/**
 * One email through Resend. The Idempotency-Key makes a retry (ours, or a
 * repeat of the whole request) deliver once. No API key is a failure: the
 * email the caller wanted can't go out.
 */
export async function sendViaResend(payload: Record<string, unknown>, idempotencyKey: string): Promise<ChannelResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, attempts: 0, error: "Email isn't set up on the server (RESEND_API_KEY)" };
  const r = await withRetry("Email service", () =>
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify(payload),
    })
  );
  let id: string | undefined;
  if (r.ok && r.res) {
    const json = (await r.res.json().catch(() => ({}))) as { id?: string };
    id = json.id;
  }
  return { ok: r.ok, attempts: r.attempts, error: r.error, ...(id ? { id } : {}) };
}

/** A Slack incoming-webhook post. No webhook configured is a skip, not a failure. */
export async function postToSlack(webhook: string, text: string): Promise<ChannelResult> {
  if (!webhook || !webhook.startsWith("https://hooks.slack.com/")) return SKIPPED;
  const r = await withRetry("Slack", () =>
    fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
  );
  return { ok: r.ok, attempts: r.attempts, error: r.error };
}

export type NoticeKind =
  | "accepted"
  | "declined"
  | "viewed"
  | "customer-copy"
  | "quote-form"
  | "quote-form-confirmation"
  | "application"
  | "application-confirmation";

export interface NoticeRecord {
  id: string;
  kind: NoticeKind;
  /** What the notice was about, for the red banner. */
  summary: string;
  proposal?: string;
  lead?: string;
  quote?: string;
  application?: string;
  email: ChannelResult;
  slack?: ChannelResult;
  /** The lead history line on failure; defaults to "Couldn't notify the office: …". */
  failureLine?: (error: string) => string;
}

/** Whether a notice counts as delivered: nothing failed. */
export function noticeOk(email: ChannelResult, slack?: ChannelResult): boolean {
  return email.ok !== false && slack?.ok !== false;
}

/**
 * Save notices/{id}: { kind, proposal, lead, attempts, emailOk, slackOk, ok,
 * open, error, at }. A failure also adds a lead history line. Never throws
 * (a notice record must not fail the customer's request).
 */
export async function recordNotice(n: NoticeRecord): Promise<{ ok: boolean; error: string }> {
  const ok = noticeOk(n.email, n.slack);
  const error = [n.email.ok === false ? n.email.error : "", n.slack?.ok === false ? n.slack.error : ""]
    .filter(Boolean)
    .join("; ")
    .slice(0, 500);
  const at = new Date().toISOString();
  try {
    const store = getFirestore(initializeAdminApp());
    await store
      .collection("notices")
      .doc(n.id)
      .set({
        kind: n.kind,
        summary: n.summary.slice(0, 300),
        proposal: n.proposal || "",
        lead: n.lead || "",
        ...(n.quote ? { quote: n.quote } : {}),
        ...(n.application ? { application: n.application } : {}),
        attempts: n.email.attempts + (n.slack?.attempts ?? 0),
        emailOk: n.email.ok,
        slackOk: n.slack ? n.slack.ok : null,
        ok,
        // Failed notices stay on the dashboard until someone marks them handled.
        open: !ok,
        error,
        at,
      });
    if (!ok && n.lead) {
      const text = (n.failureLine ?? ((e: string) => `Couldn't notify the office: ${e}`))(error);
      await store
        .collection("leads")
        .doc(n.lead)
        .update({
          activity: FieldValue.arrayUnion({ ts: at, type: "system", text: text.slice(0, 500) }),
          updatedAt: at,
        })
        .catch((err: unknown) => console.error("Notice history line failed:", err));
    }
  } catch (err) {
    console.error("Recording notice failed:", err);
  }
  if (!ok) console.error(`Notice ${n.kind} ${n.id} failed:`, error);
  return { ok, error };
}
