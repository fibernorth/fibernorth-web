"use client";

import { useState } from "react";
import { Lock, LockOpen } from "lucide-react";

export const UNLOCK_PHRASE = "NEW CARDS";

export type LockedCard = "pitch" | "signs";

const CARD_NAMES: Record<LockedCard, string> = {
  pitch: "Pitch card (defense)",
  signs: "Signs card (offense)",
};

/** The message a refused save shows next to its own button. */
export function lockedMessage(which: LockedCard): string {
  return `NOT SAVED: the ${CARD_NAMES[which].toLowerCase()} is locked. Type ${UNLOCK_PHRASE} in its lock box at the top, tap Unlock, then save again.`;
}

export const isRefusal = (msg: string) => msg.startsWith("NOT SAVED") || msg.startsWith("Not saved");

/**
 * Card numbers are hard to change on purpose: a change means every printed
 * card of that kind is wrong. The pitch card (defense) and the signs card
 * (offense) each have their own lock. A lock stays open once the coach types
 * NEW CARDS, until they tap Lock or reopen the app, so several edits can be
 * saved in a row.
 */
export function CardLock({
  which,
  unlocked,
  onUnlock,
  onLock,
}: {
  which: LockedCard;
  unlocked: boolean;
  onUnlock: () => void;
  onLock: () => void;
}) {
  const [text, setText] = useState("");
  const name = CARD_NAMES[which];
  const reprint = which === "pitch" ? "the pitch wristbands" : "the batter/runner cards, coach wristband and call sheet";
  if (unlocked) {
    return (
      <div className="rounded-lg border border-red-500/60 bg-red-600/15 p-3 text-sm flex items-center gap-3">
        <LockOpen className="h-5 w-5 text-red-300 shrink-0" />
        <span className="flex-1">
          <b>{name} unlocked.</b> Saves go through. Reprint {reprint} after. The other card isn&apos;t touched.
        </span>
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
        <Lock className="h-4 w-4 text-amber-400" /> {name} is locked
      </div>
      <p className="text-white/60 text-xs">
        Saving changes here makes new numbers, so {reprint} have to be reprinted. To change it, type{" "}
        <b className="text-white">{UNLOCK_PHRASE}</b>. It only unlocks this card.
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
    </div>
  );
}

/** A save result: red for anything not saved, green for saved. */
export function SaveMsg({ msg }: { msg: string }) {
  if (!msg) return null;
  const bad = !/^(Saved|Loaded)|code copied/.test(msg);
  return (
    <p className={bad ? "rounded-md bg-red-600/20 border border-red-500/60 px-2 py-1.5 text-sm font-semibold text-red-200" : "text-sm text-emerald-300"}>
      {msg}
    </p>
  );
}
