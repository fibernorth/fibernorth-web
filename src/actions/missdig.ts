"use server";

import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyServerActionCaller } from "@/lib/server-action-auth";
import { addBusinessDays } from "@/lib/business-days";
import { cleanTicket } from "@/lib/missdig";
import type { LeadActivity } from "@/lib/leads";
import type { QuoteRequest } from "@/lib/types";

// MISS DIG tickets for accepted quotes. Accepting a quote puts it on the
// list (missDigStatus "needed", set by the respond route); Bill enters the
// ticket at missdig811.org from the ticket sheet, then records the ticket
// number here. Nothing is deleted: undo puts the quote back on the list.

const db = () => getFirestore(initializeAdminApp());

const isValidDayString = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(`${v}T12:00:00Z`).getTime());

function todayDetroit(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Detroit" });
}

/** Record the ticket number; the earliest dig day is 3 business days after today unless given. */
export async function markMissDigEntered(
  quoteId: string,
  input: { ticket: string; digDate?: string },
  authToken: string
): Promise<{ ok: true; digDate: string }> {
  const caller = await verifyServerActionCaller(authToken);
  const ticket = cleanTicket(input.ticket);
  if (!ticket) throw new Error("Enter the MISS DIG ticket number.");
  const minDig = addBusinessDays(todayDetroit(), 3);
  const digDate = input.digDate && isValidDayString(input.digDate) ? input.digDate : minDig;
  const by = (caller.email || caller.uid).toLowerCase();
  const store = db();
  const qRef = store.collection("quoteRequests").doc(quoteId);
  await store.runTransaction(async (tx) => {
    const snap = await tx.get(qRef);
    if (!snap.exists) throw new Error("Quote not found");
    const q = snap.data() as QuoteRequest;
    const leadRef = q.leadId ? store.collection("leads").doc(q.leadId) : null;
    const leadSnap = leadRef ? await tx.get(leadRef) : null;
    const now = new Date().toISOString();
    tx.update(qRef, {
      missDigStatus: "entered",
      missDigTicket: ticket,
      missDigEnteredAt: now,
      missDigEnteredBy: by,
      missDigDigDate: digDate,
      updatedAt: now,
    });
    if (leadRef && leadSnap?.exists) {
      const act: LeadActivity = {
        ts: now,
        type: "system",
        text: `MISS DIG ticket ${ticket} entered${q.address ? ` for ${q.address}` : ""}. Earliest dig ${digDate}`,
        by,
      };
      tx.update(leadRef, { activity: FieldValue.arrayUnion(act), updatedAt: now });
    }
  });
  return { ok: true, digDate };
}

/** Put a quote on the MISS DIG list by hand (jobs accepted before the list existed, or a ticket to redo). */
export async function needMissDig(quoteId: string, authToken: string): Promise<{ ok: true }> {
  const caller = await verifyServerActionCaller(authToken);
  const store = db();
  const qRef = store.collection("quoteRequests").doc(quoteId);
  const snap = await qRef.get();
  if (!snap.exists) throw new Error("Quote not found");
  const q = snap.data() as QuoteRequest;
  const now = new Date().toISOString();
  await qRef.update({ missDigStatus: "needed", missDigNeededAt: now, updatedAt: now });
  if (q.leadId) {
    const act: LeadActivity = {
      ts: now,
      type: "system",
      text: q.missDigTicket ? `MISS DIG ticket ${q.missDigTicket} needs redoing: back on the MISS DIG list` : "Added to the MISS DIG list",
      by: (caller.email || caller.uid).toLowerCase(),
    };
    await store.collection("leads").doc(q.leadId).update({ activity: FieldValue.arrayUnion(act), updatedAt: now }).catch(() => {});
  }
  return { ok: true };
}
