// Offensive signs: the same idea as the pitch card, for batters and runners.
//
// Card: two grids, each 1-5 across the top and 0-9 down the side. The left
// grid is the batter's play, the right grid is the runner's play. The base
// coach calls two numbers: batter number first, runner number second. Each
// play gets cells by weight, every play at least one. Built from its own
// 4-digit card number with the seeded PRNG, verified when built, and every
// call is looked up on the card again before it is shown.

import {
  CHECK_ALPHABET,
  GRID_CELLS,
  GRID_COLS,
  ROWS,
  allocateByWeight,
  b64decode,
  b64encode,
  decodeTeamCode,
  drawCode,
  encodeTeamCode,
  fillGrid,
  fnv1a,
  lookup,
  mulberry32,
  randomSeed,
  shuffle,
  type Cycles,
  type PitchSettings,
} from "@/lib/pitch/engine";

export interface Play {
  abbr: string;
  name: string;
  weight: number;
}

export interface OffenseSettings {
  seed: number;
  batter: Play[];
  runner: Play[];
}

export const MAX_PLAYS = 12;

export const DEFAULT_BATTER_PLAYS: Play[] = [
  { abbr: "HIT", name: "Hit away", weight: 40 },
  { abbr: "TKE", name: "Take", weight: 15 },
  { abbr: "BNT", name: "Sac bunt", weight: 10 },
  { abbr: "SLP", name: "Slap", weight: 8 },
  { abbr: "SLS", name: "Slash", weight: 7 },
  { abbr: "SQZ", name: "Squeeze", weight: 5 },
  { abbr: "DRG", name: "Drag bunt", weight: 5 },
  { abbr: "FKB", name: "Fake bunt", weight: 5 },
];

export const DEFAULT_RUNNER_PLAYS: Play[] = [
  { abbr: "NO", name: "Nothing on", weight: 30 },
  { abbr: "STL", name: "Steal", weight: 15 },
  { abbr: "DLS", name: "Delayed steal", weight: 10 },
  { abbr: "GOC", name: "Go on contact", weight: 10 },
  { abbr: "HNR", name: "Hit & run", weight: 10 },
  { abbr: "RD", name: "Read", weight: 10 },
  { abbr: "TAG", name: "Tag up", weight: 5 },
  { abbr: "FKS", name: "Fake steal", weight: 5 },
  { abbr: "SQZ", name: "Squeeze", weight: 5 },
];

export function defaultOffense(seed = randomSeed()): OffenseSettings {
  return {
    seed,
    batter: DEFAULT_BATTER_PLAYS.map((p) => ({ ...p })),
    runner: DEFAULT_RUNNER_PLAYS.map((p) => ({ ...p })),
  };
}

export interface OffenseCard {
  /** batterGrid[c][r]: batter play at column GRID_COLS[c], row r. */
  batterGrid: string[][];
  runnerGrid: string[][];
  id: string;
  batterCodes: Record<string, string[]>;
  runnerCodes: Record<string, string[]>;
}

export function offenseCheck(batterGrid: string[][], runnerGrid: string[][]): string {
  const flat = (g: string[][]) => g.map((col) => col.join(",")).join("|");
  let h = fnv1a(`OFFENSE#B:${flat(batterGrid)}#R:${flat(runnerGrid)}`);
  let out = "";
  for (let i = 0; i < 3; i++) {
    out += CHECK_ALPHABET[h % CHECK_ALPHABET.length];
    h = Math.floor(h / CHECK_ALPHABET.length);
  }
  return out;
}

/** Problem with a play list, or "" if it's fine. */
export function playListProblem(plays: Play[], who: string): string {
  if (!plays.length) return `Add at least one ${who} play.`;
  if (plays.length > MAX_PLAYS) return `At most ${MAX_PLAYS} ${who} plays.`;
  if (plays.some((p) => !p.abbr)) return `Every ${who} play needs an abbreviation.`;
  if (plays.some((p) => !p.name.trim())) return `Every ${who} play needs a name.`;
  const abbrs = plays.map((p) => p.abbr);
  const dup = abbrs.find((a, i) => abbrs.indexOf(a) !== i);
  if (dup) return `Two ${who} plays use ${dup}. Give each its own abbreviation.`;
  if (plays.every((p) => !p.weight)) return `At least one ${who} play needs a weight above 0.`;
  return "";
}

function pool(plays: Play[]): string[] {
  const counts = allocateByWeight(plays.map((p) => p.weight), GRID_CELLS);
  const out: string[] = [];
  plays.forEach((p, i) => {
    for (let k = 0; k < counts[i]; k++) out.push(p.abbr);
  });
  return out;
}

export function buildOffenseCard(o: OffenseSettings): OffenseCard {
  const problem = playListProblem(o.batter, "batter") || playListProblem(o.runner, "runner");
  if (problem) throw new Error(problem);
  // Different stream from the pitch card, so the two never share a layout.
  const rnd = mulberry32((o.seed * 7919 + 104729) >>> 0);
  const b = fillGrid(shuffle(pool(o.batter), rnd));
  const r = fillGrid(shuffle(pool(o.runner), rnd));
  const card: OffenseCard = {
    batterGrid: b.grid,
    runnerGrid: r.grid,
    id: `${o.seed}-${offenseCheck(b.grid, r.grid)}`,
    batterCodes: b.codes,
    runnerCodes: r.codes,
  };
  const problems = verifyOffenseCard(card, o);
  if (problems.length) throw new Error(`Signs card failed its check: ${problems[0]}`);
  return card;
}

