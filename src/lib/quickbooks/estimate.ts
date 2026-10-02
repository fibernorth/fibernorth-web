// Turns a CRM quote (or the proposal a customer accepted) into a QuickBooks
// Online Estimate. Pure: no Firebase, no fetch. The items are looked up in
// QuickBooks at send time (src/services/quickbooks.ts) and passed in.
//
// FiberNorth, Inc. uses Automated Sales Tax, so lines only say taxable
// ("TAX") or not ("NON") and QuickBooks works out the tax itself. We never
// add a tax line of our own.

import type { QuoteLine } from "@/lib/types";
import { localDateOf } from "@/lib/leads";

/** Item names (FullyQualifiedName) in Bill's QuickBooks. */
export const QBO_ITEMS = {
  drilling: "Directional Drilling",
  labor: "Labor:Labor",
  fusion: "Labor:Fusion",
  misc: "Misc",
} as const;

/** The Estimate custom field Bill uses for the job site. */
export const PO_FIELD = { DefinitionId: "1", Name: "P.O. Number", max: 31 } as const;

export interface QboItemRef {
  id: string;
  name: string;
}

/** FullyQualifiedName -> item, for the items that exist. */
export type QboItemMap = Record<string, QboItemRef>;

export class MissingItemError extends Error {
  constructor(public itemName: string) {
    super(`QuickBooks has no product/service named "${itemName}". Add it in QuickBooks (or rename yours to match), then send again.`);
  }
}

/** A quote's data, from the accepted proposal or the quote itself. */
export interface EstimateSource {
  quoteId: string;
  customer: { name: string; email: string; phone: string; address: string };
  lines: QuoteLine[];
  /** When the estimate was given to the customer (ISO); today when unsent. */
  txnDate: string;
  /** Good-through instant (ISO), if sent. */
  expiresAt?: string;
  accepted?: { name: string; at: string } | null;
}

export interface EstimateLine {
  DetailType: "SalesItemLineDetail";
  Description: string;
  Amount: number;
  SalesItemLineDetail: {
    ItemRef: { value: string; name: string };
    Qty: number;
    UnitPrice: number;
    TaxCodeRef: { value: "TAX" | "NON" };
  };
}

export interface EstimateBody {
  CustomerRef: { value: string };
  TxnDate: string;
  ExpirationDate?: string;
  BillEmail?: { Address: string };
  CustomField?: Array<{ DefinitionId: string; Name: string; Type: "StringType"; StringValue: string }>;
  PrivateNote: string;
  Line: EstimateLine[];
  TxnStatus?: "Accepted";
  AcceptedBy?: string;
  AcceptedDate?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const UNIT = String.raw`(?:"|”|''|in\b\.?|inch(?:es)?\b)`;
const SIZE_RE = new RegExp(
  String.raw`(?<![\d./])(\d+(?:\.\d+)?(?:[- ]\d/\d{1,2})?|\d/\d{1,2})\s*-?\s*${UNIT}`,
  "i"
);
const PIPE_WORDS = /\b(conduit|pipe|hdpe|sdr|duct|innerduct|pvc|poly(?:ethylene)?|dr\s?\d)/i;

/**
 * The conduit/pipe size in a material description, as QuickBooks' item names
 * write it ("2", "1.25"), or null. Needs a pipe word too, so "2in coupler"
 * isn't taken for 2in conduit.
 */
export function conduitSize(description: string): string | null {
  const text = description || "";
  if (!PIPE_WORDS.test(text)) return null;
  const m = SIZE_RE.exec(text);
  if (!m) return null;
  const raw = m[1].replace(/\s+/g, " ");
  let value: number;
  const mixed = /^(\d+)[- ](\d)\/(\d{1,2})$/.exec(raw);
  const frac = /^(\d)\/(\d{1,2})$/.exec(raw);
  if (mixed) value = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  else if (frac) value = Number(frac[1]) / Number(frac[2]);
  else value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 48) return null;
  return String(Math.round(value * 1000) / 1000);
}

export const conduitItemName = (size: string) => `Conduit:${size}in`;

/** Every item name a set of lines could use, to look up in one go. */
export function wantedItemNames(lines: QuoteLine[]): string[] {
  const names = new Set<string>([QBO_ITEMS.drilling, QBO_ITEMS.misc]);
  for (const l of lines) {
    if (l.kind === "material") {
      const size = conduitSize(l.description);
      if (size) names.add(conduitItemName(size));
    } else {
      names.add(workItemName(l.description));
    }
  }
  return [...names];
}

function workItemName(description: string): string {
  const d = description || "";
  if (/\bfus(?:ion|ing|e|ed)\b/i.test(d)) return QBO_ITEMS.fusion;
  if (/\blabou?r\b/i.test(d)) return QBO_ITEMS.labor;
  return QBO_ITEMS.drilling;
}

/** The item a line goes on, and whether it is taxable. Throws MissingItemError. */
export function itemForLine(line: QuoteLine, items: QboItemMap): { item: QboItemRef; taxable: boolean } {
  const need = (name: string) => {
    const it = items[name];
    if (!it) throw new MissingItemError(name);
    return it;
  };
  if (line.kind === "material") {
    const size = conduitSize(line.description);
    const conduit = size ? items[conduitItemName(size)] : undefined;
    return { item: conduit ?? need(QBO_ITEMS.misc), taxable: true };
  }
  return { item: need(workItemName(line.description)), taxable: false };
}

