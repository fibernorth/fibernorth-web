import type { Firestore } from "firebase-admin/firestore";
import { readApprovalSettings, type ApprovalSettings } from "@/lib/roles";

// Quote approval settings: adminSettings/approvals = { approvers: string[],
// trainingMode: boolean, updatedAt, updatedBy }. Server only (Admin SDK);
// the Settings screen reads and saves it through src/actions/access.ts.
// Missing doc = the defaults (Bill, Chris, admin@; training mode on).

export const APPROVAL_SETTINGS_PATH = { col: "adminSettings", id: "approvals" } as const;

export async function loadApprovalSettings(db: Firestore): Promise<ApprovalSettings> {
  try {
    const snap = await db.collection(APPROVAL_SETTINGS_PATH.col).doc(APPROVAL_SETTINGS_PATH.id).get();
    return readApprovalSettings(snap.exists ? (snap.data() as Record<string, unknown>) : null);
  } catch (e) {
    // Can't read it: the safe side is training mode on (sales quotes wait).
    console.error("Couldn't read the approval settings:", e);
    return readApprovalSettings(null);
  }
}
