import { describe, it, expect } from "vitest";
import { looksRandom, spamReason } from "./spam-check";

describe("form spam filter", () => {
  it("blocks the junk Bill got", () => {
    expect(
      spamReason({
        name: "TyjRXqYynSMWumOffVeMgkvV",
        address: "irkYcElnRNABjITDRIUJIL",
        email: "ihoxi.j.u.t.o0941@gmail.com",
        description: "Business Name: vaACiTFhYqGdVLGys\nCurrent Provider & Monthly Bill: RXzfzBXsCjYVjdxUt",
      })
    ).toBe("random letters");
  });

  it("lets real people through", () => {
    const real = [
      { name: "Stephen Fortin", address: "4860 US-31, Traverse City", email: "fcw_bucky@msn.com" },
      { name: "Popp Excavating", address: "12 Elm St", email: "office@poppexcavating.com" },
      { name: "McKenzie Vanderwaal", address: "Williamsburg", email: "mck.vander@gmail.com" },
      { name: "Bill", address: "", email: "" },
    ];
    for (const r of real) expect(spamReason(r)).toBe("");
    expect(looksRandom("Christensen")).toBe(false);
    expect(looksRandom("McDonaldson")).toBe(false);
  });

  it("the hidden field and a too-fast send", () => {
    expect(spamReason({ name: "Al", address: "", email: "", hp: "http://x.ru" })).toBe("hidden field filled");
    expect(spamReason({ name: "Al", address: "", email: "", elapsedMs: 900 })).toBe("sent too fast");
    expect(spamReason({ name: "Al", address: "", email: "", elapsedMs: 40000 })).toBe("");
  });
});
