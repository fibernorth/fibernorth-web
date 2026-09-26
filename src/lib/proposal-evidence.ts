// Server-only: the content hash the customer's page shows and posts back.

import { proposalContentHash } from "@/lib/proposal-hash";
import type { Proposal } from "@/lib/types";

/** The respond route's answer when what the customer saw no longer matches. */
export const QUOTE_CHANGED = "This quote changed. Reload to see the current one.";

/**
 * The hash of what the page shows: the one stored at send, else (proposals
 * sent before hashes were kept) worked out from the stored copy.
 */
export function shownHash(p: Parameters<typeof proposalContentHash>[0] & Pick<Proposal, "contentHash">): string {
  return p.contentHash || proposalContentHash(p);
}