export function verifyOffenseCard(card: OffenseCard, o: OffenseSettings): string[] {
  const problems: string[] = [];
  const check = (name: string, grid: string[][], codes: Record<string, string[]>, allowed: string[]) => {
    if (grid.length !== GRID_COLS.length || grid.some((c) => c.length !== ROWS)) problems.push(`${name} grid is not 5 x 10`);
    const seen = new Set<string>();
    let count = 0;
    for (const [value, list] of Object.entries(codes)) {
      if (!allowed.includes(value)) problems.push(`${name} grid has unknown play ${value}`);
      for (const code of list) {
        count++;
        if (seen.has(code)) problems.push(`${name} number ${code} used twice`);
        seen.add(code);
        if (lookup(grid, code) !== value) problems.push(`${name} number ${code} says ${lookup(grid, code)}, expected ${value}`);
      }
    }
    if (count !== GRID_CELLS) problems.push(`${name} grid has ${count} numbers, expected ${GRID_CELLS}`);
    for (const a of allowed) if (!codes[a]?.length) problems.push(`${a} is missing from the ${name} grid`);
    grid.forEach((col) => col.forEach((v) => !allowed.includes(v) && problems.push(`${name} grid cell holds ${v}`)));
  };
  check("batter", card.batterGrid, card.batterCodes, o.batter.map((p) => p.abbr));
  check("runner", card.runnerGrid, card.runnerCodes, o.runner.map((p) => p.abbr));
  if (card.id !== `${o.seed}-${offenseCheck(card.batterGrid, card.runnerGrid)}`) problems.push("signs card ID doesn't match the grids");
  return problems;
}

export interface SignCall {
  batter: string;
  runner: string;
  batterNum: string;
  runnerNum: string;
  /** Always [batter number, runner number]. */
  spoken: [string, string];
}

/** Draw the two numbers; each is looked up on the card again. Null if anything is off. */
export function makeSignCall(
  card: OffenseCard,
  batter: string,
  runner: string,
  cycles: Cycles,
  rnd: () => number = Math.random
): SignCall | null {
  const bc = card.batterCodes[batter];
  const rc = card.runnerCodes[runner];
  if (!bc?.length || !rc?.length) return null;
  const batterNum = drawCode(cycles, `b:${batter}`, bc, rnd);
  const runnerNum = drawCode(cycles, `r:${runner}`, rc, rnd);
  if (lookup(card.batterGrid, batterNum) !== batter || lookup(card.runnerGrid, runnerNum) !== runner) return null;
  return { batter, runner, batterNum, runnerNum, spoken: [batterNum, runnerNum] };
}

export function cleanOffense(raw: unknown, fallbackSeed: number): OffenseSettings {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const plays = (v: unknown, def: Play[]): Play[] => {
    const arr = Array.isArray(v) ? v : [];
    const out = arr
      .map((x) => (Array.isArray(x) ? { abbr: x[0], name: x[1], weight: x[2] } : (x as Record<string, unknown>)))
      .map((x) => ({
        abbr: String(x?.abbr ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3),
        name: String(x?.name ?? "").slice(0, 30),
        weight: Number(x?.weight) || 0,
      }))
      .filter((p) => p.abbr)
      .slice(0, MAX_PLAYS);
    return out.length ? out : def.map((p) => ({ ...p }));
  };
  const seed = Number(d.seed ?? d.s);
  return {
    seed: Number.isInteger(seed) && seed >= 1000 && seed <= 9999 ? seed : fallbackSeed,
    batter: plays(d.batter ?? d.b, DEFAULT_BATTER_PLAYS),
    runner: plays(d.runner ?? d.r, DEFAULT_RUNNER_PLAYS),
  };
}

// ---- Team code (pitch card + signs card) --------------------------------------

const FULL_PREFIX = "PC3.";

/** One code for both cards, so every coach's phone matches. */
export function encodeFullTeamCode(s: PitchSettings, o: OffenseSettings): string {
  const pitchPayload = JSON.parse(b64decode(encodeTeamCode(s).slice(4)));
  const x = { s: o.seed, b: o.batter.map((p) => [p.abbr, p.name, p.weight]), r: o.runner.map((p) => [p.abbr, p.name, p.weight]) };
  return FULL_PREFIX + b64encode(JSON.stringify({ ...pitchPayload, x }));
}

/** Pitch settings, plus the signs card when the code carries one (PC3). */
export function decodeFullTeamCode(code: string): { pitch: PitchSettings; offense: OffenseSettings | null } {
  const t = code.trim().replace(/\s+/g, "");
  if (!t.startsWith(FULL_PREFIX)) return { pitch: decodeTeamCode(t), offense: null };
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(b64decode(t.slice(FULL_PREFIX.length)));
  } catch {
    throw new Error("That team code is damaged. Copy it again.");
  }
  const { x, ...pitchPayload } = d;
  const pitch = decodeTeamCode("PC2." + b64encode(JSON.stringify(pitchPayload)));
  const offense = cleanOffense(x, pitch.seed);
  const problem = playListProblem(offense.batter, "batter") || playListProblem(offense.runner, "runner");
  if (problem) throw new Error(`That team code's signs card is bad: ${problem}`);
  return { pitch, offense };
}
