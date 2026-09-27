// Proof that the numbers are right, every time:
//  - every card number 1000-9999 (default setup and variations) builds a card
//    that passes verifyCard,
//  - thousands of calls per setup, every one looked up on the card, match
//    the pitch and spot asked for,
//  - the printed card (the SVG the phone draws and prints) shows exactly the
//    grid the numbers come from, with the right card ID,
//  - the team code rebuilds the identical card on another phone.
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_PITCHES,
  GRID_COLS,
  buildCard,
  decodeTeamCode,
  defaultSettings,
  encodeTeamCode,
  locationCodes,
  lookup,
  makeCall,
  mulberry32,
  verifyCard,
  type Cycles,
  type PitchSettings,
} from "@/lib/pitch/engine";
import { CardSvg } from "@/components/pitch/card-svg";

const variants: Array<[string, (seed: number) => PitchSettings]> = [
  ["default", (seed) => defaultSettings(seed)],
  ["no off-plate", (seed) => ({ ...defaultSettings(seed), offPlate: false })],
  ["one pitch", (seed) => ({ ...defaultSettings(seed), pitches: [{ abbr: "FB", name: "Fastball", weight: 1 }] })],
  [
    "ten pitches, lopsided weights",
    (seed) => ({
      ...defaultSettings(seed),
      pitches: Array.from({ length: 10 }, (_, i) => ({ abbr: `P${i}`, name: `Pitch ${i}`, weight: i === 0 ? 1000 : i })),
    }),
  ],
  ["zero weights", (seed) => ({ ...defaultSettings(seed), pitches: DEFAULT_PITCHES.map((p) => ({ ...p, weight: 0 })) })],
];

describe("every card number builds a correct card", () => {
  for (const [name, make] of variants) {
    it(`${name}: seeds 1000-9999`, () => {
      const ids = new Set<string>();
      for (let seed = 1000; seed <= 9999; seed++) {
        const s = make(seed);
        const card = buildCard(s); // throws if its own check fails
        expect(verifyCard(card, s)).toEqual([]);
        ids.add(card.id);
      }
      expect(ids.size).toBe(9000); // every card number gives its own card ID
    });
  }
});

describe("every call matches the card", () => {
  for (const [name, make] of variants) {
    it(`${name}: every pitch x every spot, many draws, sampled seeds`, () => {
      const rnd = mulberry32(12345);
      for (let seed = 1000; seed <= 9999; seed += 89) {
        const s = make(seed);
        const card = buildCard(s);
        const cycles: Cycles = {};
        for (const p of s.pitches) {
          for (const loc of locationCodes(s.offPlate)) {
            for (let i = 0; i < 4; i++) {
              const c = makeCall(card, p.abbr, loc, cycles, rnd);
              expect(c).not.toBeNull();
              expect(c!.spoken).toEqual([c!.pitchNum, c!.locNum]);
              expect(lookup(card.pitchGrid, c!.spoken[0])).toBe(p.abbr);
              expect(lookup(card.locGrid, c!.spoken[1])).toBe(loc);
            }
          }
        }
      }
    });
  }
});

/** Pull every cell (grid, code, value) out of the rendered card SVG. */
function printedCells(svg: string): Array<{ grid: string; code: string; value: string }> {
  const out: Array<{ grid: string; code: string; value: string }> = [];
  const parts = svg.split('<g data-grid="').slice(1);
  for (const part of parts) {
    const grid = part[0];
    const cellRe = /data-code="(\d\d)" data-value="([^"]+)"><text[^>]*>([^<]*)<\/text>/g;
    let m: RegExpExecArray | null;
    while ((m = cellRe.exec(part))) {
      expect(m[3]).toBe(m[2]); // the drawn text is the value
      out.push({ grid, code: m[1], value: m[3] });
    }
  }
  return out;
}

describe("the printed card shows exactly the grid the numbers come from", () => {
  it("sampled seeds, default and no off-plate", () => {
    for (let seed = 1000; seed <= 9999; seed += 211) {
      for (const s of [defaultSettings(seed), { ...defaultSettings(seed), offPlate: false }]) {
        const card = buildCard(s);
        const svg = renderToStaticMarkup(
          createElement(CardSvg, { card, width: s.cardW, height: s.cardH, shade: s.shade, printSize: true })
        );
        expect(svg).toContain(`CARD ${card.id}`);
        const cells = printedCells(svg);
        expect(cells).toHaveLength(100);
        for (const cell of cells) {
          const grid = cell.grid === "P" ? card.pitchGrid : card.locGrid;
          expect(lookup(grid, cell.code)).toBe(cell.value);
        }
        // Column headers 1-5 on both grids.
        for (const col of GRID_COLS) expect(svg).toContain(`>${col}</text>`);
      }
    }
  });
});

describe("another phone gets the identical card", () => {
  it("team code round-trip for sampled seeds", () => {
    for (let seed = 1000; seed <= 9999; seed += 97) {
      const s = { ...defaultSettings(seed), offPlate: seed % 2 === 0 };
      const other = buildCard(decodeTeamCode(encodeTeamCode(s)));
      const mine = buildCard(s);
      expect(other).toEqual(mine);
    }
  });
});
