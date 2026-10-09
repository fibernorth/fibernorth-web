"use server";

import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyOwnerCaller, verifyServerActionCaller } from "@/lib/server-action-auth";
import { isSheetLead, mergeLeadFields, pickSurvivor } from "@/lib/lead-merge";
import { leadQuoteRollup, type QuoteForRollup } from "@/lib/proposal";
import { historyTooBig, planHistoryArchive } from "@/lib/history-size";
import { trashId, trashRecord } from "@/services/trash";
import { writeAudit } from "@/services/audit";
import { cleanBase, cleanLeadPatch, saveLeadServer } from "@/services/lead-writes";
import { findExistingLead } from "@/lib/assistant-logic";
import { ACTIVITY_TYPES, LEAD_SOURCES, todayISO, type Lead, type LeadActivity } from "@/lib/leads";

/**
 * Save a lead from the card. The history line is appended on the server
 * (never a whole-array rewrite), and the stage / contact-date rules run
 * against the lead as it is now, not the card's copy. Safe to retry: the
 * same history line is only added once.
 *
 * Control keys ride along in `patch` (so the phone's offline outbox
 * replays them unchanged): `expectStage`, the stage the card showed,
 * `reopen: true` for the Reopen button, and `base`, the value each edited
 * field had when the details form was opened (a field changed since by
 * someone else refuses the save instead of being overwritten).
 */
export async function saveLead(
  leadId: string,
  patch: Record<string, unknown>,
  activity: LeadActivity | null,
  authToken: string
): Promise<{ ok: true } | { ok: false; error: string; gone?: boolean }> {
  const caller = await verifyServerActionCaller(authToken);
  if (!leadId || typeof leadId !== "string" || leadId.includes("/")) return { ok: false, error: "Bad lead id" };
  let entry: LeadActivity | undefined;
  if (activity) {
    if (!ACTIVITY_TYPES.includes(activity.type) || typeof activity.ts !== "string" || typeof activity.text !== "string") {
      return { ok: false, error: "Bad history entry" };
    }
    entry = { ts: activity.ts.slice(0, 40), type: activity.type, text: activity.text.slice(0, 2000) };
    if (activity.via === "voice") entry.via = "voice";
  }
  const expectStage = typeof patch.expectStage === "string" ? patch.expectStage : undefined;
  const reopen = patch.reopen === true;
  try {
    await saveLeadServer(getFirestore(initializeAdminApp()), leadId, cleanLeadPatch(patch), entry, {
      expectStage,
      reopen,
      base: cleanBase(patch.base),
      by: caller.email || caller.uid,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Couldn't save";
    return { ok: false, error: msg, gone: msg === "Lead not found" };
  }
}

const newLeadSchema = z.object({
  name: z.string().trim().min(1, "Add a name").max(200),
  phone: z.string().trim().max(40).default(""),
  email: z.string().trim().max(200).default(""),
  address: z.string().trim().max(300).default(""),
  serviceType: z.string().trim().max(100).default(""),
  source: z.enum(LEAD_SOURCES).default("phone"),
  notes: z.string().trim().max(5000).default(""),
  contactName: z.string().trim().max(200).default(""),
  /** A job under a contractor account. */
  parentLeadId: z.string().trim().max(200).regex(/^[^/]*$/).default(""),
});

/**
 * Add a lead by hand. Checks for someone already in the pipeline with the
 * same phone or email first; `allowDuplicate` adds it anyway.
 */
export async function createLead(
  input: Record<string, unknown>,
  authToken: string,
  opts: { allowDuplicate?: boolean } = {}
): Promise<
  | { ok: true; id: string }
  | { ok: false; error: string; duplicateOf?: { id: string; name: string } }
> {
  const caller = await verifyServerActionCaller(authToken);
  const parsed = newLeadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || "Check the fields" };
  const f = parsed.data;
  const db = getFirestore(initializeAdminApp());
  // A job under a contractor shares the contractor's phone and email, so
  // it's never a duplicate of them.
  let parentName = "";
  if (f.parentLeadId) {
    const p = await db.collection("leads").doc(f.parentLeadId).get();
    if (!p.exists) return { ok: false, error: "That contractor lead no longer exists." };
    parentName = String(p.get("name") || "");
  }
  if (!opts.allowDuplicate && !f.parentLeadId && (f.phone || f.email)) {
    const snap = await db.collection("leads").select("name", "phone", "email", "stage").get();
    const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Lead, "id">) }) as Lead);
    const hit = findExistingLead(all, { phone: f.phone, email: f.email });
    if (hit) {
      return {
        ok: false,
        error: `${hit.name || "Someone"} already has that ${hit.match}.`,
        duplicateOf: { id: hit.id, name: hit.name || "" },
      };
    }
  }
  const now = new Date().toISOString();
  const by = (caller.email || caller.uid).toLowerCase();
  const { parentLeadId, contactName, ...rest } = f;
  const doc: Omit<Lead, "id"> = {
    ...rest,
    ...(contactName ? { contactName } : {}),
    ...(parentLeadId ? { parentLeadId } : {}),
    stage: "new",
    nextAction: parentLeadId ? "Set up the job" : "Call back",
    nextActionAt: todayISO(),
    touched: true,
    activity: [
      { ts: now, type: "system", text: parentLeadId ? `New job for ${parentName || "contractor"}` : "Added by hand", by },
    ],
    createdAt: now,
    updatedAt: now,
  };
  const ref = await db.collection("leads").add(doc);
  if (parentLeadId) {
    await db
      .collection("leads")
      .doc(parentLeadId)
      .update({
        // Having jobs makes them a contractor account: never due on its own.
        isAccount: true,
        activity: FieldValue.arrayUnion({ ts: now, type: "system", text: `New job added: ${rest.name}`, by }),
        updatedAt: now,
      })
      .catch(() => {});
  }
  return { ok: true, id: ref.id };
}


