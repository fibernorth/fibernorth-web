"use client";

import { useState } from "react";
import { Lock, LockOpen } from "lucide-react";

export const UNLOCK_PHRASE = "NEW CARDS";
export const LOCKED_MESSAGE = `Card numbers are locked. Type ${UNLOCK_PHRASE} in the box above to change them.`;

/**
 * Card numbers are hard to change on purpose: a change means every printed
 * wristband and call sheet is wrong. Anything that would change a card ID is
 * refused until the coach types NEW CARDS here; it locks again after one
 * change or when leaving the tab.
 */
export function CardLock({
  unlocked,
  note,
  onUnlock,
  onLock,
}: {
  unlocked: boolean;
  note: string;
  onUnlock: () => void;
  onLock: () => void;
}) {
  const [text, setText] = useState("");
  if (unlocked) {
    return (
      <div className="rounded-lg border border-red-500/60 bg-red-600/15 p-3 text-sm flex items-center gap-3">
        <LockOpen className="h-5 w-5 text-red-300 shrink-0" />
        <span className="flex-1">Unlocked. Your next change makes new card numbers; reprint everything after.</span>
        <button onClick={onLock} className="rounded-md border border-white/20 px-3 py-2 font-semibold">
          Lock
        </button>
      </div>
    );
  }
  const ok = text.trim().toUpperCase() === UNLOCK_PHRASE;
  return (
    <div className="rounded-lg border border-white/15 bg-white/5 p-3 space-y-2 text-sm">
      <div className="flex items-center gap-2 font-semibold">
        <Lock className="h-4 w-4 text-amber-400" /> Card numbers are locked
      </div>
      <p className="text-white/60 text-xs">
        Changing card numbers, pitches, plays or off-plate spots makes new cards, so every wristband has to be reprinted.
        To make a change, type <b className="text-white">{UNLOCK_PHRASE}</b>.
      </p>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={UNLOCK_PHRASE}
          autoCapitalize="characters"
          className="flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-base text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button
          disabled={!ok}
          onClick={() => {
            setText("");
            onUnlock();
          }}
          className="rounded-lg bg-red-600 px-4 font-semibold disabled:opacity-30"
        >
          Unlock
        </button>
      </div>
      {note && <p className="text-red-300">{note}</p>}
    </div>
  );
}
