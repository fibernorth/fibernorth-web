// The sheet is the master list: the firm's edits reach worked leads.
import { describe, it, expect } from "vitest";
import { firmChanges, seenFromRow, seenChanged, type SeenField } from "@/lib/sheet-sync";
import type { Lead } from "@/lib/leads";

const row = (over: Partial<Record<SeenField, string>> = {}): Record<SeenField, string> => ({
  name: "Andy Keson",
  phone: "231-555-0100",
  email: "andy@example.com",
  serviceType: "Water",
  answered: "Yes",
  booked: "",
  taken: "",
  converted: "",
  objection: "",
  cash: "",
  sale: "",
  ...over,
});

const lead = (over: Partial<Lead> = {}): Lead =>
  ({
    id: "L1",
    name: "Andy Keson",
    phone: "231-555-0100",
    email: "andy@example.com",
    stage: "contacted",
    touched: true,
    activity: [{ ts: "2026-09-20T15:00:00Z", type: "call", text: "talked" }],
    sheetSeen: seenFromRow(row()),
    ...over,
  }) as Lead;

describe("firmChanges", () => {
  it("adopts a phone or email the firm corrected", () => {
    const r = firmChanges(lead(), row({ phone: "231-555-0199", email: "andy.k@example.com" }));
    expect(r.patch).toMatchObject({ phone: "231-555-0199", email: "andy.k@example.com" });
    expect(r.lines.join(" ")).toContain("changed the phone");
  });

  it("keeps Bill's correction when the sheet didn't change", () => {
    const r = firmChanges(lead({ email: "fixed@example.com" }), row());
    expect(r.patch.email).toBeUndefined();
  });

  it("first sync with no history only fills blanks", () => {
    const r = firmChanges(lead({ sheetSeen: undefined, phone: "" }), row({ email: "other@example.com" }));
    expect(r.patch).toEqual({ phone: "231-555-0100", serviceType: "Water" });
  });

  it("reports a status the firm entered, without changing the stage", () => {
    const r = firmChanges(lead(), row({ converted: "Yes" }));
    expect(r.lines).toContain("Marketing sheet: Client Converted set to Yes");
    expect(r.patch).not.toHaveProperty("stage");
  });

  it("stays quiet when the sheet now agrees with the CRM or holds our own write", () => {
    expect(firmChanges(lead(), row({ answered: "Yes" })).lines).toEqual([]);
    const owned = lead({ sheetOwned: { converted: { value: "Long Term Follow Up", at: "x" } } });
    expect(firmChanges(owned, row({ converted: "Long Term Follow Up" })).lines).toEqual([]);
  });

  it("fills a blank sale the firm just entered, but never re-adopts an old cell", () => {
    const r = firmChanges(lead(), row({ sale: "$6,000.00" }));
    expect(r.patch).toMatchObject({ saleAmount: "$6,000.00", saleAmountNum: 6000 });
    const stale = lead({ sheetSeen: seenFromRow(row({ sale: "$4,250.00" })) });
    expect(firmChanges(stale, row({ sale: "$4,250.00" })).patch.saleAmount).toBeUndefined();
  });

  it("reports a sale that disagrees with the CRM instead of overwriting it", () => {
    const r = firmChanges(lead({ saleAmount: "5000" }), row({ sale: "$6,000.00" }));
    expect(r.patch.saleAmount).toBeUndefined();
    expect(r.lines[0]).toContain("the CRM has 5000");
  });

  it("seenChanged notices any edit", () => {
    expect(seenChanged(lead(), seenFromRow(row()))).toBe(false);
    expect(seenChanged(lead(), seenFromRow(row({ booked: "Yes" })))).toBe(true);
  });
});
