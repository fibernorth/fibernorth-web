// Pitch Caller engine: wristband card generation, card ID, team code, number
// draws and count logic. No React, no storage, so it can be tested directly.
//
// Card: 10 rows x 10 columns. Columns 0..pitchCols-1 hold pitch codes, the
// rest hold location codes. A number "31" is column 3, row 1 (column first).
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
  mixOrder: boolean;
  pitchCols: number; // 3..6
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
export const ROWS = 10;
export const COLS = 10;

export function randomSeed(): number {
  return 1000 + Math.floor(Math.random() * 9000);
}

export function defaultSettings(seed = randomSeed()): PitchSettings {
  return {
    seed,
    pitches: DEFAULT_PITCHES.map((p) => ({ ...p })),
    offPlate: true,
    mixOrder: true,
    pitchCols: 4,
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
  /** grid[col][row]: pitch abbreviation or location code. */
  grid: string[][];
  pitchCols: number;
  id: string;
  /** Code numbers ("31") per pitch abbreviation / per location code. */
  pitchCodes: Record<string, string[]>;
  locationCodes: Record<string, string[]>;
}

const CHECK_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O

export function cardCheck(grid: string[][]): string {
  let h = fnv1a(grid.map((col) => col.join(",")).join("|"));
  let out = "";
  for (let i = 0; i < 3; i++) {
    out += CHECK_ALPHABET[h % CHECK_ALPHABET.length];
    h = Math.floor(h / CHECK_ALPHABET.length);
  }
  return out;
}

export function clampPitchCols(n: number): number {
  return Math.min(6, Math.max(3, Math.round(Number(n) || 4)));
}

export function buildCard(s: PitchSettings): Card {
  const pitchCols = clampPitchCols(s.pitchCols);
  const pitches = s.pitches.length ? s.pitches : DEFAULT_PITCHES;
  const locs = locationCodes(s.offPlate);
  const rnd = mulberry32(s.seed);

  const pitchCells = pitchCols * ROWS;
  const locCells = (COLS - pitchCols) * ROWS;

  const pitchCounts = allocateByWeight(pitches.map((p) => p.weight), pitchCells);
  const pitchPool: string[] = [];
  pitches.forEach((p, i) => {
    for (let k = 0; k < pitchCounts[i]; k++) pitchPool.push(p.abbr);
  });

  // Locations split evenly; the leftover cells go to a seeded pick of spots.
  const base = Math.floor(locCells / locs.length);
  const extra = locCells - base * locs.length;
  const lucky = new Set(shuffle(locs, rnd).slice(0, extra));
  const locPool: string[] = [];
  for (const l of locs) for (let k = 0; k < base + (lucky.has(l) ? 1 : 0); k++) locPool.push(l);

  const pitchOrder = shuffle(pitchPool, rnd);
  const locOrder = shuffle(locPool, rnd);

  const grid: string[][] = [];
  const pitchCodes: Record<string, string[]> = {};
  const locMap: Record<string, string[]> = {};
  let pi = 0;
  let li = 0;
  for (let c = 0; c < COLS; c++) {
    const col: string[] = [];
    for (let r = 0; r < ROWS; r++) {
      const code = `${c}${r}`;
      if (c < pitchCols) {
        const v = pitchOrder[pi++];
        col.push(v);
        (pitchCodes[v] ??= []).push(code);
      } else {
        const v = locOrder[li++];
        col.push(v);
        (locMap[v] ??= []).push(code);
      }
    }
    grid.push(col);
  }
  return { grid, pitchCols, id: `${s.seed}-${cardCheck(grid)}`, pitchCodes, locationCodes: locMap };
}

// ---- Team code ---------------------------------------------------------------

const TEAM_PREFIX = "PC1.";

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
    m: s.mixOrder ? 1 : 0,
    c: clampPitchCols(s.pitchCols),
    w: s.cardW,
    h: s.cardH,
    g: s.shade ? 1 : 0,
  };
  return TEAM_PREFIX + b64encode(JSON.stringify(payload));
}

export function decodeTeamCode(code: string): PitchSettings {
  const t = code.trim().replace(/\s+/g, "");
  if (!t.startsWith(TEAM_PREFIX)) throw new Error("That isn't a team code (it should start with PC1.)");
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(b64decode(t.slice(TEAM_PREFIX.length)));
  } catch {
    throw new Error("That team code is damaged. Copy it again.");
  }
  const seed = Number(d.s);
  if (!Number.isInteger(seed) || seed < 0 || seed > 99999) throw new Error("That team code has a bad card number.");
  const raw = Array.isArray(d.p) ? (d.p as unknown[]) : [];
  const pitches = raw
    .map((x) => (Array.isArray(x) ? x : []))
    .map(([a, n, w]) => ({ abbr: String(a ?? "").slice(0, 3).toUpperCase(), name: String(n ?? "").slice(0, 30), weight: Number(w) || 0 }))
    .filter((p) => p.abbr)
    .slice(0, MAX_PITCHES);
  if (!pitches.length) throw new Error("That team code has no pitches.");
  return {
    seed,
    pitches,
    offPlate: d.o === 1,
    mixOrder: d.m === 1,
    pitchCols: clampPitchCols(Number(d.c)),
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
  /** The two numbers in the order to say them. */
  spoken: [string, string];
}

export function makeCall(
  card: Card,
  pitch: string,
  loc: string,
  cycles: Cycles,
  mixOrder: boolean,
  rnd: () => number = Math.random
): Call | null {
  const pc = card.pitchCodes[pitch];
  const lc = card.locationCodes[loc];
  if (!pc?.length || !lc?.length) return null;
  const pitchNum = drawCode(cycles, `p:${pitch}`, pc, rnd);
  const locNum = drawCode(cycles, `l:${loc}`, lc, rnd);
  const swap = mixOrder && rnd() < 0.5;
  return { pitch, loc, pitchNum, locNum, spoken: swap ? [locNum, pitchNum] : [pitchNum, locNum] };
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
