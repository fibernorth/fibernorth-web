import { describe, expect, it } from "vitest";
import { layoutLooksShifted, misreadShare } from "@/lib/sheet-layout";

const good = (i: number) => ({ name: `Pat ${i}`, phone: "(231) 555-01" + String(10 + i), email: `pat${i}@x.com` });
// Two columns inserted before Name: Name reads the new "Where" column, Phone
// reads City, Email reads the real name.
const shifted = (i: number) => ({ name: "", phone: i % 2 ? "Traverse City" : "", email: `Pat ${i}` });

describe("sheet layout guard", () => {
  it("passes a normal sheet with a stray bad row", () => {
    const rows = Array.from({ length: 30 }, (_, i) => good(i));
    rows.push({ name: "Walk-in", phone: "", email: "" });
    expect(layoutLooksShifted(rows)).toBe(false);
  });
  it("refuses a sheet whose columns moved", () => {
    const rows = Array.from({ length: 30 }, (_, i) => shifted(i));
    expect(misreadShare(rows)).toBe(1);
    expect(layoutLooksShifted(rows)).toBe(true);
  });
  it("leaves tiny batches alone", () => {
    expect(layoutLooksShifted([shifted(1), shifted(2)])).toBe(false);
  });
  it("accepts rows with only a phone or only an email", () => {
    const rows = Array.from({ length: 10 }, (_, i) => (i % 2 ? { name: "A", phone: "2315550100" } : { name: "B", email: "b@x.com" }));
    expect(layoutLooksShifted(rows)).toBe(false);
  });
});
