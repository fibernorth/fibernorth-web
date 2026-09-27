// Pitch Caller engine: wristband card generation, card ID, team code, number
// draws and count logic. No React, no storage, so it can be tested directly.
//
// Card: two simple grids, each 5 columns (1-5 across the top) by 10 rows (0-9
// down the side). The pitch grid holds pitch abbreviations, the location grid
// holds location codes. A number "31" is column 3, row 1 (column first). The
// first number called is always the pitch, the second always the spot, so
// the pitcher knows which grid to read.
// The card comes from a 4-digit seed and a seeded PRNG, so the same seed +
// settings gives the same card on any phone. Card ID = seed + "-" + a
// 3-letter check hashed from the finished grid.

export interface Pitch {
  abbr: string;
  name: string;
  weight: number;
}

export interface PitchSettings {
  seed: number;
  pitches: Pitch[];
  offPlate: boolean;
  cardW: number; // inches
  cardH: number; // inches
  shade: boolean;
}

export const DEFAULT_PITCHES: Pitch[] = [
  { abbr: "FB", name: "Fastball", weight: 50 },
  { abbr: "CH", name: "Changeup", weight: 10 },
  { abbr: "SC", name: "Screwball", weight: 10 },
  { abbr: "DR", name: "Drop", weight: 10 },
  { abbr: "RI", name: "Rise", weight: 10 },
  { abbr: "CV", name: "Curve", weight: 10 },
];

export const MAX_PITCHES = 10;
/** Column labels across the top of each grid. */
export const GRID_COLS = [1, 2, 3, 4, 5] as const;
/** Row labels down the side of each grid. */
export const ROWS = 10;
export const GRID_CELLS = GRID_COLS.length * ROWS; // 50

export function randomSeed(): number {
  return 1000 + Math.floor(Math.random() * 9000);
}

export function defaultSettings(seed = randomSeed()): PitchSettings {
  return {
    seed,
    pitches: DEFAULT_PITCHES.map((p) => ({ ...p })),
    offPlate: true,
    // Printable window of the team's wristbands.
    cardW: 3.375,
    cardH: 2.75,
    shade: true,
  };
}

// ---- Locations -------------------------------------------------------------

export const ZONES = ["HI", "HM", "HO", "MI", "MM", "MO", "LI", "LM", "LO"] as const;
export type Zone = (typeof ZONES)[number];

/** Location codes on the card: the 9 zones, plus "x" off-plate versions (not MM). */
export function locationCodes(offPlate: boolean): string[] {
  const out: string[] = [...ZONES];
  if (offPlate) for (const z of ZONES) if (z !== "MM") out.push(`${z}x`);
  return out;
}

export function isOffPlate(loc: string): boolean {
  return loc.endsWith("x");
}

const HEIGHT: Record<string, string> = { H: "high", M: "middle", L: "low" };
const SIDE: Record<string, string> = { I: "in", M: "middle", O: "out" };

/** "HI" -> "high in", "MM" -> "middle", "LOx" -> "low out, off the plate". */
export function locationName(loc: string): string {
  const z = loc.replace(/x$/, "");
  const base = z === "MM" ? "middle" : `${HEIGHT[z[0]] ?? z[0]} ${SIDE[z[1]] ?? z[1]}`;
  return isOffPlate(loc) ? `${base}, off the plate` : base;
}

// ---- PRNG and hashing ------------------------------------------------------

/** mulberry32: small, fast, and identical on every JS engine. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- Allocation ------------------------------------------------------------

/**
 * Split `total` cells across items by weight (largest remainder), every item
 * at least one. Default weights on 40 cells: FB 20, the other five 4 each.
 */
