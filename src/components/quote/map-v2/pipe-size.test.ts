import { describe, it, expect } from "vitest";
import { isLargePipe, isOtherPipe } from "./helpers";

describe("pipe sizes", () => {
  it("flags pipe over 3 inches", () => {
    for (const v of ['4"', '5"', '6"', '4"+', 'Other: 8"', "Other: 10 in"]) expect(isLargePipe(v)).toBe(true);
    for (const v of ['3/4"', '1"', '1-1/4"', '2"', '3"', "not-sure", "other", "Other: 2 1/2 in", "Other: two conduits", undefined])
      expect(isLargePipe(v)).toBe(false);
  });
  it("knows an Other choice, typed or not", () => {
    expect(isOtherPipe("other")).toBe(true);
    expect(isOtherPipe("Other: 8\"")).toBe(true);
    expect(isOtherPipe('2"')).toBe(false);
  });
});
