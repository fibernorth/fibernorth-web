import { describe, it, expect } from "vitest";
import { changedFields, dropCaughtUpEdits, editField, staleEdits, type FieldEdits } from "./settings-form";

describe("settings form", () => {
  const stored = { phone: "231-555-0100", googleReviewUrl: "https://g.page/old" };

  it("saves only the fields edited here", () => {
    let e: FieldEdits = {};
    e = editField(e, stored, "phone", "231-555-0199");
    expect(changedFields(e, stored)).toEqual({ phone: "231-555-0199" });
    // Someone else changes the review link meanwhile: not reverted by our save.
    const later = { ...stored, googleReviewUrl: "https://g.page/new" };
    expect(changedFields(e, later)).toEqual({ phone: "231-555-0199" });
    expect(staleEdits(e, later)).toEqual([]);
  });

  it("typing back to the stored value is not an edit", () => {
    let e = editField({}, stored, "phone", "x");
    e = editField(e, stored, "phone", stored.phone);
    expect(e).toEqual({});
  });

  it("keeps the starting value across keystrokes and flags changes made elsewhere", () => {
    let e = editField({}, stored, "phone", "2");
    e = editField(e, stored, "phone", "23");
    expect(e.phone).toEqual({ value: "23", base: "231-555-0100" });
    expect(staleEdits(e, { ...stored, phone: "999" })).toEqual(["phone"]);
  });

  it("drops edits once the stored doc catches up", () => {
    const e = editField({}, stored, "phone", "new");
    expect(dropCaughtUpEdits(e, { ...stored, phone: "new" })).toEqual({});
    expect(dropCaughtUpEdits(e, stored)).toBe(e);
  });

  it("a brand-new field starts from blank", () => {
    const e = editField({}, stored, "quoteSmsTo", "+1231");
    expect(changedFields(e, stored)).toEqual({ quoteSmsTo: "+1231" });
    expect(staleEdits(e, stored)).toEqual([]);
  });
});
