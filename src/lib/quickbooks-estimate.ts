// The QuickBooks Online Estimate we record for a sent quote. Pure: no
// Firebase, no network, so it is unit-tested and the same on every send.
//
// Work lines bill against the "work" item and carry no sales tax; material
// lines bill against the "material" item and are marked taxable, and
// QuickBooks (Automated Sales Tax) works out Michigan's 6% itself, the same
// rate computeLineTotals applies on the proposal. The CRM's proposal link
// rides in the private note so the estimate can be traced back; the customer
// never sees it there.

import type { QuoteLine } from "@/lib/types";

export interface QboItemRef {
  value: string;
  name?: string;
}

export interface EstimateItems {
  work: QboItemRef;
  material: QboItemRef;
}

export interface EstimateInput {
  lines: QuoteLine[];
  customerRef: QboItemRef;
  items: EstimateItems;
  email?: string;
  /** Customer-facing memo (the scope text). */
  memo?: string;
  /** YYYY-MM-DD */
  expiresAt: string;
  /** YYYY-MM-DD */
  txnDate: string;
  /** Internal note (the CRM quote link and version). */
  privateNote?: string;
  /** Set on a re-send to update the same estimate in place. */
  existing?: { id: string; syncToken: string };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const day = (iso: string) => iso.slice(0, 10);

export function estimateBody(input: EstimateInput): Record<string, unknown> {
  const lines = input.lines.filter((l) => (Number(l.qty) || 0) * (Number(l.unitPrice) || 0) > 0);
  if (lines.length === 0) throw new Error("An estimate needs at least one line with a price.");
  const Line = lines.map((l, i) => {
    const material = l.kind === "material";
    return {
      LineNum: i + 1,
      DetailType: "SalesItemLineDetail",
      Description: (l.description || (material ? "Materials" : "Work")).slice(0, 4000),
      Amount: round2(l.qty * l.unitPrice),
      SalesItemLineDetail: {
        ItemRef: material ? input.items.material : input.items.work,
        Qty: l.qty,
        UnitPrice: round2(l.unitPrice),
        TaxCodeRef: { value: material ? "TAX" : "NON" },
      },
    };
  });
  return {
    ...(input.existing ? { Id: input.existing.id, SyncToken: input.existing.syncToken, sparse: true } : {}),
    TxnDate: day(input.txnDate),
    ExpirationDate: day(input.expiresAt),
    TxnStatus: "Pending",
    CustomerRef: input.customerRef,
    ...(input.email ? { BillEmail: { Address: input.email } } : {}),
    ...(input.memo?.trim() ? { CustomerMemo: { value: input.memo.trim().slice(0, 1000) } } : {}),
    ...(input.privateNote ? { PrivateNote: input.privateNote.slice(0, 4000) } : {}),
    Line,
  };
}

/** Where to look at the estimate in QuickBooks. */
export function estimateUrl(id: string, environment: "production" | "sandbox"): string {
  const host = environment === "sandbox" ? "app.sandbox.qbo.intuit.com" : "app.qbo.intuit.com";
  return `https://${host}/app/estimate?txnId=${encodeURIComponent(id)}`;
}

/** Escape a value for a QBO query string literal. */
export function qboQuote(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