export function allocateByWeight(weights: number[], total: number): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (total < n) throw new Error("Not enough cells for every item");
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = w.reduce((a, b) => a + b, 0);
  const exact = sum > 0 ? w.map((x) => (x / sum) * total) : w.map(() => total / n);
  const out = exact.map((x) => Math.max(1, Math.floor(x)));
  // Hand out what's left by largest remainder (ties to the heavier weight).
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x), w: w[i] }))
    .sort((a, b) => b.frac - a.frac || b.w - a.w || a.i - b.i);
  let left = total - out.reduce((a, b) => a + b, 0);
  for (let k = 0; left > 0; k = (k + 1) % n, left--) out[order[k].i] += 1;
  // The minimum of one can overshoot: take back from the largest.
  while (left < 0) {
    const big = out.indexOf(Math.max(...out));
    out[big] -= 1;
    left += 1;
  }
  return out;
}

// ---- Card -------------------------------------------------------------------

export interface Card {
  /** pitchGrid[c][r]: pitch abbreviation at column GRID_COLS[c], row r. */
  pitchGrid: string[][];
  /** locGrid[c][r]: location code at column GRID_COLS[c], row r. */
  locGrid: string[][];
  id: string;
  /** Code numbers ("31") for each pitch abbreviation / location code. */
  pitchCodes: Record<string, string[]>;
  locationCodes: Record<string, string[]>;
}

export const CHECK_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O

export function cardCheck(pitchGrid: string[][], locGrid: string[][]): string {
  const flat = (g: string[][]) => g.map((col) => col.join(",")).join("|");
  let h = fnv1a(`P:${flat(pitchGrid)}#L:${flat(locGrid)}`);
  let out = "";
  for (let i = 0; i < 3; i++) {
    out += CHECK_ALPHABET[h % CHECK_ALPHABET.length];
    h = Math.floor(h / CHECK_ALPHABET.length);
  }
  return out;
}

/** "31" -> { c: 2 (index of column 3), r: 1 }, or null if it isn't a card number. */
export function parseCode(code: string): { c: number; r: number } | null {
  if (!/^[1-5][0-9]$/.test(code)) return null;
  return { c: Number(code[0]) - 1, r: Number(code[1]) };
}

/** What the card says at this number in the given grid. */
export function lookup(grid: string[][], code: string): string | null {
  const at = parseCode(code);
  return at ? grid[at.c]?.[at.r] ?? null : null;
}

export function fillGrid(pool: string[]): { grid: string[][]; codes: Record<string, string[]> } {
  const grid: string[][] = [];
  const codes: Record<string, string[]> = {};
  let i = 0;
  GRID_COLS.forEach((col) => {
    const column: string[] = [];
    for (let r = 0; r < ROWS; r++) {
      const v = pool[i++];
      column.push(v);
      (codes[v] ??= []).push(`${col}${r}`);
    }
    grid.push(column);
  });
  return { grid, codes };
}

export function buildCard(s: PitchSettings): Card {
  const pitches = s.pitches.length ? s.pitches : DEFAULT_PITCHES;
  const locs = locationCodes(s.offPlate);
  const rnd = mulberry32(s.seed);

  const pitchCounts = allocateByWeight(pitches.map((p) => p.weight), GRID_CELLS);
  const pitchPool: string[] = [];
  pitches.forEach((p, i) => {
    for (let k = 0; k < pitchCounts[i]; k++) pitchPool.push(p.abbr);
  });

  // Locations split evenly; the leftover cells go to a seeded pick of spots.
  const base = Math.floor(GRID_CELLS / locs.length);
  const extra = GRID_CELLS - base * locs.length;
  const lucky = new Set(shuffle(locs, rnd).slice(0, extra));
  const locPool: string[] = [];
  for (const l of locs) for (let k = 0; k < base + (lucky.has(l) ? 1 : 0); k++) locPool.push(l);

  const p = fillGrid(shuffle(pitchPool, rnd));
  const l = fillGrid(shuffle(locPool, rnd));
  const card: Card = {
    pitchGrid: p.grid,
    locGrid: l.grid,
    id: `${s.seed}-${cardCheck(p.grid, l.grid)}`,
    pitchCodes: p.codes,
    locationCodes: l.codes,
  };
  const problems = verifyCard(card, s);
  if (problems.length) throw new Error(`Card failed its check: ${problems[0]}`);
  return card;
}

