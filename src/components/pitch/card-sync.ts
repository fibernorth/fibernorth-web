// Keeps this phone's cards on the server under their numbers, and opens any
// team card by number (or from the team list) on any signed-in phone or
// computer. Works around no signal: a card
// that couldn't be sent is tried again the next time the app opens.

import type { PitchSettings } from "@/lib/pitch/engine";
import type { OffenseSettings } from "@/lib/pitch/offense";
import type { CardKind } from "@/lib/pitch/card-registry";
import { getFirebaseAuth } from "@/lib/firebase";
import { loadCardHistory, loadSignsHistory } from "@/components/pitch/store";

/** The signed-in coach's token for the card API ("" when signed out). */
async function authHeader(): Promise<Record<string, string>> {
  try {
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

const KEPT = "pc.cardsKept"; // "pitch_5665-JJC" for each card the server has

function keptSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEPT) || "[]") as string[]);
  } catch {
    return new Set();
  }
}
function markKept(key: string) {
  try {
    const s = keptSet();
    s.add(key);
    localStorage.setItem(KEPT, JSON.stringify([...s].slice(-500)));
  } catch {
    // storage blocked: it just gets sent again next time
  }
}

/** Send one card to the server (once per card per phone). */
export async function keepCard(kind: CardKind, id: string, settings: PitchSettings | OffenseSettings): Promise<void> {
  const key = `${kind}_${id}`;
  if (keptSet().has(key)) return;
  try {
    const res = await fetch("/api/pitch-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ kind, settings }),
    });
    if (res.ok) markKept(key);
  } catch {
    // no signal: tried again next time the app opens
  }
}

/** Every card this phone has used, so old printed cards open anywhere too. */
export async function keepAllKnown(): Promise<void> {
  for (const h of loadCardHistory()) await keepCard("pitch", h.id, h.settings);
  for (const h of loadSignsHistory()) await keepCard("signs", h.id, h.settings);
}

export interface OpenedCard {
  pitch: PitchSettings | null;
  signs: OffenseSettings | null;
}

/** Look a card number up on the server. Throws a plain message on failure. */
export async function openCard(id: string): Promise<OpenedCard> {
  let res: Response;
  try {
    res = await fetch(`/api/pitch-cards?id=${encodeURIComponent(id)}`, { cache: "no-store", headers: await authHeader() });
  } catch {
    throw new Error("No signal. Try again when you have a connection.");
  }
  const json = (await res.json().catch(() => ({}))) as Partial<OpenedCard> & { error?: string };
  if (res.status === 401 || res.status === 403) throw new Error("Sign in again to open team cards.");
  if (!res.ok) throw new Error(json.error || "Couldn't look that card up.");
  return { pitch: json.pitch ?? null, signs: json.signs ?? null };
}

export interface TeamCard {
  kind: CardKind;
  id: string;
  createdAt: string;
}

/** Every card the team has made, newest first. Empty with no signal. */
export async function listTeamCards(): Promise<TeamCard[]> {
  try {
    const res = await fetch("/api/pitch-cards", { cache: "no-store", headers: await authHeader() });
    if (!res.ok) return [];
    const json = (await res.json()) as { cards?: TeamCard[] };
    return Array.isArray(json.cards) ? json.cards : [];
  } catch {
    return [];
  }
}
