"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { pitchColors, pitchScreenColors, randomSeed } from "@/lib/pitch/engine";
import {
  MAX_PLAYS,
  buildOffenseCard,
  decodeSignsCode,
  encodeSignsCode,
  makeSignCall,
  playListProblem,
  verifyOffenseCard,
  type OffenseCard,
  type OffenseSettings,
  type Play,
  type SignCall,
} from "@/lib/pitch/offense";
import { CardSvg, type CardGrids } from "@/components/pitch/card-svg";
import { SaveMsg } from "@/components/pitch/save-msg";
import { loadSignCycles, saveSignCycles } from "@/components/pitch/store";

const small = "rounded-md border border-white/15 bg-white/5 active:bg-white/15";
const btn = "rounded-lg border border-white/15 bg-white/5 active:bg-white/15 transition-colors";
const input =
  "w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-base text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-amber-400";

export function signsGrids(card: OffenseCard): CardGrids {
  return {
    left: card.batterGrid,
    right: card.runnerGrid,
    leftKey: "B",
    rightKey: "R",
    label: `SIGNS ${card.id}`,
    id: card.id,
  };
}

// ---- Print coordination -------------------------------------------------------

export type PrintMode = "pitch" | "signs-cards" | "signs-sheet" | "signs-coach";

/** Ask the page to print one of the printouts. */
export function requestPrint(mode: PrintMode, copies = 1, onDone?: () => void) {
  window.dispatchEvent(new CustomEvent("pc-print", { detail: { mode, copies } }));
  setTimeout(() => {
    window.print();
    onDone?.();
  }, 80);
}

/** Which printout is on the page (only one renders at a time). */
export function usePrintRequest(): { mode: PrintMode; copies: number } {
  const [req, setReq] = useState<{ mode: PrintMode; copies: number }>({ mode: "pitch", copies: 12 });
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ mode: PrintMode; copies: number }>).detail;
      setReq({ mode: d.mode, copies: Math.max(1, Math.min(60, Number(d.copies) || 1)) });
    };
    window.addEventListener("pc-print", on);
    return () => window.removeEventListener("pc-print", on);
  }, []);
  return req;
}

// ---- Calling signs --------------------------------------------------------------

