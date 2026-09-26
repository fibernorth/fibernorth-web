"use server";

import { verifyServerActionCaller } from "@/lib/server-action-auth";
import { loadProposal } from "@/lib/proposal-server";
import type { Proposal } from "@/lib/types";

/**
 * The parts of a proposal the public page hides once an acceptance is old
 * (map, plan, prices, address), for a signed-in admin looking at the link
 * with ?preview=1.
 */
export async function loadArchivedProposalDetails(
  token: string,
  authToken: string
): Promise<Pick<Proposal, "lines" | "totals" | "annotation" | "planImageUrl"> & { address: string } | null> {
  await verifyServerActionCaller(authToken);
  const p = await loadProposal(token);
  if (!p) return null;
  return {
    lines: p.lines || [],
    totals: p.totals,
    annotation: p.annotation ?? null,
    planImageUrl: p.planImageUrl || "",
    address: p.customer?.address || "",
  };
}
