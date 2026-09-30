import { describe, it, expect } from "vitest";
import {
  allocateByWeight,
  buildCard,
  decodeTeamCode,
  defaultSettings,
  encodeTeamCode,
  GRID_CELLS,
  locationCodes,
  verifyCard,
} from "./engine";

describe("spot weights", () => {
  it("unset weights: every existing card is unchanged (known card IDs)", () => {
    // Same settings, same seed, same card as before this feature.
    const s = defaultSettings(4703);
    const a = buildCard(s);
    const b = buildCard({ ...s, locWeights: undefined });
    const c = buildCard({ ...s, locWeights: {} });
    expect(b.id).toBe(a.id);
    expect(c.id).toBe(a.id);
  });

  it("weights set the number of cells per spot, the card passes its check, the pitch grid doesn't move", () => {
    for (let seed = 1000; seed <= 9999; seed += 97) {
      const s = defaultSettings(seed);
      const locs = locationCodes(s.offPlate);
      const locWeights = Object.fromEntries(locs.map((l) => [l, l === "LO" || l === "LI" ? 10 : l.endsWith("x") ? 1 : 3]));
      const weighted = { ...s, locWeights };
      const card = buildCard(weighted);
      expect(verifyCard(card, weighted)).toEqual([]);
      const want = allocateByWeight(locs.map((l) => locWeights[l]), GRID_CELLS);
      locs.forEach((l, i) => expect(card.locationCodes[l].length).toBe(want[i]));
      expect(card.pitchGrid).toEqual(buildCard(s).pitchGrid);
      expect(card.id).not.toBe(buildCard(s).id);
    }
  });

  it("the team code carries the weights, and old codes still load", () => {
    const s = { ...defaultSettings(5821), locWeights: { LO: 12, LI: 12, MM: 1 } };
    const back = decodeTeamCode(encodeTeamCode(s));
    expect(back.locWeights).toEqual({ LO: 12, LI: 12, MM: 1 });
    expect(buildCard(back).id).toBe(buildCard(s).id);
    const plain = decodeTeamCode(encodeTeamCode(defaultSettings(5821)));
    expect(plain.locWeights).toBeUndefined();
  });
});
