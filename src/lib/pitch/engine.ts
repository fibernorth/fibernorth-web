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
    cardW: 4,
    cardH: 2.25,
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

function shuffle<T>(arr: T[], rnd: () => number): T[] {
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

const CHECK_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O

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

function fillGrid(pool: string[]): { grid: string[][]; codes: Record<string, string[]> } {
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

function b64encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64decode(b64: string): string {
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
    cardW: Number(d.w) > 0 ? Number(d.w) : 4,
    cardH: Number(d.h) > 0 ? Number(d.h) : 2.25,
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

export const RESULTS = ["ball", "called_k", "swing_miss", "foul", "out", "hit"] as const;
export type Result = (typeof RESULTS)[number];
export const RESULT_LABELS: Record<Result, string> = {
  ball: "Ball",
  called_k: "Called K",
  swing_miss: "Swing miss",
  foul: "Foul",
  out: "In play out",
  hit: "In play hit",
};
export type AtBatEnd = "" | "walk" | "strikeout" | "hit" | "out";
export const AT_BAT_END_LABELS: Record<Exclude<AtBatEnd, "">, string> = {
  walk: "Walk",
  strikeout: "Strikeout",
  hit: "Hit",
  out: "Out",
};

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
      break;
    case "called_k":
    case "swing_miss":
      s += 1;
      if (s >= 3) return { count: { b, s }, end: "strikeout" };
      break;
    case "foul":
      if (s < 2) s += 1;
      break;
    case "out":
      return { count: { b, s }, end: "out" };
    case "hit":
      return { count: { b, s }, end: "hit" };
  }
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
}

export interface Game {
  key: string; // date|opponent (lowercase)
  opponent: string;
  date: string;
  pitches: LoggedPitch[];
}

export function gameKey(date: string, opponent: string): string {
  return `${date}|${opponent.trim().toLowerCase()}`;
}

export interface BatterHistory {
  atBats: number;
  hits: number;
  ks: number;
  pitches: number;
  recent: LoggedPitch[];
}

/** Everything saved for this batter number against this opponent, any date. */
export function batterHistory(games: Game[], opponent: string, batter: string, recent = 14): BatterHistory | null {
  const o = opponent.trim().toLowerCase();
  const b = batter.trim();
  if (!o || !b) return null;
  const list = games
    .filter((g) => g.opponent.trim().toLowerCase() === o)
    .flatMap((g) => g.pitches)
    .filter((p) => p.batter.trim() === b)
    .sort((x, y) => x.ts.localeCompare(y.ts));
  if (!list.length) return null;
  return {
    atBats: list.filter((p) => p.end).length,
    hits: list.filter((p) => p.end === "hit").length,
    ks: list.filter((p) => p.end === "strikeout").length,
    pitches: list.length,
    recent: list.slice(-recent),
  };
}

function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function gamesCsv(games: Game[]): string {
  const rows = [["date", "opponent", "batter", "pitch", "location", "result", "count_after", "at_bat_end"]];
  for (const g of [...games].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const p of g.pitches) {
      rows.push([g.date, g.opponent, p.batter, p.pitch, p.loc, RESULT_LABELS[p.result], p.countAfter, p.end]);
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