export function SignsScreen({ offense, card }: { offense: OffenseSettings; card: OffenseCard }) {
  const [batter, setBatter] = useState("");
  const [runner, setRunner] = useState("");
  const [call, setCall] = useState<SignCall | null>(null);
  const [error, setError] = useState("");
  const cycles = useRef(loadSignCycles());

  const generate = (b: string, r: string) => {
    if (!b || !r) return;
    // The card is re-checked, and each number is looked up on the card again
    // inside makeSignCall. Anything off: no numbers.
    const ok = verifyOffenseCard(card, offense).length === 0;
    const c = ok ? makeSignCall(card, b, r, cycles.current) : null;
    saveSignCycles(cycles.current);
    setCall(c);
    setError(c ? "" : "Couldn't make a checked call. Pick again, or reload the app.");
  };
  const name = (list: Play[], abbr: string) => list.find((p) => p.abbr === abbr)?.name || abbr;

  const buttons = (list: Play[], sel: string, pick: (a: string) => void) => (
    <div className="grid grid-cols-3 gap-1.5 flex-1 min-h-0 auto-rows-fr">
      {list.map((p) => (
        <button
          key={p.abbr}
          onClick={() => pick(p.abbr)}
          className={cn(
            small,
            "min-h-0 px-1 text-sm font-bold leading-tight",
            sel === p.abbr && "bg-amber-400 text-black border-amber-400 active:bg-amber-300"
          )}
        >
          {p.name}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-2 h-[calc(100dvh-7.25rem-env(safe-area-inset-bottom))] min-h-[30rem]">
      <div className="shrink-0 rounded-xl border border-white/15 bg-black/50 h-[7rem] flex flex-col items-center justify-center">
        {call ? (
          <>
            <div className="flex gap-8 font-mono font-black leading-none tracking-wider text-[clamp(3rem,17vw,4.75rem)]">
              <div className="text-center">
                {call.batterNum}
                <div className="font-sans text-[10px] font-semibold tracking-normal text-white/50">BATTER</div>
              </div>
              <div className="text-center text-amber-400">
                {call.runnerNum}
                <div className="font-sans text-[10px] font-semibold tracking-normal text-amber-400/60">RUNNER</div>
              </div>
            </div>
            <div className="text-sm text-white/80">
              {name(offense.batter, call.batter)} · {name(offense.runner, call.runner)}
            </div>
          </>
        ) : error ? (
          <div className="text-center text-red-300 font-semibold px-4 text-sm">{error}</div>
        ) : (
          <div className="text-white/50">Tap a batter play and a runner play</div>
        )}
      </div>

      <div className="text-[10px] text-white/50 leading-none shrink-0">BATTER</div>
      {buttons(offense.batter, batter, (a) => {
        setBatter(a);
        generate(a, runner);
      })}
      <div className="text-[10px] text-white/50 leading-none shrink-0">RUNNER</div>
      {buttons(offense.runner, runner, (a) => {
        setRunner(a);
        generate(batter, a);
      })}
      <div className="grid grid-cols-2 gap-1.5 shrink-0">
        <button
          onClick={() => {
            setBatter("");
            setRunner("");
            setCall(null);
            setError("");
          }}
          className={cn(small, "h-11 text-sm font-semibold")}
        >
          Clear
        </button>
        <button onClick={() => generate(batter, runner)} disabled={!batter || !runner} className={cn(small, "h-11 text-sm font-semibold disabled:opacity-40")}>
          New numbers
        </button>
      </div>
    </div>
  );
}

// ---- Signs card (Card tab) -----------------------------------------------------

export function SignsCardPanel({
  offense,
  card,
  cardW,
  cardH,
  shade,
  setOffense,
  onPrinted,
}: {
  offense: OffenseSettings;
  card: OffenseCard;
  cardW: number;
  cardH: number;
  shade: boolean;
  setOffense: (o: OffenseSettings) => string;
  onPrinted: () => void;
}) {
  const [copies, setCopies] = useState(12);
  const [confirmNew, setConfirmNew] = useState(false);
  const [seedText, setSeedText] = useState(String(offense.seed));
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState("");
  const [seedMsg, setSeedMsg] = useState("");
  const signsCode = encodeSignsCode(offense);
  useEffect(() => setSeedText(String(offense.seed)), [offense.seed]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-2">
        <div style={{ aspectRatio: `${cardW} / ${cardH}` }}>
          <CardSvg
            grids={signsGrids(card)}
            leftColors={pitchColors(offense.batter)}
            rightColors={pitchColors(offense.runner)}
            width={cardW}
            height={cardH}
            shade={shade}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {(
          [
            ["Cells per batter play", offense.batter, card.batterCodes],
            ["Cells per runner play", offense.runner, card.runnerCodes],
          ] as const
        ).map(([title, list, codes]) => (
          <div key={title} className="rounded-lg border border-white/10 p-3">
            <div className="text-xs text-white/60 mb-1">{title}</div>
            {list.map((p) => (
              <div key={p.abbr} className="flex justify-between gap-2">
                <span className="truncate font-semibold" style={{ color: pitchScreenColors(list)[p.abbr] }}>
                  {p.name}
                </span>
                <span className="font-mono">{codes[p.abbr]?.length ?? 0}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="flex gap-2 items-end">
        <label className="text-xs text-white/60 w-24">
          Copies
          <input
            className={input}
            inputMode="numeric"
            value={copies}
            onChange={(e) => setCopies(Math.max(1, Math.min(60, Number(e.target.value.replace(/\D/g, "")) || 1)))}
          />
        </label>
        <button onClick={() => requestPrint("signs-cards", copies, onPrinted)} className="flex-1 rounded-lg bg-amber-400 text-black font-bold py-3">
          Print batter/runner cards
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => requestPrint("signs-coach", 2)} className={cn(btn, "py-3 font-semibold leading-tight")}>
          Print base coach wristband
        </button>
        <button onClick={() => requestPrint("signs-sheet", 1)} className={cn(btn, "py-3 font-semibold leading-tight")}>
          Print dugout call sheet
        </button>
      </div>
      <p className="text-xs text-white/50">
        On the bases there&apos;s no phone: the coach wristband lists numbers for each play. Use a different one each time.
      </p>
      <p className="text-xs text-white/50">Print at 100% (actual size), not &quot;fit to page&quot;.</p>

      <div className="rounded-lg border border-white/10 p-3 space-y-2">
        <label className="text-xs text-white/60 block">
          Signs card number
          <div className="flex gap-2">
            <input className={input} inputMode="numeric" value={seedText} onChange={(e) => setSeedText(e.target.value.replace(/\D/g, "").slice(0, 4))} />
            <button
              className={cn(btn, "px-4 text-sm font-semibold")}
              onClick={() => {
                const n = Number(seedText);
                if (n >= 1000 && n <= 9999) {
                  const err = setOffense({ ...offense, seed: n });
                  if (err) setSeedText(String(offense.seed));
                  setSeedMsg(err || (n === offense.seed ? "" : "Saved. Reprint the batter/runner cards."));
                } else {
                  setSeedText(String(offense.seed));
                  setSeedMsg("Signs card numbers are 1000 to 9999.");
                }
              }}
            >
              Use
            </button>
          </div>
        </label>
        <button
          onClick={() => {
            if (!confirmNew) return setConfirmNew(true);
            setSeedMsg(setOffense({ ...offense, seed: randomSeed() }) || "Saved. Reprint the batter/runner cards.");
            setConfirmNew(false);
          }}
          className={cn(btn, "w-full py-3 font-semibold", confirmNew && "bg-red-600 border-red-500")}
        >
          {confirmNew ? "Tap again: new signs means reprinting every batter card" : "Make new signs"}
        </button>
        <SaveMsg msg={seedMsg} />
      </div>

      <div className="rounded-lg border border-white/10 p-3 space-y-2">
        <div className="font-semibold">Match another phone (signs only)</div>
        <p className="text-xs text-white/60">
          Signs code: load it on the base coaches&apos; phones. Both will show signs {card.id}. It doesn&apos;t change the pitch
          card.
        </p>
        <textarea readOnly value={signsCode} className={cn(input, "font-mono text-xs h-16")} onFocus={(e) => e.currentTarget.select()} />
        <button
          className={cn(btn, "w-full py-2 font-semibold")}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(signsCode);
              setMsg("Signs code copied.");
            } catch {
              setMsg("Couldn't copy. Press and hold the code to copy it.");
            }
          }}
        >
          Copy signs code
        </button>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste a signs code (SG1.…)" className={cn(input, "font-mono text-xs h-16")} />
        <button
          className={cn(btn, "w-full py-2 font-semibold")}
          onClick={() => {
            try {
              const o = decodeSignsCode(paste);
              const err = setOffense(o);
              if (err) throw new Error(err);
              setPaste("");
              setMsg(`Loaded. This phone now shows signs ${buildOffenseCard(o).id}. Pitch card unchanged.`);
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Couldn't load that code.");
            }
          }}
        >
          Load signs code
        </button>
        <SaveMsg msg={msg} />
      </div>
    </div>
  );
}

// ---- Play lists (Setup tab) -------------------------------------------------------

export function PlayListEditor({
  title,
  who,
  plays,
  onSave,
  onDirty,
}: {
  title: string;
  who: string;
  plays: Play[];
  onSave: (plays: Play[]) => string;
  onDirty?: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(plays.map((p) => ({ ...p })));
  const [msg, setMsg] = useState("");
  useEffect(() => setDraft(plays.map((p) => ({ ...p }))), [plays]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(plays);
  useEffect(() => onDirty?.(dirty), [dirty, onDirty]);
  const problem = playListProblem(draft, who);
  const set = (i: number, patch: Partial<Play>) => setDraft((d) => d.map((p, k) => (k === i ? { ...p, ...patch } : p)));

  return (
    <div className="rounded-lg border border-white/10 p-3 space-y-2">
      <div className="font-semibold">{title}</div>
      <div className="grid grid-cols-[4rem_1fr_4.5rem_2.5rem] gap-2 text-xs text-white/60">
        <span>Abbr</span>
        <span>Name</span>
        <span>Weight</span>
        <span />
      </div>
      {draft.map((p, i) => (
        <div key={i} className="grid grid-cols-[4rem_1fr_4.5rem_2.5rem] gap-2">
          <input
            className={input}
            value={p.abbr}
            maxLength={3}
            onChange={(e) => set(i, { abbr: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) })}
          />
          <input className={input} value={p.name} maxLength={30} onChange={(e) => set(i, { name: e.target.value })} />
          <input
            className={input}
            inputMode="numeric"
            value={p.weight}
            onChange={(e) => set(i, { weight: Number(e.target.value.replace(/\D/g, "")) || 0 })}
          />
          <button
            aria-label={`Remove ${p.name}`}
            disabled={draft.length <= 1}
            onClick={() => setDraft((d) => d.filter((_, k) => k !== i))}
            className={cn(btn, "text-lg disabled:opacity-30")}
          >
            ×
          </button>
        </div>
      ))}
      <button
        disabled={draft.length >= MAX_PLAYS}
        onClick={() => setDraft((d) => [...d, { abbr: "", name: "", weight: 10 }])}
        className={cn(btn, "w-full py-2 font-semibold disabled:opacity-30")}
      >
        Add play
      </button>
      {problem && <p className="text-sm text-red-300">{problem}</p>}
      {dirty && <p className="text-sm font-semibold text-red-300">Not saved yet. Tap Save.</p>}
      {dirty && (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setDraft(plays.map((p) => ({ ...p })))} className={cn(btn, "py-3 font-semibold")}>
            Undo changes
          </button>
          <button
            disabled={!!problem}
            onClick={() => setMsg(onSave(draft) || "Saved. Reprint the batter/runner cards.")}
            className="rounded-lg bg-amber-400 text-black font-bold py-3 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      )}
      <SaveMsg msg={msg} />
    </div>
  );
}

// ---- Printouts --------------------------------------------------------------------

export function SignsPrint({
  offense,
  card,
  cardW,
  cardH,
  shade,
  mode,
  copies,
}: {
  offense: OffenseSettings;
  card: OffenseCard;
  cardW: number;
  cardH: number;
  shade: boolean;
  mode: PrintMode;
  copies: number;
}) {
  if (mode === "signs-cards") {
    return (
      <div className="pc-sheet">
        {Array.from({ length: copies }, (_, i) => (
          <div key={i} className="pc-print-card">
            <CardSvg
              grids={signsGrids(card)}
              leftColors={pitchColors(offense.batter)}
              rightColors={pitchColors(offense.runner)}
              width={cardW}
              height={cardH}
              shade={shade}
              printSize
            />
          </div>
        ))}
      </div>
    );
  }
  if (mode === "signs-coach") {
    return (
      <div className="pc-sheet">
        {Array.from({ length: copies }, (_, i) => (
          <CoachCard key={i} offense={offense} card={card} width={cardW} height={cardH} />
        ))}
      </div>
    );
  }
  if (mode !== "signs-sheet") return null;
  const block = (title: string, list: Play[], codes: Record<string, string[]>) => (
    <div className="pc-callsheet-block">
      <h2>{title}</h2>
      <table>
        <tbody>
          {list.map((p) => (
            <tr key={p.abbr} style={{ color: pitchColors(list)[p.abbr] }}>
              <th>
                {p.name} <span>({p.abbr})</span>
              </th>
              <td>{(codes[p.abbr] || []).join("  ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="pc-callsheet">
      <h1>Base coach call sheet — signs {card.id}</h1>
      <p>
        Call two numbers: <b>batter number first, runner number second.</b>{" "}Use a different number each time; any
        number listed for a play works. Check the players&apos; cards say SIGNS {card.id}.
      </p>
      {block("Batter", offense.batter, card.batterCodes)}
      {block("Runner", offense.runner, card.runnerCodes)}
    </div>
  );
}

/**
 * The base coach's wristband: each batter play and runner play with a few of
 * its numbers (spread across the card), same size as the players' cards.
 * Call the batter number first, runner number second.
 */
export function CoachCard({
  offense,
  card,
  width,
  height,
  perPlay: maxPerPlay = 6,
}: {
  offense: OffenseSettings;
  card: OffenseCard;
  width: number;
  height: number;
  perPlay?: number;
}) {
  const rows = Math.max(offense.batter.length, offense.runner.length);
  const lineH0 = height / (rows + 2.2);
  const font0 = Math.min(lineH0 * 0.62, 0.16);
  // Only as many numbers as fit the row in full (monospace: ~0.6em per
  // character, "12 " = 3 characters), so nothing is ever cut off.
  const colW = (width - 0.08) / 2 - 0.08;
  const room = colW - 3 * 0.62 * font0 - 0.06;
  const perPlay = Math.max(1, Math.min(maxPerPlay, Math.floor((room + 0.6 * font0) / (3 * 0.6 * font0))));
  // Spread the picks across a play's numbers rather than taking the first few.
  const pick = (codes: string[]) => {
    if (codes.length <= perPlay) return codes;
    const out: string[] = [];
    for (let i = 0; i < perPlay; i++) out.push(codes[Math.floor((i * codes.length) / perPlay)]);
    return out;
  };
  const lineH = lineH0;
  const font = font0;
  const col = (title: string, list: Play[], codes: Record<string, string[]>) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      {/* One text colour per play, matching the players' cards. */}
      <div style={{ fontWeight: 700, fontSize: `${font}in`, background: "#000", color: "#fff", padding: "0 0.04in" }}>{title}</div>
      {list.map((p, i) => (
        <div
          key={p.abbr}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.04in",
            height: `${lineH}in`,
            alignItems: "center",
            fontSize: `${font}in`,
            background: i % 2 ? "#e3e3e3" : "#fff",
            padding: "0 0.04in",
            color: pitchColors(list)[p.abbr],
          }}
        >
          <b style={{ whiteSpace: "nowrap" }}>{p.abbr}</b>
          <span
            data-coach={`${title}:${p.abbr}`}
            style={{ fontFamily: "Courier New, monospace", fontWeight: 700, whiteSpace: "nowrap" }}
          >
            {pick(codes[p.abbr] || []).join(" ")}
          </span>
        </div>
      ))}
    </div>
  );
  return (
    <div
      className="pc-print-card"
      style={{ width: `${width}in`, height: `${height}in`, background: "#fff", color: "#000", fontFamily: "Arial, sans-serif", overflow: "hidden", display: "flex", flexDirection: "column" }}
    >
      <div style={{ display: "flex", gap: "0.08in", flex: 1 }}>
        {col("BATTER", offense.batter, card.batterCodes)}
        {col("RUNNER", offense.runner, card.runnerCodes)}
      </div>
      <div style={{ textAlign: "center", fontSize: `${font * 0.7}in`, fontWeight: 700 }}>
        COACH · SIGNS {card.id} · BATTER # FIRST, RUNNER # SECOND
      </div>
    </div>
  );
}
