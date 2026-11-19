import { describe, expect, it } from "vitest";
import { formAnswersPatch } from "@/lib/sheet-form-answers";

describe("formAnswersPatch", () => {
  it("fills city, address and site details when blank", () => {
    expect(formAnswersPatch({}, { city: "Kalkaska", where: "House to pole barn, under the driveway" })).toEqual({
      city: "Kalkaska",
      address: "Kalkaska",
      siteDetails: "House to pole barn, under the driveway",
    });
  });
  it("never replaces what's there", () => {
    expect(
      formAnswersPatch({ city: "Elk Rapids", address: "123 Main St", siteDetails: "Bill's notes" }, { city: "Kalkaska", where: "x" })
    ).toEqual({});
  });
  it("does nothing for blank answers (older scripts)", () => {
    expect(formAnswersPatch({}, {})).toEqual({});
  });
});
