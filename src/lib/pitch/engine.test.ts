import { describe, it, expect } from "vitest";
import {
  allocateByWeight,
  applyResult,
  batterHistory,
  buildCard,
  decodeTeamCode,
  defaultSettings,
  drawCode,
  encodeTeamCode,
  gamesCsv,
  locationCodes,
  locationName,
  makeCall,
  mulberry32,
  type Cycles,
  type Game,
} from "@/lib/pitch/engine";

describe("allocation", () => {
  it("default weights give FB 20 of 40 and the rest 4 each", () => {
    expect(allocateByWeight([50, 10, 10, 10, 10, 10], 40)).toEqual([20, 4, 4, 4, 4, 4]);
  });
  it("every item gets at least one cell and the total is exact", () => {
    const a = allocateByWeight([1000, 1, 1, 1, 1, 1, 1, 1, 1, 1], 30);
    expect(a.every((x) => x >= 1)).toBe(true);
    expect(a.reduce((x, y) => x + y, 0)).toBe(30);
  });
});

describe("card", () => {
  const s = defaultSettings(4703);
  const card = buildCard(s);

  it("has 10x10 cells: pitch columns first, locations after", () => {
    expect(card.grid).toHaveLength(10);
    card.grid.forEach((col, c) => {
      expect(col).toHaveLength(10);
      const pitchAbbrs = s.pitches.map((p) => p.abbr);
      col.forEach((v) => expect(c < 4 ? pitchAbbrs.includes(v) : locationCodes(true).includes(v)).toBe(true));
    });
  });

  it("uses every pitch and location, with codes as column then row", () => {
    expect(Object.keys(card.pitchCodes).sort()).toEqual(["CH", "CV", "DR", "FB", "RI", "SC"]);
    expect(card.pitchCodes.FB).toHaveLength(20);
    expect(Object.keys(card.locationCodes)).toHaveLength(17);
    const all = [...Object.values(card.pitchCodes), ...Object.values(card.locationCodes)].flat();
    expect(new Set(all).size).toBe(100);
    for (const code of card.pitchCodes.CH) expect(card.grid[Number(code[0])][Number(code[1])]).toBe("CH");
  });

  it("is the same on every phone for the same seed and settings", () => {
    expect(buildCard(defaultSettings(4703))).toEqual(card);
    expect(card.id).toMatch(/^4703-[A-Z]{3}$/);
  });

  it("changes ID when the seed or anything on the grid changes", () => {
    expect(buildCard(defaultSettings(4704)).id).not.toBe(card.id);
    expect(buildCard({ ...s, offPlate: false }).id).not.toBe(card.id);
    expect(buildCard({ ...s, pitchCols: 5 }).id).not.toBe(card.id);
    // Printing size doesn't change the codes.
    expect(buildCard({ ...s, cardW: 3.5, shade: false }).id).toBe(card.id);
  });

  it("without off-plate spots has 9 locations", () => {
    expect(Object.keys(buildCard({ ...s, offPlate: false }).locationCodes)).toHaveLength(9);
  });
});

describe("team code", () => {
  it("round-trips to the same card ID", () => {
    const s = { ...defaultSettings(2210), pitchCols: 5, offPlate: false };
    const code = encodeTeamCode(s);
    expect(code.startsWith("PC1.")).toBe(true);
    const back = decodeTeamCode(code);
    expect(buildCard(back).id).toBe(buildCard(s).id);
  });
  it("rejects junk", () => {
    expect(() => decodeTeamCode("hello")).toThrow();
    expect(() => decodeTeamCode("PC1.@@@")).toThrow();
  });
});

describe("draws", () => {
  it("cycles through every code before repeating, never twice in a row", () => {
    const cycles: Cycles = {};
    const codes = ["01", "02", "03", "04"];
    const rnd = mulberry32(7);
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) seen.push(drawCode(cycles, "p:CH", codes, rnd));
    for (let i = 0; i < 40; i += 4) expect(new Set(seen.slice(i, i + 4)).size).toBe(4);
    for (let i = 1; i < 40; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });
  it("makes a call from the card and can swap the spoken order", () => {
    const card = buildCard(defaultSettings(4703));
    const c = makeCall(card, "CH", "HI", {}, false)!;
    expect(card.pitchCodes.CH).toContain(c.pitchNum);
    expect(card.locationCodes.HI).toContain(c.locNum);
    expect(c.spoken).toEqual([c.pitchNum, c.locNum]);
    let swapped = false;
    for (let i = 0; i < 30; i++) {
      const m = makeCall(card, "FB", "LO", {}, true)!;
      if (m.spoken[0] === m.locNum) swapped = true;
    }
    expect(swapped).toBe(true);
  });
  it("names locations in plain words", () => {
    expect(locationName("HI")).toBe("high in");
    expect(locationName("MM")).toBe("middle");
    expect(locationName("LOx")).toBe("low out, off the plate");
  });
});

describe("count", () => {
  it("walks on ball four and strikes out on strike three", () => {
    expect(applyResult({ b: 3, s: 1 }, "ball")).toEqual({ count: { b: 4, s: 1 }, end: "walk" });
    expect(applyResult({ b: 0, s: 2 }, "swing_miss").end).toBe("strikeout");
    expect(applyResult({ b: 0, s: 2 }, "called_k").end).toBe("strikeout");
  });
  it("fouls only add a strike before two", () => {
    expect(applyResult({ b: 1, s: 1 }, "foul")).toEqual({ count: { b: 1, s: 2 }, end: "" });
    expect(applyResult({ b: 1, s: 2 }, "foul")).toEqual({ count: { b: 1, s: 2 }, end: "" });
  });
  it("balls in play end the at-bat", () => {
    expect(applyResult({ b: 0, s: 0 }, "hit").end).toBe("hit");
    expect(applyResult({ b: 2, s: 1 }, "out").end).toBe("out");
  });
});

describe("history and export", () => {
  const p = (batter: string, end: "" | "hit" | "strikeout" | "walk" | "out", ts: string) => ({
    id: ts, ts, date: "2026-09-27", opponent: "Bay Blast", batter, pitch: "FB", loc: "HI",
    nums: ["01", "45"] as [string, string], result: "ball" as const, countAfter: "1-0", end,
  });
  const games: Game[] = [
    { key: "2026-09-27|bay blast", opponent: "Bay Blast", date: "2026-09-27", pitches: [p("12", "", "a"), p("12", "hit", "b"), p("12", "strikeout", "c"), p("7", "walk", "d")] },
  ];
  it("summarizes a batter against an opponent", () => {
    expect(batterHistory(games, "bay blast", "12")).toMatchObject({ atBats: 2, hits: 1, ks: 1, pitches: 3 });
    expect(batterHistory(games, "Other", "12")).toBeNull();
  });
  it("exports CSV with the header the coach expects", () => {
    const csv = gamesCsv(games);
    expect(csv.split("\n")[0]).toBe("date,opponent,batter,pitch,location,result,count_after,at_bat_end");
    expect(csv.split("\n")).toHaveLength(6);
  });
});
