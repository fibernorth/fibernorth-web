"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { where } from "firebase/firestore";
import { useAuth } from "@/context/auth-provider";
import { getMyAccess } from "@/actions/access";
import { useFirestoreCollection } from "@/hooks/use-firestore-collection";
import { can, visibleQuotes, type AdminRole, type Permission } from "@/lib/roles";
import type { QuoteRequest } from "@/lib/types";

export interface AdminAccess {
  role: AdminRole;
  owner: boolean;
  sales: boolean;
  /** May approve sales quotes. False until the server has said so. */
  approver: boolean;
  trainingMode: boolean;
  /** The approver list (owners only). */
  approvers: string[];
  /** The server's answer has arrived. */
  loaded: boolean;
  can: (perm: Permission) => boolean;
  refresh: () => void;
}

const fallback = (role: AdminRole): AdminAccess => ({
  role,
  owner: role === "owner",
  sales: role === "sales",
  approver: false,
  trainingMode: true,
  approvers: [],
  loaded: false,
  can: (perm) => can(role, perm),
  refresh: () => {},
});

const AdminAccessContext = createContext<AdminAccess>(fallback("staff"));

/**
 * The signed-in person's role (from their token, known at once) and their
 * approval rights (from the server). Display only: every server action and
 * route checks for itself.
 */
export function AdminAccessProvider({ role, children }: { role: AdminRole; children: ReactNode }) {
  const { getIdToken, user } = useAuth();
  const [server, setServer] = useState<{ uid: string; access: Awaited<ReturnType<typeof getMyAccess>> } | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const token = await getIdToken();
        if (!token || !user) return;
        const access = await getMyAccess(token);
        if (live) setServer({ uid: user.uid, access });
      } catch {
        // Keep the token's role; approval buttons stay hidden.
      }
    })();
    return () => {
      live = false;
    };
  }, [getIdToken, user, tick]);

  const value = useMemo<AdminAccess>(() => {
    const s = server && server.uid === user?.uid ? server.access : null;
    // The token decides the role; the server only adds approval rights.
    const r: AdminRole = role;
    return {
      ...fallback(r),
      approver: s ? s.approver && r !== "sales" : false,
      trainingMode: s ? s.trainingMode : true,
      approvers: s?.approvers ?? [],
      loaded: !!s,
      refresh,
    };
  }, [role, server, user?.uid, refresh]);

  return <AdminAccessContext.Provider value={value}>{children}</AdminAccessContext.Provider>;
}

export const useAdminAccess = () => useContext(AdminAccessContext);

/**
 * Quotes waiting in the approval queue, for approvers (empty for everyone
 * else). "Just mine" leads' quotes are left out for non-owners.
 */
export function usePendingApprovals(): QuoteRequest[] {
  const { approver, owner } = useAdminAccess();
  const { data } = useFirestoreCollection<QuoteRequest>(approver ? "quoteRequests" : null, {
    constraints: [where("approvalStatus", "==", "pending")],
  });
  return useMemo(() => (approver ? visibleQuotes(data, owner) : []), [approver, owner, data]);
}
