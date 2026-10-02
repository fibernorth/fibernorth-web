import { describe, it, expect } from "vitest";
import {
  buildEstimate,
  cleanDisplayName,
  collisionDisplayName,
  conduitSize,
  itemForLine,
  MissingItemError,
  newCustomerBody,
  poNumber,
  qboQuoted,
  sameCustomerByName,
  splitName,
  wantedItemNames,
  type EstimateSource,
  type QboItemMap,
} from "@/lib/quickbooks/estimate";
import type { QuoteLine } from "@/lib/types";

const items: QboItemMap = {
  "Directional Drilling": { id: "23", name: "Directional Drilling" },
  "Conduit:2in": { id: "139", name: "Conduit:2in" },
  "Conduit:3in": { id: "190", name: "Conduit:3in" },
  "Conduit:4in": { id: "198", name: "Conduit:4in" },
  "Labor:Labor": { id: "24", name: "Labor:Labor" },
  "Labor:Fusion": { id: "428", name: "Labor:Fusion" },
  Misc: { id: "38", name: "Misc" },
};

const work = (description: string, qty = 1, unitPrice = 100): QuoteLine => ({ description, kind: "work", qty, unitPrice });
const mat = (description: string, qty = 1, unitPrice = 10): QuoteLine => ({ description, kind: "material", qty, unitPrice });

const src = (over: Partial<EstimateSource> = {}): EstimateSource => ({
  quoteId: "Q1",
  customer: { name: "Jim Ellis", email: "jim@example.com", phone: "231-555-0100", address: "123 Lake Rd, Traverse City, MI 49684" },
  lines: [work("Directional Drilling, 260 ft", 1, 3120), mat("2in SDR 13.5 HDPE Orange Conduit", 260, 1.85)],
  txnDate: "2026-09-30T14:00:00Z",
  ...over,
});

describe("conduitSize", () => {
  it.each([
    ["2in SDR 13.5 HDPE Orange Conduit", "2"],
    ['2" HDPE conduit', "2"],
    ["2 in conduit", "2"],
    ["2-inch HDPE pipe", "2"],
    ["1.25in conduit", "1.25"],
    ['1-1/4" HDPE', "1.25"],
    ['3/4" poly pipe', "0.75"],
    ["SDR 11 4 inch conduit", "4"],
    ["3in. conduit, orange", "3"],
  ])("%s -> %s", (d, size) => expect(conduitSize(d)).toBe(size));

  it("needs a size and a pipe word", () => {
    expect(conduitSize("HDPE conduit")).toBeNull();
    expect(conduitSize("2in coupler")).toBeNull();
    expect(conduitSize("SDR 13.5 HDPE")).toBeNull();
  });
});

describe("line mapping", () => {
  it("work lines go on Directional Drilling, not taxed", () => {
    expect(itemForLine(work("Directional bore, ~200 ft"), items)).toEqual({ item: items["Directional Drilling"], taxable: false });
  });

  it("labor and fusion work lines get their own items", () => {
    expect(itemForLine(work("Fusion of 2in pipe"), items).item.id).toBe("428");
    expect(itemForLine(work("Pipe fusing"), items).item.id).toBe("428");
    expect(itemForLine(work("Labor - pothole and restore"), items).item.id).toBe("24");
    expect(itemForLine(work("Laborious bore"), items).item.id).toBe("23");
  });

  it("conduit sizes find their item; other materials go on Misc, taxed", () => {
    expect(itemForLine(mat("4in HDPE conduit"), items)).toEqual({ item: items["Conduit:4in"], taxable: true });
    expect(itemForLine(mat("6in HDPE conduit"), items)).toEqual({ item: items.Misc, taxable: true });
    expect(itemForLine(mat("Pull string"), items)).toEqual({ item: items.Misc, taxable: true });
  });

  it("names a missing item", () => {
    const noMisc = { ...items };
    delete noMisc.Misc;
    expect(() => itemForLine(mat("Pull string"), noMisc)).toThrow(MissingItemError);
    expect(() => itemForLine(mat("Pull string"), noMisc)).toThrow(/"Misc"/);
    const noDrill = { ...items };
    delete noDrill["Directional Drilling"];
    expect(() => itemForLine(work("Bore"), noDrill)).toThrow(/"Directional Drilling"/);
  });

  it("lists the items to look up", () => {
    expect(wantedItemNames([work("Bore"), work("Fusion"), mat("2in conduit"), mat('1.25" conduit'), mat("Tape")]).sort()).toEqual(
      ["Conduit:1.25in", "Conduit:2in", "Directional Drilling", "Labor:Fusion", "Misc"].sort()
    );
  });
});