/** The job site for the "P.O. Number" field, cut to what QuickBooks allows. */
export function poNumber(address: string): string {
  const one = (address || "").replace(/\s+/g, " ").trim();
  return one.slice(0, PO_FIELD.max).trim();
}

/** Detroit calendar day of an ISO instant (a plain YYYY-MM-DD stays as is). */
export function qboDate(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return localDateOf(iso);
}

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export function buildEstimate(src: EstimateSource, items: QboItemMap, opts: { customerId: string }): EstimateBody {
  const lines = src.lines.filter(
    (l) => (l.description || "").trim() || (Number(l.qty) || 0) * (Number(l.unitPrice) || 0) !== 0
  );
  if (!lines.length) throw new Error("This quote has no lines to send.");
  const Line: EstimateLine[] = lines.map((l) => {
    const qty = Number(l.qty) || 0;
    const unitPrice = Number(l.unitPrice) || 0;
    const { item, taxable } = itemForLine(l, items);
    return {
      DetailType: "SalesItemLineDetail",
      Description: (l.description || "").trim().slice(0, 4000),
      Amount: round2(qty * unitPrice),
      SalesItemLineDetail: {
        ItemRef: { value: item.id, name: item.name },
        Qty: qty,
        UnitPrice: unitPrice,
        TaxCodeRef: { value: taxable ? "TAX" : "NON" },
      },
    };
  });

  const email = (src.customer.email || "").trim();
  const po = poNumber(src.customer.address);
  const body: EstimateBody = {
    CustomerRef: { value: opts.customerId },
    TxnDate: qboDate(src.txnDate),
    ...(src.expiresAt ? { ExpirationDate: qboDate(src.expiresAt) } : {}),
    ...(looksLikeEmail(email) ? { BillEmail: { Address: email } } : {}),
    ...(po
      ? { CustomField: [{ DefinitionId: PO_FIELD.DefinitionId, Name: PO_FIELD.Name, Type: "StringType" as const, StringValue: po }] }
      : {}),
    PrivateNote: `fibernorth.com quote ${src.quoteId}`,
    Line,
  };
  if (src.accepted) {
    body.TxnStatus = "Accepted";
    body.AcceptedBy = src.accepted.name.slice(0, 100);
    body.AcceptedDate = qboDate(src.accepted.at);
  }
  return body;
}

// ---- Customers ---------------------------------------------------------------

/** A string inside single quotes in a QuickBooks query. */
export function qboQuoted(value: string): string {
  return `'${String(value).replace(/'/g, "\\'")}'`;
}

/** QuickBooks refuses colons, tabs and newlines in a display name. */
export function cleanDisplayName(name: string): string {
  return (name || "").replace(/[:\t\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

/**
 * Display name for a new customer whose name is already taken by someone
 * else (different email): "Jim Smith - 231-555-0100" (or the email).
 */
export function collisionDisplayName(name: string, phone: string, email: string): string {
  const tag = (phone || "").trim() || (email || "").trim();
  const base = cleanDisplayName(name);
  if (!tag) return base;
  const suffix = ` - ${tag}`.replace(/[:\t\r\n]+/g, " ");
  return `${base.slice(0, 100 - suffix.length)}${suffix}`;
}

export interface QboCustomerLite {
  Id: string;
  DisplayName?: string;
  PrimaryEmailAddr?: { Address?: string };
}

/**
 * Whether a customer found by display name is ours. Same email, or either
 * side has no email to tell them apart, counts as the same person.
 */
export function sameCustomerByName(found: QboCustomerLite, email: string): boolean {
  const theirs = (found.PrimaryEmailAddr?.Address || "").trim().toLowerCase();
  const ours = (email || "").trim().toLowerCase();
  return !theirs || !ours || theirs === ours;
}

/** Given/family name, best effort. Companies just get a display name. */
export function splitName(name: string): { GivenName?: string; FamilyName?: string } {
  const n = (name || "").replace(/\s+/g, " ").trim();
  if (!n || /\b(inc|llc|co|corp|company|ltd|township|county|city|village|church|school|farms?|construction|excavating|electric)\b/i.test(n)) {
    return {};
  }
  const parts = n.split(" ");
  if (parts.length === 1) return { GivenName: parts[0].slice(0, 100) };
  return { GivenName: parts.slice(0, -1).join(" ").slice(0, 100), FamilyName: parts[parts.length - 1].slice(0, 100) };
}

export function newCustomerBody(
  displayName: string,
  c: { name: string; email: string; phone: string; address: string }
): Record<string, unknown> {
  const email = (c.email || "").trim();
  const address = (c.address || "").replace(/\s+/g, " ").trim();
  return {
    DisplayName: displayName,
    ...splitName(c.name),
    ...(looksLikeEmail(email) ? { PrimaryEmailAddr: { Address: email } } : {}),
    ...(c.phone?.trim() ? { PrimaryPhone: { FreeFormNumber: c.phone.trim().slice(0, 30) } } : {}),
    ...(address ? { BillAddr: { Line1: address.slice(0, 500) } } : {}),
  };
}

export const qboEstimateUrl = (id: string) => `https://qbo.intuit.com/app/estimate?txnId=${encodeURIComponent(id)}`;
