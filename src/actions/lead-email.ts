"use server";

import { verifyServerActionCaller } from "@/lib/server-action-auth";
import { sendLeadEmail } from "@/services/notifications";

/**
 * Send a one-off email to a lead from the lead card. The caller logs the
 * contact afterward (only if this succeeds), same as any other log entry.
 */
export async function emailLead(
  input: { to: string; subject: string; body: string },
  authToken: string
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const caller = await verifyServerActionCaller(authToken);
  const to = input.to.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { ok: false, error: "That email address doesn't look right." };
  if (!input.subject.trim() || !input.body.trim()) return { ok: false, error: "Add a subject and a message." };
  try {
    const r = await sendLeadEmail({
      to,
      subject: input.subject.trim().slice(0, 200),
      body: input.body.slice(0, 10000),
      senderEmail: caller.email || undefined,
    });
    return { ok: true, id: r.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Email failed" };
  }
}
