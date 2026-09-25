import { describe, it, expect } from "vitest";
import { estimateBody, estimateUrl, qboQuote } from "./quickbooks-estimate";

const items = { work: { value: "23", name: "Directional Drilling" }, material: { value: "176", name: "Septic:Materials" } };
const base = {
  customerRef: { value: "71", name: "Pat Example" },
  items,
  email: "pat@example.com",
  memo: "  Bore 584 ft, well to house.  ",
  expiresAt: "2026-10-25T12:00:00.000Z",
  txnDate: "2026-09-25T12:00:00.000Z",
  privateNote: "FiberNorth quote v2 · https://fibernorth.com/proposal/abc",
};

describe("estimateBody", () => {
  it("bills work against the work item untaxed and materials against the material item taxed", () => {
    const b = estimateBody({
      ...base,
      lines: [
        { description: "Directional bore, ~584 ft", kind: "work", qty: 1, unitPrice: 7072 },
        { description: "2in HDPE", kind: "material", qty: 600, unitPrice: 2 },
      ],
    });
    expect(b.Line).toEqual([
      {
        LineNum: 1, DetailType: "SalesItemLineDetail", Description: "Directional bore, ~584 ft", Amount: 7072,
        SalesItemLineDetail: { ItemRef: items.work, Qty: 1, UnitPrice: 7072, TaxCodeRef: { value: "NON" } },
      },
      {
        LineNum: 2, DetailType: "SalesItemLineDetail", Description: "2in HDPE", Amount: 1200,
        SalesItemLineDetail: { ItemRef: items.material, Qty: 600, UnitPrice: 2, TaxCodeRef: { value: "TAX" } },
      },
    ]);
    expect(b.TxnStatus).toBe("Pending");
    expect(b.TxnDate).toBe("2026-09-25");
    expect(b.ExpirationDate).toBe("2026-10-25");
    expect(b.BillEmail).toEqual({ Address: "pat@example.com" });
    expect(b.CustomerMemo).toEqual({ value: "Bore 584 ft, well to house." });
    expect(b.PrivateNote).toBe(base.privateNote);
    expect(b.Id).toBeUndefined();
  });

  it("rounds amounts to cents and drops lines with nothing on them", () => {
    const b = estimateBody({ ...base, lines: [
      { description: "Fittings", kind: "material", qty: 3, unitPrice: 1.333 },
      { description: "Empty", kind: "work", qty: 0, unitPrice: 100 },
    ] }) as { Line: Array<{ Amount: number }> };
    expect(b.Line).toHaveLength(1);
    expect(b.Line[0].Amount).toBe(4);
  });

  it("updates the same estimate in place on a re-send", () => {
    const b = estimateBody({ ...base, existing: { id: "145", syncToken: "3" }, lines: [{ description: "Bore", kind: "work", qty: 1, unitPrice: 100 }] });
    expect(b.Id).toBe("145");
    expect(b.SyncToken).toBe("3");
    expect(b.sparse).toBe(true);
  });

  it("refuses an estimate with no priced line", () => {
    expect(() => estimateBody({ ...base, lines: [] })).toThrow();
  });
});

describe("helpers", () => {
  it("links to the right company host and escapes query literals", () => {
    expect(estimateUrl("145", "production")).toBe("https://app.qbo.intuit.com/app/estimate?txnId=145");
    expect(estimateUrl("145", "sandbox")).toContain("app.sandbox.qbo.intuit.com");
    expect(qboQuote("O'Brien")).toBe("'O\\'Brien'");
  });
});
