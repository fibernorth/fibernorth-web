"use server";

import { FieldValue, getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyServerActionCaller } from "@/lib/server-action-auth";
import { enforceAdminEmailLimit } from "@/lib/rate-limit";
import { sendLeadEmail } from "@/services/notifications";
import type { LeadActivity } from "@/lib/leads";

// Emails go out as "Bill Gaylord <bill@fibernorth.com>", so this must not be
// a general "send anything to anyone" relay for whoever holds an admin
// session:
// - the recipient must be a lead's stored email (with leadId, a different
//   address is saved onto that lead first, and the change is logged);
// - each admin is limited to ADMIN_EMAILS_PER_HOUR sends (lib/rate-limit.ts,
//   budget shared with proposal emails once quotes.ts calls it too);
// - every send is recorded server-side on the lead's activity (as a
//   "system" line, so it doesn't count as a contact or reach the sheet — the
//   page still adds its own "email" log entry after a successful send).

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function emailLead(
  input: { to: string; subject: string; body: string; leadId?: string },
  authToken: string
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const caller = await verifyServerActionCaller(authToken);
  const typedTo = (input.to || "").trim().toLowerCase();
  if (typedTo && !EMAIL_RE.test(typedTo)) return { ok: false, error: "That email address doesn't look right." };
  if (!input.subject.trim() || !input.body.trim()) return { ok: false, error: "Add a subject and a message." };

  const db = getFirestore(initializeAdminApp());
  const who = caller.email || caller.uid;
  const now = () => new Date().toISOString();

  // Resolve the lead and the recipient.
  let leadRef: DocumentReference;
  let to: string;
  let emailChange: LeadActivity | null = null;
  if (input.leadId) {
    leadRef = db.collection("leads").doc(input.leadId);
    const snap = await leadRef.get();
    if (!snap.exists) return { ok: false, error: "That lead no longer exists." };
    const stored = String(snap.get("email") || "").trim().toLowerCase();
    to = typedTo || stored;
    if (!to || !EMAIL_RE.test(to)) return { ok: false, error: "Add the customer's email address." };
    if (to !== stored) {
      emailChange = {
        ts: now(),
        type: "system",
        text: `Email address ${stored ? `changed from ${stored} ` : "set "}to ${to} by ${who}`,
        by: who.toLowerCase(),
      };
    }
  } else {
    // Legacy call without leadId: only allowed to an address that already
    // belongs to a lead.
    if (!typedTo) return { ok: false, error: "Add the customer's email address." };
    const candidates = [...new Set([typedTo, (input.to || "").trim()])];
    let found: DocumentReference | null = null;
    for (const addr of candidates) {
      const q = await db.collection("leads").where("email", "==", addr).limit(1).get();
      if (!q.empty) {
        found = q.docs[0].ref;
        break;
      }
    }
    if (!found) {
      return {
        ok: false,
        error: "That address isn't on any lead. Save it as the lead's email first, then send.",
      };
    }
    leadRef = found;
    to = typedTo;
  }

  try {
    await enforceAdminEmailLimit(caller.uid);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Email limit reached" };
  }

  if (emailChange) {
    await leadRef.update({ email: to, activity: FieldValue.arrayUnion(emailChange) });
  }

  const subject = input.subject.trim().slice(0, 200);
  try {
    const r = await sendLeadEmail({
      to,
      subject,
      body: input.body.slice(0, 10000),
      senderEmail: caller.email || undefined,
    });
    // The lead card logs the email as a contact once this returns ok, so the
    // history gets one line. leads/{id}/emailLog is the server's own record
    // of every send.
    await Promise.all([
      leadRef.collection("emailLog").add({
        ts: now(),
        to,
        subject,
        by: who,
        byUid: caller.uid,
        resendId: r.id || "",
      }),
    ]).catch((err) => {
      console.error("Lead email sent but logging failed:", err);
    });
    console.log(`emailLead: ${who} -> ${to} lead=${leadRef.id} id=${r.id}`);
    return { ok: true, id: r.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Email failed" };
  }
}
