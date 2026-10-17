"use server";

import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyOwnerCaller, verifyServerActionCaller } from "@/lib/server-action-auth";
import { APPROVAL_SETTINGS_PATH, loadApprovalSettings } from "@/services/approvals";
import { diffFields, writeAudit } from "@/services/audit";
import { cleanApprovers, isApprover, type AdminRole } from "@/lib/roles";

export interface MyAccess {
  role: AdminRole;
  owner: boolean;
  /** May approve sales quotes (owners, or on the Settings list). */
  approver: boolean;
  trainingMode: boolean;
  /** The approver list: owners only (the Settings screen). */
  approvers?: string[];
}

/**
 * The signed-in person's role and approval rights, worked out on the server
 * from their token and the approval settings. The screens use it to show the
 * right buttons; every action checks again for itself.
 */
export async function getMyAccess(authToken: string): Promise<MyAccess> {
  const caller = await verifyServerActionCaller(authToken);
  const role: AdminRole = caller.role ?? (caller.owner ? "owner" : "staff");
  const settings = await loadApprovalSettings(getFirestore(initializeAdminApp()));
  return {
    role,
    owner: caller.owner,
    approver: isApprover({ role, email: caller.email }, settings),
    trainingMode: settings.trainingMode,
    ...(caller.owner ? { approvers: settings.approvers } : {}),
  };
}

/**
 * Settings -> Quote approvals (owner only): who approves sales quotes, and
 * training mode (every sales quote waits for approval while it's on).
 * Logged before -> after.
 */
export async function saveApprovalSettings(
  input: { approvers: string[] | string; trainingMode: boolean },
  authToken: string
): Promise<{ ok: true; approvers: string[] } | { ok: false; error: string }> {
  let caller;
  try {
    caller = await verifyOwnerCaller(authToken);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Not authorized" };
  }
  const approvers = cleanApprovers(input.approvers);
  if (typeof input.trainingMode !== "boolean") return { ok: false, error: "Training mode must be on or off." };
  const db = getFirestore(initializeAdminApp());
  const before = await loadApprovalSettings(db);
  const next = { approvers, trainingMode: input.trainingMode };
  const diff = diffFields(before as unknown as Record<string, unknown>, next);
  if (!diff.changed.length) return { ok: true, approvers };
  await db
    .collection(APPROVAL_SETTINGS_PATH.col)
    .doc(APPROVAL_SETTINGS_PATH.id)
    .set({ ...next, updatedAt: new Date().toISOString(), updatedBy: caller.email || caller.uid });
  await writeAudit(
    {
      actor: caller,
      action: "settings.approvals",
      target: { col: APPROVAL_SETTINGS_PATH.col, id: APPROVAL_SETTINGS_PATH.id },
      before: diff.before,
      after: diff.after,
    },
    { db }
  );
  return { ok: true, approvers };
}
