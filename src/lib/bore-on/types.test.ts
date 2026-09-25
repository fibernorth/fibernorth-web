import { describe, it, expect } from "vitest";
import { externalRefFor, quoteIdFromExternalRef } from "./types";

describe("externalRef", () => {
  it("round-trips a quote id and refuses anything else", () => {
    expect(quoteIdFromExternalRef(externalRefFor("aB3xK9"))).toBe("aB3xK9");
    expect(quoteIdFromExternalRef("acme:job:1")).toBeNull();
    expect(quoteIdFromExternalRef("fibernorth:quote:")).toBeNull();
    expect(quoteIdFromExternalRef("fibernorth:quote:../x")).toBeNull();
    expect(quoteIdFromExternalRef(undefined)).toBeNull();
  });
});
