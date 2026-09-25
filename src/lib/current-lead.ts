// Which lead is open on screen right now, so the voice assistant can act on
// "this one". A tiny module-level store (client only); the Leads page sets
// it when a card is opened and clears it when the card closes.

export interface CurrentLead {
  id: string;
  name: string;
}

let current: CurrentLead | null = null;
const listeners = new Set<() => void>();

export function setCurrentLead(lead: CurrentLead | null): void {
  if (current?.id === lead?.id && current?.name === lead?.name) return;
  current = lead;
  for (const fn of listeners) fn();
}

export function getCurrentLead(): CurrentLead | null {
  return current;
}

export function subscribeCurrentLead(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
