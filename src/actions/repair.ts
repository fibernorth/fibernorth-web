"use server";

import { getFirestore, type WriteBatch } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyServerActionCaller } from "@/lib/server-action-auth";
import { leadQuoteRollup, stableStringify, type QuoteForRollup } from "@/lib/proposal";
import { leadQuotePatch } from "@/lib/proposal-server";
import { todayISO } from "@/lib/leads";
import type { Proposal, QuoteRequest } from "@/lib/types";

// One-time cleanup for records written before the integrity fixes:
//  - quotes with no leadId that a lead points at (old website imports)
//  - sent quotes with no sentTotal (read from the proposal the customer got)
//  - lead quote badges that described the wrong quote (multi-site leads)
// Preview first (apply=false) reports what would change and writes nothing.

export interface RepairReport {
  applied: boolean;
  quotesLinked: number;
  sentTotalsFilled: number;
  badgesFixed: number;
  examples: string[];
}

export async function repairQuoteRecords(apply: boolean, authToken: string): Promise<RepairReport> {
  await verifyServerActionCaller(authToken);
  const store = getFirestore(initializeAdminApp());
  const today = todayISO();
  const [leadSnap, quoteSnap] = await Promise.all([
    store.collection("leads").get(),
    store.collection("quoteRequests").get(),
  ]);

  const quotes = new Map<string, QuoteForRollup & Partial<QuoteRequest>>();
  for (const d of quoteSnap.docs) quotes.set(d.id, { id: d.id, ...(d.data() as Omit<QuoteRequest, "id">) });

  const report: RepairReport = { applied: apply, quotesLinked: 0, sentTotalsFilled: 0, badgesFixed: 0, examples: [] };
  const note = (s: string) => {
    if (report.examples.length < 25) report.examples.push(s);
  };
  const writes: Array<(b: WriteBatch) => void> = [];

  // 1. Link quotes back to the lead that points at them.
  for (const d of leadSnap.docs) {
    const lead = d.data();
    const ids = new Set<string>();
    if (typeof lead.quoteId === "string" && lead.quoteId) ids.add(lead.quoteId);
    if (typeof lead.externalId === "string" && lead.externalId.startsWith("quote:")) ids.add(lead.externalId.slice(6));
    for (const qid of ids) {
      const q = quotes.get(qid);
      if (!q || q.leadId) continue;
      q.leadId = d.id;
      report.quotesLinked += 1;
      note(`Quote ${qid} linked to lead ${lead.name || d.id}`);
      writes.push((b) => b.update(store.collection("quoteRequests").doc(qid), { leadId: d.id }));
    }
  }

  // 2. Sent total from the proposal the customer actually got.
  for (const q of quotes.values()) {
    if (!q.version || typeof q.sentTotal === "number" || !q.proposalId) continue;
    const p = await store.collection("proposals").doc(q.proposalId).get();
    if (!p.exists) continue;
    const prop = p.data() as Proposal;
    const total = prop.totals?.total;
    if (typeof total !== "number") continue;
    q.sentTotal = total;
    q.sentVersion = prop.version;
    report.sentTotalsFilled += 1;
    note(`Quote ${q.id}: sent total $${total.toFixed(2)} (v${prop.version})`);
    writes.push((b) =>
      b.update(store.collection("quoteRequests").doc(q.id), { sentTotal: total, sentVersion: prop.version })
    );
  }

  // 3. Rebuild each lead's badge from all of its quotes.
  const byLead = new Map<string, QuoteForRollup[]>();
  for (const q of quotes.values()) {
    if (!q.leadId) continue;
    const list = byLead.get(q.leadId) || [];
    list.push(q);
    byLead.set(q.leadId, list);
  }
  for (const d of leadSnap.docs) {
    const lead = d.data();
    const mine = byLead.get(d.id) || [];
    if (mine.length === 0 && !lead.quoteId && !lead.quote) continue;
    if (mine.length === 0) continue; // a dangling pointer with no quote docs is left for a person to look at
    const r = leadQuoteRollup(mine, today);
    const now = { quoteId: lead.quoteId || "", quote: lead.quote || null, quoteCount: lead.quoteCount || 0 };
    if (stableStringify(now) === stableStringify(r)) continue;
    report.badgesFixed += 1;
    note(
      `Lead ${lead.name || d.id}: ${now.quote?.status || "none"} ${now.quote?.total ?? ""} -> ${r.quote?.status || "none"} ${r.quote?.total ?? ""} (${r.quoteCount} quote${r.quoteCount === 1 ? "" : "s"})`
    );
    writes.push((b) => b.update(d.ref, leadQuotePatch(r)));
  }

  if (apply) {
    for (let i = 0; i < writes.length; i += 400) {
      const batch = store.batch();
      writes.slice(i, i + 400).forEach((w) => w(batch));
      await batch.commit();
    }
  }
  return report;
}
