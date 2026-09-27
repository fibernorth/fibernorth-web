"use client";

import { defaultSettings, type Cycles, type Game, type PitchSettings } from "@/lib/pitch/engine";

// Everything lives in this phone's localStorage so the app works with no
// signal. Nothing here is sensitive. Every read/write is guarded: storage can
// be blocked (private mode) and the app must still run.

const K = {
  settings: "pc.settings",
  games: "pc.games",
  opponent: "pc.opponent",
  cycles: "pc.cycles",
  printedId: "pc.printedId",
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
  if (saved && Array.isArray(saved.pitches) && saved.pitches.length) return { ...defaultSettings(saved.seed), ...saved };
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
