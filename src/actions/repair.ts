"use server";

import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyOwnerCaller } from "@/lib/server-action-auth";
import { leadQuoteRollup, stableStringify, type QuoteForRollup } from "@/lib/proposal";
import { todayISO } from "@/lib/leads";
import type { Proposal, QuoteRequest } from "@/lib/types";

// One-time cleanup for records written before the integrity fixes:
//  - quotes with no leadId that a lead points at (old website imports)
//  - sent quotes with no sentTotal (read from the proposal the customer got)
//  - lead quote badges that described the wrong quote (multi-site leads)
//
// Two steps. previewRepair() works out every change, writes nothing to the
// records, and stores the plan at repairRuns/{planId} with each doc's
// before and after values. applyRepair(planId) applies exactly that plan: a
// doc whose fields no longer match the stored "before" (someone changed it
// since the preview) is skipped, and what was applied and skipped is
// recorded on the plan.

/** One planned change to one doc. `null` in after = delete the field. */
export interface RepairChange {
  col: "leads" | "quoteRequests";
  id: string;
  kind: "link" | "sentTotal" | "badge";
  label: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface RepairPreview {
  planId: string;
  quotesLinked: number;
  sentTotalsFilled: number;
  badgesFixed: number;
  /** Every change (up to MAX_CHANGES), for the scrollable list. */
  changes: Array<Pick<RepairChange, "kind" | "label">>;
  truncated: boolean;
}

export interface RepairApplyResult {
  planId: string;
  applied: number;
  skipped: Array<{ label: string; reason: string }>;
}

const MAX_CHANGES = 2000;
const AT_A_TIME = 10;

const pick = (d: Record<string, unknown> | undefined, keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, d?.[k] ?? null]));

export async function previewRepair(authToken: string): Promise<RepairPreview> {
  const caller = await verifyOwnerCaller(authToken);
  const store = getFirestore(initializeAdminApp());
  const today = todayISO();
  const [leadSnap, quoteSnap] = await Promise.all([
    store.collection("leads").get(),
    store.collection("quoteRequests").get(),
  ]);

  const quotes = new Map<string, QuoteForRollup & Partial<QuoteRequest>>();
  const rawQuotes = new Map<string, Record<string, unknown>>();
  for (const d of quoteSnap.docs) {
    quotes.set(d.id, { id: d.id, ...(d.data() as Omit<QuoteRequest, "id">) });
    rawQuotes.set(d.id, d.data());
  }

  const changes: RepairChange[] = [];
  const counts = { quotesLinked: 0, sentTotalsFilled: 0, badgesFixed: 0 };

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
      counts.quotesLinked += 1;
      changes.push({
        col: "quoteRequests",
        id: qid,
        kind: "link",
        label: `Quote ${qid} linked to lead ${lead.name || d.id}`,
        before: pick(rawQuotes.get(qid), ["leadId"]),
        after: { leadId: d.id },
      });
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
    counts.sentTotalsFilled += 1;
    changes.push({
      col: "quoteRequests",
      id: q.id,
      kind: "sentTotal",
      label: `Quote ${q.id}: sent total $${total.toFixed(2)} (v${prop.version})`,
      before: pick(rawQuotes.get(q.id), ["sentTotal", "sentVersion"]),
      after: { sentTotal: total, sentVersion: prop.version ?? null },
    });
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
    if (mine.length === 0) continue; // a dangling pointer with no quote docs is left for a person to look at
    const r = leadQuoteRollup(mine, today);
    const now = { quoteId: lead.quoteId || "", quote: lead.quote || null, quoteCount: lead.quoteCount || 0 };
    if (stableStringify(now) === stableStringify(r)) continue;
    counts.badgesFixed += 1;
    changes.push({
      col: "leads",
      id: d.id,
      kind: "badge",
      label: `Lead ${lead.name || d.id}: ${now.quote?.status || "none"} ${now.quote?.total ?? ""} -> ${r.quote?.status || "none"} ${r.quote?.total ?? ""} (${r.quoteCount} quote${r.quoteCount === 1 ? "" : "s"})`,
      before: pick(lead, ["quoteId", "quote", "quoteCount"]),
      after: r.quote
        ? { quoteId: r.quoteId, quote: r.quote, quoteCount: r.quoteCount }
        : { quoteId: null, quote: null, quoteCount: 0 },
    });
  }

  const kept = changes.slice(0, MAX_CHANGES);
  const ref = store.collection("repairRuns").doc();
  await ref.set({
    kind: "quote-records",
    status: "preview",
    by: caller.email || caller.uid,
    at: new Date().toISOString(),
    counts,
    truncated: changes.length > MAX_CHANGES,
    changes: kept,
  });
  return {
    planId: ref.id,
    ...counts,
    changes: kept.map((c) => ({ kind: c.kind, label: c.label })),
    truncated: changes.length > MAX_CHANGES,
  };
}

export async function applyRepair(planId: string, authToken: string): Promise<RepairApplyResult> {
  const caller = await verifyOwnerCaller(authToken);
  if (!planId || typeof planId !== "string" || planId.includes("/")) throw new Error("Bad plan id");
  const store = getFirestore(initializeAdminApp());
  const planRef = store.collection("repairRuns").doc(planId);

  // Claim the plan first, so two taps can't apply it twice.
  const plan = await store.runTransaction(async (tx) => {
    const snap = await tx.get(planRef);
    if (!snap.exists) throw new Error("That check wasn't found. Run Check first again.");
    const d = snap.data() as { status: string; changes: RepairChange[] };
    if (d.status !== "preview") throw new Error("That check was already applied. Run Check first again.");
    tx.update(planRef, { status: "applying", appliedBy: caller.email || caller.uid });
    return d;
  });

  const skipped: RepairApplyResult["skipped"] = [];
  let applied = 0;
  const changes = plan.changes || [];
  try {
    for (let i = 0; i < changes.length; i += AT_A_TIME) {
      await Promise.all(
        changes.slice(i, i + AT_A_TIME).map(async (c) => {
          const ref = store.collection(c.col).doc(c.id);
          const ok = await store.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists) return "gone";
            const cur = snap.data() || {};
            const keys = Object.keys(c.after);
            if (stableStringify(pick(cur, keys)) !== stableStringify(pick(c.before, keys))) return "changed";
            const patch: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(c.after)) patch[k] = v === null ? FieldValue.delete() : v;
            tx.update(ref, patch);
            return "ok";
          });
          if (ok === "ok") applied += 1;
          else skipped.push({ label: c.label, reason: ok === "gone" ? "the record was deleted" : "changed since the check" });
        })
      );
    }
  } finally {
    await planRef.update({
      status: "applied",
      appliedAt: new Date().toISOString(),
      applied,
      skipped,
    });
  }
  return { planId, applied, skipped };
}