export interface MergePreview {
  keepId: string;
  keepName: string;
  dropId: string;
  dropName: string;
  /** Why this one stays (the sheet only knows sheet leads). */
  keepWhy: string;
  stage: string;
  quotes: number;
  jobs: number;
  history: number;
  phone: string;
  email: string;
}

async function readPair(db: FirebaseFirestore.Firestore, a: string, b: string) {
  if (!a || !b || a === b || a.includes("/") || b.includes("/")) throw new Error("Pick two different leads.");
  const [sa, sb] = await Promise.all([db.collection("leads").doc(a).get(), db.collection("leads").doc(b).get()]);
  if (!sa.exists || !sb.exists) throw new Error("One of those leads no longer exists.");
  const la = { id: sa.id, ...(sa.data() as Omit<Lead, "id">) } as Lead;
  const lb = { id: sb.id, ...(sb.data() as Omit<Lead, "id">) } as Lead;
  return pickSurvivor(la, lb);
}

/** What a merge would do, without changing anything. */
export async function previewLeadMerge(aId: string, bId: string, authToken: string): Promise<MergePreview> {
  await verifyServerActionCaller(authToken);
  const db = getFirestore(initializeAdminApp());
  const { keep, drop } = await readPair(db, aId, bId);
  const [q1, q2, kids] = await Promise.all([
    db.collection("quoteRequests").where("leadId", "==", keep.id).get(),
    db.collection("quoteRequests").where("leadId", "==", drop.id).get(),
    db.collection("leads").where("parentLeadId", "==", drop.id).get(),
  ]);
  const fields = mergeLeadFields(keep, drop, { ts: new Date().toISOString(), type: "system", text: "" });
  return {
    keepId: keep.id,
    keepName: keep.name || "(no name)",
    dropId: drop.id,
    dropName: drop.name || "(no name)",
    keepWhy: isSheetLead(keep) && !isSheetLead(drop) ? "it came from the Meta ads sheet, so the sheet keeps syncing to it" : "it came in first",
    stage: String(fields.stage || keep.stage),
    quotes: q1.size + q2.size,
    jobs: kids.size,
    history: (fields.activity || []).length,
    phone: String(fields.phone ?? keep.phone ?? ""),
    email: String(fields.email ?? keep.email ?? ""),
  };
}

/**
 * Fold two leads for the same person into one. The kept lead gets every
 * blank filled, both histories, every quote and job, and every key either
 * was known by (so the sheet sync and imports still find it). The other
 * goes to the Trash. Owner only.
 */
