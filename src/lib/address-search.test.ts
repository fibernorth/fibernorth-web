import { describe, it, expect } from "vitest";
import { fromPhoton, inMichigan, photonLabel, withoutHouseNumber } from "./address-search";

describe("address search helpers", () => {
  it("labels a Photon result like a mailing address", () => {
    expect(photonLabel({ housenumber: "5555", street: "M-72 East", city: "Acme Township", state: "Michigan", postcode: "49690" })).toBe(
      "5555 M-72 East, Acme Township, MI 49690"
    );
    expect(photonLabel({ name: "Traverse Bay RV Resort", housenumber: "5555", street: "M-72 East", city: "Acme Township", postcode: "49690" })).toBe(
      "Traverse Bay RV Resort, 5555 M-72 East, Acme Township, MI 49690"
    );
  });

  it("keeps Michigan results only, no duplicates", () => {
    const f = (state: string, lon: number) => ({ geometry: { coordinates: [lon, 44.7] as [number, number] }, properties: { street: "Main St", city: "X", state } });
    const out = fromPhoton([f("Michigan", -85.6), f("Wisconsin", -87.9), f("Michigan", -85.6)]);
    expect(out).toEqual([{ display_name: "Main St, X, MI", lat: "44.7", lon: "-85.6" }]);
  });

  it("drops the house number for the street-only retry", () => {
    expect(withoutHouseNumber("6227 Arnold Rd Williamsburg")).toBe("Arnold Rd Williamsburg");
    expect(withoutHouseNumber("Arnold Rd")).toBe("");
  });

  it("adds Michigan unless it's already there", () => {
    expect(inMichigan("123 Front St")).toBe("123 Front St, Michigan");
    expect(inMichigan("123 Front St, Traverse City MI")).toBe("123 Front St, Traverse City MI");
  });
});
