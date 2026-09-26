import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sheetDisplayed, sheetSafe } from "./sheet-safe";

describe("sheetSafe", () => {
  it("neutralizes formula starters", () => {
    expect(sheetSafe("=HYPERLINK(\"http://x\",\"y\")")).toBe("'=HYPERLINK(\"http://x\",\"y\")");
    expect(sheetSafe("+1+cmd|' /C calc'!A0")).toBe("'+1+cmd|' /C calc'!A0");
    expect(sheetSafe("-2+3")).toBe("'-2+3");
    expect(sheetSafe("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
    expect(sheetSafe("\t=1")).toBe("'\t=1");
    expect(sheetSafe("\r=1")).toBe("'\r=1");
    expect(sheetSafe("'quoted")).toBe("''quoted");
  });

  it("leaves ordinary text and plain numbers alone", () => {
    expect(sheetSafe("Price too high")).toBe("Price too high");
    expect(sheetSafe("5/1 - Called, left VM")).toBe("5/1 - Called, left VM");
    expect(sheetSafe("Yes")).toBe("Yes");
    expect(sheetSafe("-250")).toBe("-250");
    expect(sheetSafe("1500.50")).toBe("1500.50");
    expect(sheetSafe("$1,500")).toBe("$1,500");
    expect(sheetSafe("")).toBe("");
    expect(sheetSafe(null)).toBe("");
    expect(sheetSafe(undefined)).toBe("");
    expect(sheetSafe(42)).toBe("42");
  });

  it("round-trips: the displayed cell equals the original value", () => {
    for (const v of ["=1+1", "+x", "-x", "@x", "'x", "plain", "-250", ""]) {
      expect(sheetDisplayed(sheetSafe(v))).toBe(v);
    }
  });

  it("matches the Apps Script mirror", () => {
    const gs = readFileSync(
      path.resolve(__dirname, "../../marketing/tools/leads-sheet-sync.gs"),
      "utf8"
    );
    const body = gs.match(/function sheetSafe_\(value\) \{[\s\S]*?\n\}/)?.[0];
    expect(body).toBeTruthy();
    // Evaluate the script's own function and compare on a spread of inputs.
    const gsSheetSafe = new Function(`${body}; return sheetSafe_;`)() as (v: unknown) => string;
    const inputs = ["=1", "+1", "-1", "-1a", "@a", "\ta", "\ra", "'a", "a", "-250", "1.5", "", null, 7];
    for (const v of inputs) expect(gsSheetSafe(v)).toBe(sheetSafe(v));
  });
});
