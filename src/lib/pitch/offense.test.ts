// Proof the batter/runner signs are right every time, like the pitch card.
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultSettings, lookup, mulberry32, type Cycles } from "@/lib/pitch/engine";
import {
  DEFAULT_BATTER_PLAYS,
  DEFAULT_RUNNER_PLAYS,
  buildOffenseCard,
  decodeFullTeamCode,
  defaultOffense,
  encodeFullTeamCode,
  makeSignCall,
  playListProblem,
  verifyOffenseCard,
  type OffenseSettings,
} from "@/lib/pitch/offense";
import { CardSvg } from "@/components/pitch/card-svg";
import { signsGrids } from "@/components/pitch/signs";

const variants: Array<[string, (seed: number) => OffenseSettings]> = [
  ["default", (seed) => defaultOffense(seed)],
  ["one play each", (seed) => ({ seed, batter: [{ abbr: "HIT", name: "Hit", weight: 1 }], runner: [{ abbr: "NO", name: "No", weight: 1 }] })],
  [
    "twelve plays each, lopsided",
    (seed) => ({
      seed,
      batter: Array.from({ length: 12 }, (_, i) => ({ abbr: `B${i}`, name: `B ${i}`, weight: i === 0 ? 500 : i })),
      runner: Array.from({ length: 12 }, (_, i) => ({ abbr: `R${i}`, name: `R ${i}`, weight: i % 3 })),
    }),
  ],
];

describe("every signs card number builds a correct card", () => {
  for (const [name, make] of variants) {
    it(`${name}: seeds 1000-9999`, () => {
      const ids = new Set<string>();
      for (let seed = 1000; seed <= 9999; seed++) {
        const o = make(seed);
        const card = buildOffenseCard(o);
        expect(verifyOffenseCard(card, o)).toEqual([]);
        ids.add(card.id);
      }
      expect(ids.size).toBe(9000);
    });
  }
});

describe("every sign call matches the card", () => {
  it("every batter play x runner play, sampled seeds, batter number first", () => {
    const rnd = mulberry32(99);
    for (let seed = 1000; seed <= 9999; seed += 97) {
      const o = defaultOffense(seed);
      const card = buildOffenseCard(o);
      const cycles: Cycles = {};
      for (const b of o.batter)
        for (const r of o.runner)
          for (let i = 0; i < 3; i++) {
            const c = makeSignCall(card, b.abbr, r.abbr, cycles, rnd)!;
            expect(c).not.toBeNull();
            expect(c.spoken).toEqual([c.batterNum, c.runnerNum]);
            expect(lookup(card.batterGrid, c.spoken[0])).toBe(b.abbr);
            expect(lookup(card.runnerGrid, c.spoken[1])).toBe(r.abbr);
          }
    }
  });
  it("refuses plays not on the card", () => {
    const card = buildOffenseCard(defaultOffense(1234));
    expect(makeSignCall(card, "ZZZ", "NO", {})).toBeNull();
  });
});

describe("the printed batter/runner card matches the grids", () => {
  it("sampled seeds, cell by cell", () => {
    for (let seed = 1000; seed <= 9999; seed += 331) {
      const card = buildOffenseCard(defaultOffense(seed));
      const svg = renderToStaticMarkup(createElement(CardSvg, { grids: signsGrids(card), width: 3.375, height: 2.75, shade: true, printSize: true }));
      expect(svg).toContain(`SIGNS ${card.id}`);
      let n = 0;
      for (const part of svg.split('<g data-grid="').slice(1)) {
        const grid = part[0] === "B" ? card.batterGrid : card.runnerGrid;
        const re = /data-code="(\d\d)" data-value="([^"]+)"><text[^>]*>([^<]*)<\/text>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(part))) {
          expect(m[3]).toBe(m[2]);
          expect(lookup(grid, m[1])).toBe(m[2]);
          n++;
        }
      }
      expect(n).toBe(100);
    }
  });
});

describe("team code carries both cards", () => {
  it("round-trips pitch card and signs", () => {
    const s = defaultSettings(4321);
    const o = { ...defaultOffense(8765), runner: DEFAULT_RUNNER_PLAYS.slice(0, 4) };
    const back = decodeFullTeamCode(encodeFullTeamCode(s, o));
    expect(back.pitch.seed).toBe(4321);
    expect(buildOffenseCard(back.offense!)).toEqual(buildOffenseCard(o));
  });
  it("older PC2 codes load the pitch card only", async () => {
    const { encodeTeamCode } = await import("@/lib/pitch/engine");
    const back = decodeFullTeamCode(encodeTeamCode(defaultSettings(2222)));
    expect(back.pitch.seed).toBe(2222);
    expect(back.offense).toBeNull();
  });
  it("play list rules", () => {
    expect(playListProblem(DEFAULT_BATTER_PLAYS, "batter")).toBe("");
    expect(playListProblem([{ abbr: "A", name: "A", weight: 1 }, { abbr: "A", name: "B", weight: 1 }], "batter")).toMatch(/Two batter plays/);
  });
});