export async function mergeLeads(
  aId: string,
  bId: string,
  authToken: string
): Promise<{ ok: true; keepId: string } | { ok: false; error: string }> {
  const caller = await verifyOwnerCaller(authToken);
  const db = getFirestore(initializeAdminApp());
  const by = (caller.email || caller.uid).toLowerCase();
  try {
    const pair = await readPair(db, aId, bId);
    const keepRef = db.collection("leads").doc(pair.keep.id);
    const dropRef = db.collection("leads").doc(pair.drop.id);
    const keepId = await db.runTransaction(async (tx) => {
      // ---- reads ----
      const [ks, ds] = await Promise.all([tx.get(keepRef), tx.get(dropRef)]);
      if (!ks.exists || !ds.exists) throw new Error("One of those leads no longer exists.");
      const keep = { id: ks.id, ...(ks.data() as Omit<Lead, "id">) } as Lead;
      const drop = { id: ds.id, ...(ds.data() as Omit<Lead, "id">) } as Lead;
      const [kq, dq, kids, refs, props] = await Promise.all([
        tx.get(db.collection("quoteRequests").where("leadId", "==", keep.id)),
        tx.get(db.collection("quoteRequests").where("leadId", "==", drop.id)),
        tx.get(db.collection("leads").where("parentLeadId", "==", drop.id)),
        tx.get(db.collection("leads").where("referredBy", "==", drop.id)),
        tx.get(db.collection("proposals").where("leadId", "==", drop.id)),
      ]);
      // ---- writes ----
      const now = new Date().toISOString();
      const line: LeadActivity = {
        ts: now,
        type: "system",
        text: `Merged with ${drop.name || "another lead"} (${drop.source || "lead"}${drop.phone ? `, ${drop.phone}` : ""}${drop.email ? `, ${drop.email}` : ""}) by ${by}`,
      };
      const patch = mergeLeadFields(keep, drop, line) as Record<string, unknown>;
      const quotes: QuoteForRollup[] = [...kq.docs, ...dq.docs].map((d) => ({ id: d.id, ...(d.data() as object) }) as QuoteForRollup);
      if (quotes.length) {
        const r = leadQuoteRollup(quotes, todayISO());
        if (r.quote) Object.assign(patch, { quoteId: r.quoteId, quote: r.quote, quoteCount: r.quoteCount });
      }
      // A long combined history keeps its newest part on the lead, the rest archived.
      const activity = (patch.activity as LeadActivity[]) || [];
      if (historyTooBig(activity)) {
        const plan = planHistoryArchive(activity);
        patch.activity = plan.keep;
        plan.chunks.forEach((chunk) =>
          tx.set(keepRef.collection("historyArchive").doc(), {
            entries: chunk,
            from: chunk[0]?.ts || "",
            to: chunk[chunk.length - 1]?.ts || "",
            archivedAt: now,
          })
        );
      }
      tx.update(keepRef, { ...patch, updatedAt: now });
      for (const d of dq.docs) tx.update(d.ref, { leadId: keep.id, updatedAt: now });
      for (const d of props.docs) tx.update(d.ref, { leadId: keep.id });
      for (const d of kids.docs) if (d.id !== keep.id) tx.update(d.ref, { parentLeadId: keep.id, updatedAt: now });
      for (const d of refs.docs) if (d.id !== keep.id) tx.update(d.ref, { referredBy: keep.id, updatedAt: now });
      // The other copy goes to the Trash (restorable), not gone for good.
      const dropData = ds.data() as Record<string, unknown>;
      tx.set(
        db.collection("trash").doc(trashId("leads", drop.id)),
        trashRecord("leads", drop.id, dropData, { uid: caller.uid, email: caller.email || "" }, now, `Merged into ${keep.name || keep.id}`) as unknown as Record<string, unknown>
      );
      tx.delete(dropRef);
      await writeAudit(
        {
          actor: { uid: caller.uid, email: caller.email || "" },
          action: "lead.merge",
          target: { col: "leads", id: keep.id },
          before: { merged: drop.id, mergedName: drop.name || "" },
          after: { quotesMoved: dq.size, jobsMoved: kids.size },
          note: `Merged ${drop.name || drop.id} into ${keep.name || keep.id}`,
        },
        { db, writer: tx }
      );
      return keep.id;
    });
    return { ok: true, keepId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't merge" };
  }
}

/**
 * Put an existing lead under a contractor account as one of its jobs, or
 * (parentId "") take it back out. The lead can't be an account itself or
 * have jobs of its own, and the target must already be a contractor account.
 * Both leads get a history line.
 */
export async function setLeadParent(
  leadId: string,
  parentId: string,
  authToken: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const caller = await verifyServerActionCaller(authToken);
  const bad = (id: unknown) => typeof id !== "string" || id.includes("/") || id.length > 200;
  if (!leadId || bad(leadId)) return { ok: false, error: "Bad lead id" };
  if (bad(parentId)) return { ok: false, error: "Bad contractor id" };
  if (parentId === leadId) return { ok: false, error: "A lead can't be a job under itself." };
  const db = getFirestore(initializeAdminApp());
  const by = (caller.email || caller.uid).toLowerCase();
  const leads = db.collection("leads");
  try {
    await db.runTransaction(async (tx) => {
      // ---- reads ----
      const ls = await tx.get(leads.doc(leadId));
      // A trashed lead is moved out of `leads`, so it simply isn't there.
      if (!ls.exists) throw new Error("That lead no longer exists (it may be in the Trash).");
      const lead = { id: ls.id, ...(ls.data() as Omit<Lead, "id">) } as Lead;
      const oldParentId = lead.parentLeadId || "";
      if (oldParentId === parentId) return; // already there
      const [ps, os, kids, parentKids] = await Promise.all([
        parentId ? tx.get(leads.doc(parentId)) : Promise.resolve(null),
        oldParentId ? tx.get(leads.doc(oldParentId)) : Promise.resolve(null),
        parentId ? tx.get(leads.where("parentLeadId", "==", leadId).limit(1)) : Promise.resolve(null),
        parentId ? tx.get(leads.where("parentLeadId", "==", parentId).limit(1)) : Promise.resolve(null),
      ]);
      const leadName = lead.name || "A lead";
      let parent: Lead | null = null;
      if (parentId) {
        if (lead.isAccount) throw new Error(`${leadName} is a contractor account itself, so it can't be a job under another.`);
        if (kids && !kids.empty) throw new Error(`${leadName} has jobs of its own, so it can't be a job under another account.`);
        if (!ps || !ps.exists) throw new Error("That contractor lead no longer exists.");
        parent = { id: ps.id, ...(ps.data() as Omit<Lead, "id">) } as Lead;
        if (parent.parentLeadId) throw new Error(`${parent.name || "That lead"} is itself a job under another account.`);
        // Already having jobs makes it an account (the list treats it as one).
        if (!parent.isAccount && (!parentKids || parentKids.empty)) throw new Error(`Mark ${parent.name || "that lead"} as a contractor account first.`);
      }
      const oldParent = os?.exists ? ({ id: os.id, ...(os.data() as Omit<Lead, "id">) } as Lead) : null;
      // ---- writes ----
      const now = new Date().toISOString();
      const line = (text: string): LeadActivity => ({ ts: now, type: "system", text, by });
      const leadLines: LeadActivity[] = [];
      if (oldParentId) {
        leadLines.push(line(`Taken out from under ${oldParent?.name || "the contractor"}`));
        if (oldParent) tx.update(os!.ref, { activity: FieldValue.arrayUnion(line(`${leadName} removed from jobs`)), updatedAt: now });
      }
      if (parent) {
        leadLines.push(line(`Moved under ${parent.name || "contractor"}`));
        tx.update(ps!.ref, { isAccount: true, activity: FieldValue.arrayUnion(line(`${leadName} added as a job`)), updatedAt: now });
      }
      tx.update(ls.ref, {
        parentLeadId: parentId ? parentId : FieldValue.delete(),
        activity: FieldValue.arrayUnion(...leadLines),
        updatedAt: now,
      });
      await writeAudit(
        {
          actor: { uid: caller.uid, email: caller.email || "" },
          action: "lead.setParent",
          target: { col: "leads", id: leadId },
          before: { parentLeadId: oldParentId },
          after: { parentLeadId: parentId },
          note: parent
            ? `Put ${leadName} under ${parent.name || parentId}`
            : `Took ${leadName} out from under ${oldParent?.name || oldParentId}`,
        },
        { db, writer: tx }
      );
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't move the lead" };
  }
}
