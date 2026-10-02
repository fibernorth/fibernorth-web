import { describe, expect, it } from "vitest";
import { buildCard, defaultSettings } from "@/lib/pitch/engine";
import { buildOffenseCard, defaultOffense } from "@/lib/pitch/offense";
import { cardCodeOrEmpty, cardDocId, cardRecord } from "@/lib/pitch/card-registry";

describe("card registry", () => {
  it("keeps a pitch card under the number it really makes", () => {
    const s = defaultSettings(5665);
    const rec = cardRecord("pitch", s);
    expect(rec?.id).toBe(buildCard(s).id);
    // What's stored opens the same card again.
    expect(buildCard(rec!.settings as typeof s).id).toBe(rec!.id);
  });

  it("keeps a signs card the same way", () => {
    const o = defaultOffense(4321);
    const rec = cardRecord("signs", o);
    expect(rec?.id).toBe(buildOffenseCard(o).id);
  });

  it("works the number out itself, so a caller can't file a card under another number", () => {
    const s = { ...defaultSettings(5665), id: "1111-AAA" } as unknown;
    expect(cardRecord("pitch", s)?.id).toMatch(/^5665-[A-Z]{3}$/);
  });

  it("turns away junk", () => {
    expect(cardRecord("pitch", null)).toBeNull();
    expect(cardRecord("pitch", { seed: 5665, pitches: "x" })).toBeNull();
    expect(cardRecord("signs", { seed: 12 })).toBeNull();
  });

  it("reads typed numbers", () => {
    expect(cardCodeOrEmpty("5665 jjc")).toBe("5665-JJC");
    expect(cardCodeOrEmpty("5665-JJC")).toBe("5665-JJC");
    expect(cardCodeOrEmpty("hello")).toBe("");
    expect(cardDocId("signs", "5665-JJC")).toBe("signs_5665-JJC");
  });
});
