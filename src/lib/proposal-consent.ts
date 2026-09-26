// What the customer agrees to on the proposal page, word for word, plus the
// small rules around an acceptance. Shared by the page (which shows the
// text) and the respond route (which checks the text it gets back is the
// text it expects for that total, then keeps it in the acceptance record).
// No Firebase or node imports: safe on client and server.

import { money } from "@/lib/proposal";

/** The label next to the "I agree" box, for this total. */
export function acceptConsentText(total: number): string {
  return `I approve this quote for ${money(total)} and agree to the terms above.`;
}

/** The decline button's label; stored as the consent text of a decline. */
export const DECLINE_CONSENT_TEXT = "Decline quote";

/** Shown under the accept button. */
export const SIGNATURE_NOTICE =
  "Typing your name and checking the box is your signature. We keep a record of when you approved.";

/** The first 12 characters of the content hash, shown to the customer as the quote's fingerprint. */
export function fingerprint(hash: string | undefined | null): string {
  return (hash || "").slice(0, 12);
}

/** After this many days an accepted link stops showing the map and prices. */
export const ACCEPTED_ARCHIVE_DAYS = 180;

export function isArchivedAcceptance(
  p: { status: string; acceptedAt?: string },
  now: number = Date.now()
): boolean {
  if (p.status !== "accepted" || !p.acceptedAt) return false;
  const t = new Date(p.acceptedAt).getTime();
  return Number.isFinite(t) && now - t > ACCEPTED_ARCHIVE_DAYS * 86_400_000;
}

// Words that say nothing about who someone is.
const FILLER = new Set(["co", "company", "inc", "llc", "ltd", "corp", "the", "and", "of", "mr", "mrs", "ms", "dr", "jr", "sr"]);

function nameWords(s: string): string[] {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !FILLER.has(w));
}

/**
 * Loose check that the typed signature belongs to the customer on the quote:
 * any shared word counts ("Pat" for "Pat Jones", "Jones" for "Patricia
 * Jones"). A quote with no customer name matches anything. A mismatch is
 * allowed through (a spouse or office manager may sign) but flagged.
 */
export function nameLooselyMatches(typed: string, customer: string): boolean {
  const want = nameWords(customer);
  if (!want.length) return true;
  const got = nameWords(typed);
  return got.some((w) => want.includes(w) || want.some((c) => c.length >= 3 && w.length >= 3 && (c.startsWith(w) || w.startsWith(c))));
}

/** saveQuoteWork's answer, and the workbench's banner, for an accepted quote. */
export const QUOTE_ACCEPTED_LOCKED = "This quote was accepted. Undo the acceptance or start a new quote for changes.";
