// Every card the app makes is kept under its card number, so any phone or
// computer can open it with just that number (e.g. "5665-JJC"). Pure: the API
// route stores what this returns.
//
// The number is worked out here from the setup, never taken from the caller,
// so a stored card always matches its number and nobody can put a different
// card under a number that's already printed.

import { buildCard, decodeTeamCode, encodeTeamCode, normCardCode, type PitchSettings } from "@/lib/pitch/engine";
import { buildOffenseCard, cleanOffense, type OffenseSettings } from "@/lib/pitch/offense";

export type CardKind = "pitch" | "signs";

export const CARD_CODE = /^\d{4}-[A-Z]{3}$/;

export function cardDocId(kind: CardKind, id: string): string {
  return `${kind}_${id}`;
}

/** A clean setup and the card number it makes, or null if it isn't a working card. */
export function cardRecord(
  kind: CardKind,
  raw: unknown
): { id: string; settings: PitchSettings | OffenseSettings } | null {
  try {
    if (kind === "pitch") {
      // Round trip through the team code: the same checks a shared code gets.
      const settings = decodeTeamCode(encodeTeamCode(raw as PitchSettings));
      return { id: buildCard(settings).id, settings };
    }
    const settings = cleanOffense(raw, 0);
    if (!settings.seed) return null;
    return { id: buildOffenseCard(settings).id, settings };
  } catch {
    return null;
  }
}

/** "5665 jjc" -> "5665-JJC", or "" when it isn't a card number. */
export function cardCodeOrEmpty(text: string): string {
  const code = normCardCode(text || "");
  return CARD_CODE.test(code) ? code : "";
}
