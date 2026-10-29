// One search box for the Quotes list. Pure, so it can be tested.
//
// Every word typed has to be found somewhere on the quote (customer name,
// contact, phone, email, address, city, quote number or version, the lead's
// name, the contractor it's a job for, the description). Case and
// punctuation don't matter: "o'brien" finds "OBrien", "231-675-6258" finds
// "(231) 675 6258", "#1042" finds estimate 1042, "v2" finds a version 2.

import type { Lead } from "@/lib/leads";
import type { QuoteRequest } from "@/lib/types";

/** Lowercase, apostrophes dropped, every other non-letter/digit a space. */
export function normalizeForSearch(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['‘’`]/g, "")
    .replace(/[^a-z0-9@.]+/g, " ")
    .replace(/(^|\s)[.@]+|[.@]+(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The words of a search, normalized; blank words dropped. */
export function searchTokens(query: string): string[] {
  const out: string[] = [];
  for (const t of normalizeForSearch(query).split(" ")) if (t && !out.includes(t)) out.push(t);
  return out;
}

export interface SearchHaystack {
  /** Normalized text of every field, space separated. */
  text: string;
  /** Same text with spaces and dots removed ("po box" also matches "pobox"). */
  squashed: string;
  /** Digits of every phone number, space separated. */
  phones: string;
}

/** Build the searchable text once per quote (the list re-filters on every keystroke). */
export function buildHaystack(fields: Array<string | number | null | undefined>, phones: Array<string | null | undefined> = []): SearchHaystack {
  const text = normalizeForSearch(fields.filter((f) => f !== null && f !== undefined && f !== "").join(" "));
  return {
    text: ` ${text} `,
    squashed: text.replace(/[\s.]+/g, ""),
    phones: phones.map((p) => (p || "").replace(/\D+/g, "")).filter(Boolean).join(" "),
  };
}

function tokenHits(token: string, h: SearchHaystack): boolean {
  if (h.text.includes(token)) return true;
  // Digits typed in pieces or with punctuation still find the phone.
  if (/^\d+$/.test(token) && token.length >= 3 && h.phones.includes(token)) return true;
  // "v2" also matches "version 2"; "#12" was already reduced to "12".
  const squashedToken = token.replace(/\./g, "");
  return squashedToken.length >= 3 && h.squashed.includes(squashedToken);
}

/**
 * True when every word of `query` is found in the haystack. A blank query
 * matches everything. A long run of digits (a whole phone number typed with
 * no spaces) is also compared against the phone digits as a whole.
 */
export function matchesSearch(query: string, h: SearchHaystack): boolean {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return true;
  // A phone typed with punctuation ("(231) 675-6258") splits into pieces;
  // compare all of its digits together too, so the pieces must be in order.
  const allDigits = query.replace(/\D+/g, "");
  if (allDigits.length >= 7 && /^[\d\s()+.\-]+$/.test(query.trim()) && h.phones.includes(allDigits)) return true;
  return tokens.every((t) => tokenHits(t, h));
}

type QuoteForSearch = Pick<QuoteRequest, "id" | "name" | "phone" | "email" | "address" | "description"> &
  Partial<Pick<QuoteRequest, "version" | "qboDocNumber" | "serviceType" | "notes" | "mapAnnotation" | "scopeText">>;

type LeadForSearch = Pick<Lead, "name"> & Partial<Pick<Lead, "contactName" | "phone" | "email" | "address">>;

/**
 * The haystack for one quote row: the quote's own fields, its lead's, and
 * the contractor (parent account) the lead is a job for.
 */
export function quoteHaystack(q: QuoteForSearch, lead?: LeadForSearch | null, parent?: LeadForSearch | null): SearchHaystack {
  const v = Number(q.version || 0);
  const fields: Array<string | number | null | undefined> = [
    q.name,
    q.email,
    q.phone,
    q.address,
    q.mapAnnotation?.address,
    q.description,
    q.serviceType,
    q.id,
    q.qboDocNumber,
    q.qboDocNumber ? `estimate ${q.qboDocNumber}` : "",
    v ? `v${v} version ${v}` : "",
    lead?.name,
    lead?.contactName,
    lead?.email,
    lead?.address,
    parent?.name,
    parent?.contactName,
  ];
  return buildHaystack(fields, [q.phone, lead?.phone, parent?.phone]);
}