/**
 * Proves the card is right: every cell filled, every number maps back to the
 * cell it names in its own grid, no number used twice, every pitch and every
 * spot on the card, and the ID matches the grids. Returns problems found.
 */
export function verifyCard(card: Card, s: PitchSettings): string[] {
  const problems: string[] = [];
  const pitches = (s.pitches.length ? s.pitches : DEFAULT_PITCHES).map((p) => p.abbr);
  const locs = locationCodes(s.offPlate);
  const check = (name: string, grid: string[][], codes: Record<string, string[]>, allowed: string[]) => {
    if (grid.length !== GRID_COLS.length || grid.some((c) => c.length !== ROWS)) problems.push(`${name} grid is not 5 x 10`);
    const seen = new Set<string>();
    let count = 0;
    for (const [value, list] of Object.entries(codes)) {
      if (!allowed.includes(value)) problems.push(`${name} grid has unknown value ${value}`);
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
  check("pitch", card.pitchGrid, card.pitchCodes, pitches);
  check("location", card.locGrid, card.locationCodes, locs);
  if (card.id !== `${s.seed}-${cardCheck(card.pitchGrid, card.locGrid)}`) problems.push("card ID doesn't match the grids");
  return problems;
}

// ---- Team code ---------------------------------------------------------------

const TEAM_PREFIX = "PC2.";
const OLD_PREFIX = "PC1.";

export function b64encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64decode(b64: string): string {
  const std = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std + "=".repeat((4 - (std.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeTeamCode(s: PitchSettings): string {
  const payload = {
    s: s.seed,
    p: s.pitches.map((p) => [p.abbr, p.name, p.weight]),
    o: s.offPlate ? 1 : 0,
    w: s.cardW,
    h: s.cardH,
    g: s.shade ? 1 : 0,
  };
  return TEAM_PREFIX + b64encode(JSON.stringify(payload));
}

export function decodeTeamCode(code: string): PitchSettings {
  const t = code.trim().replace(/\s+/g, "");
  const prefix = t.startsWith(TEAM_PREFIX) ? TEAM_PREFIX : t.startsWith(OLD_PREFIX) ? OLD_PREFIX : "";
  if (!prefix) throw new Error("That isn't a team code (it should start with PC2.)");
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(b64decode(t.slice(prefix.length)));
  } catch {
    throw new Error("That team code is damaged. Copy it again.");
  }
  const seed = Number(d.s);
  if (!Number.isInteger(seed) || seed < 1000 || seed > 9999) throw new Error("That team code has a bad card number.");
  const raw = Array.isArray(d.p) ? (d.p as unknown[]) : [];
  const pitches = raw
    .map((x) => (Array.isArray(x) ? x : []))
    .map(([a, n, w]) => ({ abbr: String(a ?? "").slice(0, 3).toUpperCase(), name: String(n ?? "").slice(0, 30), weight: Number(w) || 0 }))
    .filter((p) => p.abbr)
    .slice(0, MAX_PITCHES);
  if (!pitches.length) throw new Error("That team code has no pitches.");
  if (new Set(pitches.map((p) => p.abbr)).size !== pitches.length) throw new Error("That team code repeats a pitch.");
  return {
    seed,
    pitches,
    offPlate: d.o === 1,
    cardW: Number(d.w) > 0 ? Number(d.w) : 3.375,
    cardH: Number(d.h) > 0 ? Number(d.h) : 2.75,
    shade: d.g !== 0,
  };
}

// ---- Number draws ------------------------------------------------------------

/**
 * Draws codes for one item from a shuffled cycle: no repeats until every code
 * has been used, and never the same code twice in a row.
 */
export type Cycles = Record<string, { queue: string[]; last: string }>;

export function drawCode(cycles: Cycles, key: string, codes: string[], rnd: () => number = Math.random): string {
  if (!codes.length) return "";
  const c = (cycles[key] ??= { queue: [], last: "" });
  // Drop codes no longer on the card (settings changed).
  c.queue = c.queue.filter((x) => codes.includes(x));
  if (!c.queue.length) {
    c.queue = shuffle(codes, rnd);
    if (c.queue.length > 1 && c.queue[0] === c.last) c.queue.push(c.queue.shift()!);
  }
  const next = c.queue.shift()!;
  c.last = next;
  return next;
}

export interface Call {
  pitch: string;
  loc: string;
  pitchNum: string;
  locNum: string;
  /** Always [pitch number, location number]: pitch grid first, then spot. */
  spoken: [string, string];
}

/**
 * Draw the two numbers for a pitch and a spot. Each number is looked up on
 * the card again before it is returned; if either doesn't say exactly what
 * was asked for, no call is made (the app shows an error, never a wrong
 * number).
 */
export function makeCall(card: Card, pitch: string, loc: string, cycles: Cycles, rnd: () => number = Math.random): Call | null {
  const pc = card.pitchCodes[pitch];
  const lc = card.locationCodes[loc];
  if (!pc?.length || !lc?.length) return null;
  const pitchNum = drawCode(cycles, `p:${pitch}`, pc, rnd);
  const locNum = drawCode(cycles, `l:${loc}`, lc, rnd);
  if (lookup(card.pitchGrid, pitchNum) !== pitch || lookup(card.locGrid, locNum) !== loc) return null;
  return { pitch, loc, pitchNum, locNum, spoken: [pitchNum, locNum] };
}

// ---- Count -------------------------------------------------------------------

/** Results of a pitch that keep the at-bat going (or end it on the count). */
export const PITCH_RESULTS = ["ball", "called_k", "swing_miss", "foul"] as const;
/** Batter reached with a hit, recorded by how the ball was hit. */
export const HIT_RESULTS = ["hard_gb", "soft_gb", "line_drive", "fly_ball", "blooper", "bunt_hit"] as const;
/** Batter reached safely without a hit. */
export const SAFE_RESULTS = ["error", "fc", "hbp"] as const;
/** Batter out on the play. */
export const OUT_RESULTS = ["ground_out", "fly_out", "line_out", "pop_out", "foul_out", "bunt_out", "sac"] as const;
/** Older saved pitches used these (first version: out/hit; then bases). */
export const LEGACY_RESULTS = ["out", "hit", "single", "double", "triple", "hr"] as const;
const LEGACY_HITS: readonly string[] = ["hit", "single", "double", "triple", "hr"];

export const RESULTS = [...PITCH_RESULTS, ...HIT_RESULTS, ...SAFE_RESULTS, ...OUT_RESULTS] as const;
export type Result = (typeof RESULTS)[number] | (typeof LEGACY_RESULTS)[number];

export const RESULT_LABELS: Record<Result, string> = {
  ball: "Ball",
  called_k: "Called K",
  swing_miss: "Swing miss",
  foul: "Foul",
  hard_gb: "Hard grounder",
  soft_gb: "Soft grounder",
  line_drive: "Line drive",
  fly_ball: "Fly ball",
  blooper: "Blooper",
  bunt_hit: "Bunt",
  single: "Single",
  double: "Double",
  triple: "Triple",
  hr: "Home run",
  error: "Error",
  fc: "Fielder's choice",
  hbp: "Hit by pitch",
  ground_out: "Ground out",
  fly_out: "Fly out",
  line_out: "Line out",
  pop_out: "Pop out",
  foul_out: "Foul out",
  bunt_out: "Bunt out",
  sac: "Sacrifice",
  out: "In play out",
  hit: "In play hit",
};

/** Short labels for the history chips. */
export const RESULT_SHORT: Record<Result, string> = {
  ball: "B",
  called_k: "K look",
  swing_miss: "K swing",
  foul: "F",
  hard_gb: "Hard GB",
  soft_gb: "Soft GB",
  line_drive: "Liner",
  fly_ball: "Fly",
  blooper: "Blooper",
  bunt_hit: "Bunt",
  single: "1B",
  double: "2B",
  triple: "3B",
  hr: "HR",
  error: "E",
  fc: "FC",
  hbp: "HBP",
  ground_out: "GO",
  fly_out: "FO",
  line_out: "LO",
  pop_out: "PO",
  foul_out: "F out",
  bunt_out: "Bunt out",
  sac: "SAC",
  out: "Out",
  hit: "Hit",
};

export type AtBatEnd = "" | "walk" | "strikeout" | "hit" | "safe" | "hbp" | "out" | "sac";
export const AT_BAT_END_LABELS: Record<Exclude<AtBatEnd, "">, string> = {
  walk: "Walk",
  strikeout: "Strikeout",
  hit: "Hit",
  safe: "Safe",
  hbp: "Hit by pitch",
  out: "Out",
  sac: "Sacrifice",
};

export type ResultKind = "pitch" | "hit" | "safe" | "out";
export function resultKind(r: Result): ResultKind {
  if ((HIT_RESULTS as readonly string[]).includes(r) || LEGACY_HITS.includes(r)) return "hit";
  if ((SAFE_RESULTS as readonly string[]).includes(r)) return "safe";
  if ((OUT_RESULTS as readonly string[]).includes(r) || r === "out") return "out";
  return "pitch";
}

export interface Count {
  b: number;
  s: number;
}

export function applyResult(count: Count, r: Result): { count: Count; end: AtBatEnd } {
  let { b, s } = count;
  switch (r) {
    case "ball":
      b += 1;
      if (b >= 4) return { count: { b, s }, end: "walk" };
      return { count: { b, s }, end: "" };
    case "called_k":
    case "swing_miss":
      s += 1;
      if (s >= 3) return { count: { b, s }, end: "strikeout" };
      return { count: { b, s }, end: "" };
    case "foul":
      if (s < 2) s += 1;
      return { count: { b, s }, end: "" };
    case "hbp":
      return { count: { b, s }, end: "hbp" };
    case "error":
    case "fc":
      return { count: { b, s }, end: "safe" };
    case "sac":
      return { count: { b, s }, end: "sac" };
  }
  const kind = resultKind(r);
  if (kind === "hit") return { count: { b, s }, end: "hit" };
  if (kind === "out") return { count: { b, s }, end: "out" };
  return { count: { b, s }, end: "" };
}

// ---- Log ---------------------------------------------------------------------

export interface LoggedPitch {
  id: string;
  ts: string;
  date: string; // local YYYY-MM-DD
  opponent: string;
  batter: string;
  pitch: string;
  loc: string;
  nums: [string, string];
  result: Result;
  countAfter: string; // "B-S"
  end: AtBatEnd;
  /** Where the pitch actually went when she missed the spot (see missCode). */
  actual?: string;
  /** true = hit the spot, false = missed (set on every pitch logged since tracking). */
  hitSpot?: boolean;
}

export interface Game {
  key: string; // date|opponent (lowercase)
  opponent: string;
  date: string;
  pitches: LoggedPitch[];
  /** Runs: us = our team, them = the opponent. */
  us?: number;
  them?: number;
}

// ---- Missed spot ---------------------------------------------------------------
// Where a missed pitch went, on a 5 x 5 target: the middle 3 x 3 is the
// strike zone (same codes as the call pad), the ring around it is outside
// (up, down in the dirt, in, out). Rows 0-4 top to bottom, columns 0-4
// inside to outside.

export const MISS_ROWS = 5;
export const MISS_COLS = 5;

export function missCode(row: number, col: number): string {
  if (row >= 1 && row <= 3 && col >= 1 && col <= 3) return `${"HML"[row - 1]}${"IMO"[col - 1]}`;
  return `r${row}c${col}`;
}

export function isMissCode(code: string): boolean {
  return /^[HML][IMO]$/.test(code) || /^r[0-4]c[0-4]$/.test(code);
}

/** Short label for the target cell. */
export function missCellLabel(row: number, col: number): string {
  const c = missCode(row, col);
  if (!c.startsWith("r")) return c;
  const up = row === 0, down = row === 4, inside = col === 0, out = col === 4;
  if (up && inside) return "Up in";
  if (up && out) return "Up out";
  if (down && inside) return "Dirt in";
  if (down && out) return "Dirt out";
  if (up) return "Up";
  if (down) return "Dirt";
  return inside ? "In" : "Out";
}

/** Plain words: "HI" -> "high in", "r0c4" -> "up and out", "r4c2" -> "in the dirt". */
export function missName(code: string | undefined): string {
  if (!code) return "";
  if (/^[HML][IMO]$/.test(code)) return locationName(code);
  const m = /^r(\d)c(\d)$/.exec(code);
  if (!m) return code;
  const row = Number(m[1]), col = Number(m[2]);
  const v = row === 0 ? "up" : row === 4 ? "in the dirt" : "";
  const h = col === 0 ? "in" : col === 4 ? "out" : "";
  if (v && h) return row === 4 ? `in the dirt, ${h}` : `${v} and ${h}`;
  if (v) return v;
  const height = ["", "high", "middle", "low", ""][row];
  return `${height} ${h}, off the plate`.trim();
}

// ---- Card check ------------------------------------------------------------------

/** "4703 pkh", "4703-PKH", "4703PKH" -> "4703-PKH". */
export function normCardCode(text: string): string {
  const t = text.toUpperCase().replace(/[^0-9A-Z]/g, "");
  const m = /^(\d{4})([A-Z]{3})$/.exec(t);
  return m ? `${m[1]}-${m[2]}` : t;
}

export function gameKey(date: string, opponent: string): string {
  return `${date}|${normOpponent(opponent)}`;
}

export interface AtBatSummary {
  date: string;
  /** How it ended, e.g. "Double", "Walk", "Strikeout". */
  result: string;
  kind: "hit" | "safe" | "walk" | "strikeout" | "out";
  pitches: number;
  /** The pitch and spot that ended it. */
  last: string;
}

export interface BatterHistory {
  /** Plate appearances (every finished turn at bat). */
  pa: number;
  /** Official at-bats: not walks, hit by pitch or sacrifices. */
  ab: number;
  hits: number;
  walks: number;
  hbp: number;
  ks: number;
  /** Reached on an error or fielder's choice. */
  reached: number;
  pitches: number;
  recent: LoggedPitch[];
  /** Every pitch to this batter, newest first. */
  all: LoggedPitch[];
  /** Newest first. */
  atBats: AtBatSummary[];
}

/** "Bay  Blast " and "bay blast" are the same team. */
export function normOpponent(o: string): string {
  return o.trim().toLowerCase().replace(/\s+/g, " ");
}

/** "012" and "12" are the same batter. */
export function normBatter(b: string): string {
  const t = b.trim().replace(/^0+(?=\d)/, "");
  return t;
}

/** Everything saved for this batter number against this opponent, any date. */
export function batterHistory(games: Game[], opponent: string, batter: string, recent = 14): BatterHistory | null {
  const o = normOpponent(opponent);
  const b = normBatter(batter);
  if (!o || !b) return null;
  const list = games
    .filter((g) => normOpponent(g.opponent) === o)
    .flatMap((g) => g.pitches)
    .filter((p) => normBatter(p.batter) === b)
    .sort((x, y) => x.ts.localeCompare(y.ts));
  if (!list.length) return null;
  const ends = list.filter((p) => p.end);
  const count = (e: AtBatEnd) => ends.filter((p) => p.end === e).length;
  // Split into at-bats to report how each one ended.
  const summaries: AtBatSummary[] = [];
  let n = 0;
  for (const p of list) {
    n += 1;
    if (!p.end) continue;
    const kind: AtBatSummary["kind"] =
      p.end === "hit" ? "hit" : p.end === "walk" || p.end === "hbp" ? "walk" : p.end === "strikeout" ? "strikeout" : p.end === "safe" ? "safe" : "out";
    summaries.push({
      date: p.date,
      result: p.end === "walk" ? "Walk" : p.end === "strikeout" ? "Strikeout" : RESULT_LABELS[p.result],
      kind,
      pitches: n,
      last: `${p.pitch} ${p.loc}`,
    });
    n = 0;
  }
  return {
    pa: ends.length,
    ab: ends.filter((p) => !["walk", "hbp", "sac"].includes(p.end)).length,
    hits: count("hit"),
    walks: count("walk"),
    hbp: count("hbp"),
    ks: count("strikeout"),
    reached: count("safe"),
    pitches: list.length,
    recent: list.slice(-recent),
    all: [...list].reverse(),
    atBats: summaries.reverse(),
  };
}

function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function gamesCsv(games: Game[]): string {
  const rows = [
    ["date", "opponent", "batter", "pitch", "location", "result", "count_after", "at_bat_end", "missed_to", "score_us", "score_them"],
  ];
  for (const g of [...games].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const p of g.pitches) {
      rows.push([
        g.date,
        g.opponent,
        p.batter,
        p.pitch,
        p.loc,
        RESULT_LABELS[p.result],
        p.countAfter,
        p.end,
        p.actual ? missName(p.actual) : "",
        String(g.us ?? 0),
        String(g.them ?? 0),
      ]);
    }
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

/** Local calendar date (the phone's time zone). */
export function localDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---- What happened on each pitch, and what's working -----------------------------

/** One word for what a pitch did, from the pitcher's side. */
export type Outcome = "ball" | "looking" | "swinging" | "foul" | "hit" | "out" | "safe" | "hbp";

export function outcomeOf(r: Result): Outcome {
  if (r === "ball") return "ball";
  if (r === "called_k") return "looking";
  if (r === "swing_miss") return "swinging";
  if (r === "foul") return "foul";
  if (r === "hbp") return "hbp";
  const kind = resultKind(r);
  if (kind === "hit") return "hit";
  if (kind === "safe") return "safe";
  return "out";
}

export const OUTCOME_LABELS: Record<Outcome, string> = {
  ball: "Ball",
  looking: "Looking strike",
  swinging: "Swing and miss",
  foul: "Foul",
  hit: "Hit",
  out: "Out",
  safe: "Reached (E/FC)",
  hbp: "Hit by pitch",
};

/** Good for the pitcher: a strike of any kind or an out. */
export function isGoodOutcome(o: Outcome): boolean {
  return o === "looking" || o === "swinging" || o === "foul" || o === "out";
}

export interface CallLine {
  /** Pitch abbreviation. */
  pitch: string;
  /** Zone called (off-plate calls keep their x). "" for the per-pitch rows. */
  loc: string;
  thrown: number;
  /** Strike % the usual way: everything but balls and hit batters. */
  strikes: number;
  good: number;
  looking: number;
  swinging: number;
  foul: number;
  hits: number;
  outs: number;
  balls: number;
  /** Pitches where hit/missed spot was known, and how many hit the spot. */
  spotHit: number;
  spotKnown: number;
}

function emptyLine(pitch: string, loc: string): CallLine {
  return { pitch, loc, thrown: 0, strikes: 0, good: 0, looking: 0, swinging: 0, foul: 0, hits: 0, outs: 0, balls: 0, spotHit: 0, spotKnown: 0 };
}

function addTo(line: CallLine, p: LoggedPitch) {
  const o = outcomeOf(p.result);
  line.thrown++;
  if (o !== "ball" && o !== "hbp") line.strikes++;
  if (isGoodOutcome(o)) line.good++;
  if (o === "looking") line.looking++;
  if (o === "swinging") line.swinging++;
  if (o === "foul") line.foul++;
  if (o === "hit") line.hits++;
  if (o === "out") line.outs++;
  if (o === "ball") line.balls++;
  // Only pitches where we know: hitSpot recorded, or a miss location saved.
  if (p.hitSpot !== undefined || p.actual) {
    line.spotKnown++;
    if (p.hitSpot === true && !p.actual) line.spotHit++;
  }
}

/** Call quality score for ranking: good outcomes, with hits counting against. */
export function callScore(l: CallLine): number {
  if (!l.thrown) return 0;
  return (l.good - 2 * l.hits) / l.thrown;
}

export function callStats(pitches: LoggedPitch[]): { byPitch: CallLine[]; byCall: CallLine[]; total: CallLine } {
  const byPitch = new Map<string, CallLine>();
  const byCall = new Map<string, CallLine>();
  const total = emptyLine("", "");
  for (const p of pitches) {
    const a = byPitch.get(p.pitch) ?? emptyLine(p.pitch, "");
    addTo(a, p);
    byPitch.set(p.pitch, a);
    const key = `${p.pitch}|${p.loc}`;
    const b = byCall.get(key) ?? emptyLine(p.pitch, p.loc);
    addTo(b, p);
    byCall.set(key, b);
    addTo(total, p);
  }
  return {
    byPitch: [...byPitch.values()].sort((x, y) => y.thrown - x.thrown),
    byCall: [...byCall.values()],
    total,
  };
}

/**
 * The most successful pitch + spot calls in a set of pitches: at least
 * `minThrown` thrown and at least one good result, best call score first.
 */
export function bestCalls(pitches: LoggedPitch[], minThrown = 1, n = 3): CallLine[] {
  return callStats(pitches)
    .byCall.filter((l) => l.thrown >= minThrown && l.good > 0)
    .sort((a, b) => callScore(b) - callScore(a) || b.good - a.good || b.thrown - a.thrown)
    .slice(0, n);
}

/**
 * Print colours for pitch types on the card, in pitch-list order. Dark enough
 * to read on white and on the shaded rows; red is left out (it means off the
 * plate on the location grid).
 */
export const PITCH_PRINT_COLORS = [
  "#111111", // black
  "#1d4ed8", // blue
  "#15803d", // green
  "#7e22ce", // purple
  "#c2410c", // orange
  "#0f766e", // teal
  "#92400e", // brown
  "#be185d", // magenta
  "#1e3a8a", // navy
  "#4d7c0f", // olive
];

export function pitchColors(pitches: Pitch[]): Record<string, string> {
  return Object.fromEntries(pitches.map((p, i) => [p.abbr, PITCH_PRINT_COLORS[i % PITCH_PRINT_COLORS.length]]));
}

/** The same pitch colours, lightened to read on the app's dark screens. */
export const PITCH_SCREEN_COLORS = [
  "#ffffff", // black on paper -> white on screen
  "#60a5fa", // blue
  "#4ade80", // green
  "#c084fc", // purple
  "#fb923c", // orange
  "#2dd4bf", // teal
  "#d6a26a", // brown
  "#f472b6", // magenta
  "#93c5fd", // navy
  "#a3e635", // olive
];

export function pitchScreenColors(pitches: Pitch[]): Record<string, string> {
  return Object.fromEntries(pitches.map((p, i) => [p.abbr, PITCH_SCREEN_COLORS[i % PITCH_SCREEN_COLORS.length]]));
}