describe("buildEstimate", () => {
  it("builds lines with tax codes and amounts rounded to cents", () => {
    const e = buildEstimate(src(), items, { customerId: "77" });
    expect(e.CustomerRef).toEqual({ value: "77" });
    expect(e.Line).toEqual([
      {
        DetailType: "SalesItemLineDetail",
        Description: "Directional Drilling, 260 ft",
        Amount: 3120,
        SalesItemLineDetail: { ItemRef: { value: "23", name: "Directional Drilling" }, Qty: 1, UnitPrice: 3120, TaxCodeRef: { value: "NON" } },
      },
      {
        DetailType: "SalesItemLineDetail",
        Description: "2in SDR 13.5 HDPE Orange Conduit",
        Amount: 481,
        SalesItemLineDetail: { ItemRef: { value: "139", name: "Conduit:2in" }, Qty: 260, UnitPrice: 1.85, TaxCodeRef: { value: "TAX" } },
      },
    ]);
    // No tax line of our own: Automated Sales Tax does it.
    expect(e.Line).toHaveLength(2);
    expect(JSON.stringify(e)).not.toMatch(/TxnTaxDetail/);
  });

  it("rounds odd amounts", () => {
    const e = buildEstimate(src({ lines: [mat("Misc parts", 3, 1.333)] }), items, { customerId: "1" });
    expect(e.Line[0].Amount).toBe(4);
    const e2 = buildEstimate(src({ lines: [mat("Misc parts", 3, 0.125)] }), items, { customerId: "1" });
    expect(e2.Line[0].Amount).toBe(0.38);
  });

  it("drops blank rows, keeps an included $0 line", () => {
    const e = buildEstimate(src({ lines: [work("Bore", 1, 500), work("", 1, 0), work("Restoration included", 1, 0)] }), items, {
      customerId: "1",
    });
    expect(e.Line.map((l) => l.Description)).toEqual(["Bore", "Restoration included"]);
  });

  it("sets email, date in Detroit time, P.O. Number and private note", () => {
    // 02:30 UTC Oct 1 is still Sept 30 in Detroit.
    const e = buildEstimate(src({ txnDate: "2026-10-01T02:30:00Z" }), items, { customerId: "1" });
    expect(e.TxnDate).toBe("2026-09-30");
    expect(e.BillEmail).toEqual({ Address: "jim@example.com" });
    expect(e.PrivateNote).toBe("fibernorth.com quote Q1");
    expect(e.CustomField).toEqual([{ DefinitionId: "1", Name: "P.O. Number", Type: "StringType", StringValue: "123 Lake Rd, Traverse City, MI" }]);
    expect(e.CustomField![0].StringValue.length).toBeLessThanOrEqual(31);
    expect(e.TxnStatus).toBeUndefined();
  });

  it("leaves out email and P.O. Number when there are none", () => {
    const e = buildEstimate(src({ customer: { name: "A", email: "not an email", phone: "", address: "  " } }), items, { customerId: "1" });
    expect(e.BillEmail).toBeUndefined();
    expect(e.CustomField).toBeUndefined();
  });

  it("marks an accepted quote", () => {
    const e = buildEstimate(
      src({ accepted: { name: "James Ellis", at: "2026-10-02T01:00:00Z" }, expiresAt: "2026-10-31T03:59:59.999Z" }),
      items,
      { customerId: "1" }
    );
    expect(e.TxnStatus).toBe("Accepted");
    expect(e.AcceptedBy).toBe("James Ellis");
    expect(e.AcceptedDate).toBe("2026-10-01");
    expect(e.ExpirationDate).toBe("2026-10-30");
  });

  it("refuses a quote with no lines", () => {
    expect(() => buildEstimate(src({ lines: [] }), items, { customerId: "1" })).toThrow(/no lines/);
  });
});

describe("poNumber", () => {
  it("cuts to 31 characters and tidies spaces", () => {
    expect(poNumber("  4410   Old Mission Rd,\nTraverse City MI  ")).toBe("4410 Old Mission Rd, Traverse C");
    expect(poNumber("Short St")).toBe("Short St");
    expect(poNumber("")).toBe("");
    // No trailing space left after the cut.
    expect(poNumber("123456789012345678901234567890 X")).toBe("123456789012345678901234567890");
  });
});

describe("customers", () => {
  it("escapes single quotes in queries", () => {
    expect(qboQuoted("O'Brien")).toBe("'O\\'Brien'");
    expect(`select * from Customer where DisplayName = ${qboQuoted("Bob's Barn")}`).toBe(
      "select * from Customer where DisplayName = 'Bob\\'s Barn'"
    );
  });

  it("names a customer apart when the name is taken", () => {
    expect(collisionDisplayName("Jim Ellis", "231-555-0100", "jim@x.com")).toBe("Jim Ellis - 231-555-0100");
    expect(collisionDisplayName("Jim Ellis", "", "jim@x.com")).toBe("Jim Ellis - jim@x.com");
    expect(collisionDisplayName("Jim Ellis", "", "")).toBe("Jim Ellis");
    expect(collisionDisplayName("x".repeat(120), "231", "").length).toBe(100);
  });

  it("matches a same-name customer only when the emails don't disagree", () => {
    expect(sameCustomerByName({ Id: "1", PrimaryEmailAddr: { Address: "JIM@x.com" } }, "jim@x.com")).toBe(true);
    expect(sameCustomerByName({ Id: "1" }, "jim@x.com")).toBe(true);
    expect(sameCustomerByName({ Id: "1", PrimaryEmailAddr: { Address: "a@x.com" } }, "")).toBe(true);
    expect(sameCustomerByName({ Id: "1", PrimaryEmailAddr: { Address: "popp@x.com" } }, "jim@x.com")).toBe(false);
  });

  it("cleans display names and splits people's names", () => {
    expect(cleanDisplayName(" Popp:\tExcavating ")).toBe("Popp Excavating");
    expect(splitName("Mary Ann Smith")).toEqual({ GivenName: "Mary Ann", FamilyName: "Smith" });
    expect(splitName("Popp Excavating LLC")).toEqual({});
    expect(splitName("Cher")).toEqual({ GivenName: "Cher" });
  });

  it("builds a new customer", () => {
    expect(newCustomerBody("Jim Ellis", { name: "Jim Ellis", email: "jim@x.com", phone: "231-555-0100", address: "1 Main St" })).toEqual({
      DisplayName: "Jim Ellis",
      GivenName: "Jim",
      FamilyName: "Ellis",
      PrimaryEmailAddr: { Address: "jim@x.com" },
      PrimaryPhone: { FreeFormNumber: "231-555-0100" },
      BillAddr: { Line1: "1 Main St" },
    });
  });
});
