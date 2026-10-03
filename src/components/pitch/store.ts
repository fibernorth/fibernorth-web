"use client";

import { defaultSettings, type Cycles, type Game, type PitchSettings } from "@/lib/pitch/engine";
import { cleanOffense, defaultOffense, type OffenseSettings } from "@/lib/pitch/offense";
import { clampScale } from "@/lib/pitch/print-scale";

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
  cardHistory: "pc.cardHistory",
  signsHistory: "pc.signsHistory",
  printScale: "pc.printScale",
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
    // Earlier defaults (4 x 2.25, then 3.375 x 2.75 in) move to the
    // wristbands' printable window: 3.375 x 2.5 in.
    if ((merged.cardW === 4 && merged.cardH === 2.25) || (merged.cardW === 3.375 && merged.cardH === 2.75)) {
      merged.cardW = 3.375;
      merged.cardH = 2.5;
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

/** How much to correct what this device prints, in percent. Not part of any card. */
export const loadPrintScale = (): number => clampScale(read<number>(K.printScale, 100));
export const savePrintScale = (n: number) => write(K.printScale, clampScale(n));

export const loadPrintedSignsId = (): string => read<string>(K.printedSignsId, "");
export const savePrintedSignsId = (id: string) => write(K.printedSignsId, id);

// ---- Recent cards (quick switch) ----------------------------------------------

/** A card this phone has used, with the settings that make it. */
export interface CardHistoryEntry<T> {
  id: string;
  settings: T;
  usedAt: string;
}

const HISTORY_MAX = 12;

function remember<T>(key: string, id: string, settings: T): CardHistoryEntry<T>[] {
  const list = read<CardHistoryEntry<T>[]>(key, []).filter((e) => e && e.id && e.id !== id);
  const next = [{ id, settings, usedAt: new Date().toISOString() }, ...list].slice(0, HISTORY_MAX);
  write(key, next);
  return next;
}

export const loadCardHistory = (): CardHistoryEntry<PitchSettings>[] => read(K.cardHistory, []);
export const rememberCard = (id: string, s: PitchSettings) => remember(K.cardHistory, id, s);
export const loadSignsHistory = (): CardHistoryEntry<OffenseSettings>[] => read(K.signsHistory, []);
export const rememberSigns = (id: string, o: OffenseSettings) => remember(K.signsHistory, id, o);
