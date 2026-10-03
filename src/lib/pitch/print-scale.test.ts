import { describe, expect, it } from "vitest";
import { clampScale, inchesLabel, scaleFromMeasure } from "@/lib/pitch/print-scale";

describe("printer scale", () => {
  it("keeps a scale in range and treats junk as 100", () => {
    expect(clampScale(100)).toBe(100);
    expect(clampScale(112.54)).toBe(112.5);
    expect(clampScale(10)).toBe(50);
    expect(clampScale(900)).toBe(200);
    expect(clampScale("abc")).toBe(100);
    expect(clampScale(0)).toBe(100);
    expect(clampScale(-5)).toBe(100);
    expect(clampScale(undefined)).toBe(100);
  });

  it("works out the scale from what the test box measured", () => {
    // Should be 3.375 in wide, measured 3 in at 100%: print 112.5% bigger.
    expect(scaleFromMeasure(3.375, 3, 100)).toBe(112.5);
    // Measured bigger than it should be: print smaller.
    expect(scaleFromMeasure(3.375, 3.75, 100)).toBe(90);
  });

  it("corrects the print that was measured, not the card, so repeating converges", () => {
    // First print at 100% measured 3 in; set 112.5. That print measures 3.375, so no change.
    const first = scaleFromMeasure(3.375, 3, 100);
    expect(scaleFromMeasure(3.375, 3.375, first)).toBe(first);
    // Measured 3.4 at 112.5%: nudge down a little.
    expect(scaleFromMeasure(3.375, 3.4, 112.5)).toBe(111.7);
  });

  it("leaves the scale alone when the measurement is unusable", () => {
    expect(scaleFromMeasure(3.375, 0, 110)).toBe(110);
    expect(scaleFromMeasure(3.375, NaN, 110)).toBe(110);
    expect(scaleFromMeasure(0, 3, 110)).toBe(110);
    expect(scaleFromMeasure(3.375, -2, 110)).toBe(110);
  });

  it("never goes outside the allowed range", () => {
    expect(scaleFromMeasure(3.375, 0.5, 100)).toBe(200);
    expect(scaleFromMeasure(0.5, 3.375, 100)).toBe(50);
  });

  it("says inches the way a ruler reads", () => {
    expect(inchesLabel(3.375)).toBe("3 3/8");
    expect(inchesLabel(2.5)).toBe("2 1/2");
    expect(inchesLabel(3)).toBe("3");
    expect(inchesLabel(3.25)).toBe("3 1/4");
    expect(inchesLabel(0.5)).toBe("1/2");
    expect(inchesLabel(-1)).toBe("");
  });
});
