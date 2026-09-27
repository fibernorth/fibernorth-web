"use client";

import { defaultSettings, type Cycles, type Game, type PitchSettings } from "@/lib/pitch/engine";
import { cleanOffense, defaultOffense, type OffenseSettings } from "@/lib/pitch/offense";

// Everything lives in this phone's localStorage so the app works with no
// signal. Nothing here is sensitive. Every read/write is guarded: storage can
// be blocked (private mode) and the app must still run.

const K = {
  settings: "pc.settings",
  games: "pc.games",
  opponent: "pc.opponent",
  cycles: "pc.cycles",
  printedId: "pc.printedId",
  offense: "pc.offense",
  signCycles: "pc.signCycles",
  printedSignsId: "pc.printedSignsId",
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: keep going in memory.
  }
}

export function loadSettings(): PitchSettings {
  const saved = read<PitchSettings | null>(K.settings, null);
  if (saved && Array.isArray(saved.pitches) && saved.pitches.length) {
    const merged = { ...defaultSettings(saved.seed), ...saved };
    // The first version defaulted to 4 x 2.25 in; the wristbands' printable
    // window is 3.375 x 2.75 in.
    if (merged.cardW === 4 && merged.cardH === 2.25) {
      merged.cardW = 3.375;
      merged.cardH = 2.75;
      write(K.settings, merged);
    }
    return merged;
  }
  const fresh = defaultSettings();
  write(K.settings, fresh);
  return fresh;
}
export const saveSettings = (s: PitchSettings) => write(K.settings, s);

export const loadGames = (): Game[] => read<Game[]>(K.games, []);
export const saveGames = (g: Game[]) => write(K.games, g);

export const loadOpponent = (): string => read<string>(K.opponent, "");
export const saveOpponent = (o: string) => write(K.opponent, o);

export const loadCycles = (): Cycles => read<Cycles>(K.cycles, {});
export const saveCycles = (c: Cycles) => write(K.cycles, c);

export const loadPrintedId = (): string => read<string>(K.printedId, "");
export const savePrintedId = (id: string) => write(K.printedId, id);

export function loadOffense(): OffenseSettings {
  const saved = read<unknown>(K.offense, null);
  if (saved) return cleanOffense(saved, defaultOffense().seed);
  const fresh = defaultOffense();
  write(K.offense, fresh);
  return fresh;
}
export const saveOffense = (o: OffenseSettings) => write(K.offense, o);

export const loadSignCycles = (): Cycles => read<Cycles>(K.signCycles, {});
export const saveSignCycles = (c: Cycles) => write(K.signCycles, c);

export const loadPrintedSignsId = (): string => read<string>(K.printedSignsId, "");
export const savePrintedSignsId = (id: string) => write(K.printedSignsId, id);
