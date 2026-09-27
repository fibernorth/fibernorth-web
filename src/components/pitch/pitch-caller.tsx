"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  AT_BAT_END_LABELS,
  MAX_PITCHES,
  DEFAULT_PITCHES,
  PITCH_RESULTS,
  HIT_RESULTS,
  SAFE_RESULTS,
  OUT_RESULTS,
  RESULT_SHORT,
  normOpponent,
  resultKind,
  RESULT_LABELS,
  applyResult,
  batterHistory,
  buildCard,
  verifyCard,
  GRID_COLS,
  decodeTeamCode,
  encodeTeamCode,
  gameKey,
  gamesCsv,
  isOffPlate,
  locationCodes,
  localDate,
  locationName,
  makeCall,
  randomSeed,
  type AtBatEnd,
  type Call,
  type Count,
  type Game,
  type LoggedPitch,
  type PitchSettings,
  type Result,
} from "@/lib/pitch/engine";
import { CardSvg } from "@/components/pitch/card-svg";
import { DMark } from "@/components/pitch/d-mark";
import {
  loadCycles,
  loadGames,
  loadOpponent,
  loadPrintedId,
  loadSettings,
  saveCycles,
  saveGames,
  saveOpponent,
  savePrintedId,
  saveSettings,
} from "@/components/pitch/store";

type Tab = "call" | "games" | "card" | "setup";

const btn = "rounded-lg border border-white/15 bg-white/5 active:bg-white/15 transition-colors";
const input =
  "w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-base text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-amber-400";

export function PitchCaller({ onSignOut }: { onSignOut?: () => void }) {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("call");
  const [settings, setSettingsState] = useState<PitchSettings | null>(null);
  const [games, setGamesState] = useState<Game[]>([]);
  const [printedId, setPrintedIdState] = useState("");

  useEffect(() => {
    setSettingsState(loadSettings());
    setGamesState(loadGames());
    setPrintedIdState(loadPrintedId());
    setReady(true);
  }, []);

  /** Only settings that make a card passing every check are kept. */
  const setSettings = (s: PitchSettings): string => {
    try {
      buildCard(s);
    } catch (e) {
      return e instanceof Error ? e.message : "That setup doesn't make a valid card.";
    }
    setSettingsState(s);
    saveSettings(s);
    return "";
  };
  const setGames = (g: Game[]) => {
    setGamesState(g);
    saveGames(g);
  };
  const markPrinted = (id: string) => {
    setPrintedIdState(id);
    savePrintedId(id);
  };

  const built = useMemo(() => {
    if (!settings) return null;
    try {
      const c = buildCard(settings);
      return { card: c, error: "" };
    } catch (e) {
      return { card: null, error: e instanceof Error ? e.message : "Card check failed" };
    }
  }, [settings]);

  if (!ready || !settings || !built) {
    return <div className="min-h-dvh bg-[#0C1017]" />;
  }
  if (!built.card) {
    return (
      <div className="min-h-dvh bg-[#0C1017] text-white p-6 space-y-4">
        <p className="text-red-300 font-semibold">The card didn&apos;t pass its check, so no numbers will be shown.</p>
        <p className="text-sm text-white/70">{built.error}</p>
        <button
          className="rounded-lg bg-amber-400 text-black font-bold px-4 py-3"
          onClick={() => setSettings({ ...settings, pitches: DEFAULT_PITCHES.map((p) => ({ ...p })) })}
        >
          Reset pitches to the defaults
        </button>
      </div>
    );
  }
  const card = built.card;

  const cardChanged = printedId !== "" && printedId !== card.id;

  return (
    <div className="min-h-dvh bg-[#0C1017] text-white flex flex-col">
      <header className="pc-noprint sticky top-0 z-10 bg-[#0C1017]/95 backdrop-blur border-b border-white/10 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold tracking-wide">
          <DMark className="h-7 w-auto" />
          <span>
            TC <span className="text-amber-400">Diamonds</span>
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-mono text-white/80">Card {card.id}</span>
          {onSignOut && (
            <button onClick={onSignOut} className="text-white/50 text-xs underline">
              Sign out
            </button>
          )}
        </div>
      </header>

      {cardChanged && (
        <div className="pc-noprint mx-3 mt-2 rounded-lg border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-sm">
          The card changed from {printedId} to {card.id}. Reprint the wristbands before the next game.{" "}
          <button className="underline" onClick={() => markPrinted(card.id)}>
            Done
          </button>
        </div>
      )}

      <main className={cn("pc-noprint flex-1 px-3 pt-2", tab === "call" ? "pb-0" : "pb-24")}>
        {tab === "call" && <CallScreen settings={settings} card={card} games={games} setGames={setGames} />}
        {tab === "games" && <GamesScreen games={games} setGames={setGames} />}
        {tab === "card" && (
          <CardScreen settings={settings} card={card} setSettings={setSettings} onPrinted={() => markPrinted(card.id)} />
        )}
        {tab === "setup" && <SetupScreen settings={settings} setSettings={setSettings} cardId={card.id} />}
      </main>

      <nav className="pc-noprint fixed bottom-0 inset-x-0 z-10 border-t border-white/10 bg-[#0C1017]/95 backdrop-blur grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {(
          [
            ["call", "Call"],
            ["games", "Games"],
            ["card", "Card"],
            ["setup", "Setup"],
          ] as Array<[Tab, string]>
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn("py-3 text-sm font-semibold", tab === k ? "text-amber-400" : "text-white/60")}
          >
            {label}
          </button>
        ))}
      </nav>

      <PrintArea settings={settings} card={card} />
    </div>
  );
}

// ---- Call ---------------------------------------------------------------------

function CallScreen({
  settings,
  card,
  games,
  setGames,
}: {
  settings: PitchSettings;
  card: ReturnType<typeof buildCard>;
  games: Game[];
  setGames: (g: Game[]) => void;
}) {
  const [opponent, setOpponent] = useState("");
  const [batter, setBatter] = useState("");
  const [count, setCount] = useState<Count>({ b: 0, s: 0 });
  const [pitch, setPitch] = useState("");
  const [zone, setZone] = useState("");
  const [off, setOff] = useState(false);
  const [call, setCall] = useState<Call | null>(null);
  const [awaitingResult, setAwaitingResult] = useState(false);
  const [atBat, setAtBat] = useState<LoggedPitch[]>([]);
  const [endMsg, setEndMsg] = useState("");
  const [callError, setCallError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const cycles = useRef(loadCycles());

  useEffect(() => setOpponent(loadOpponent()), []);

  const loc = zone ? (off && zone !== "MM" && settings.offPlate ? `${zone}x` : zone) : "";

  const generate = (p: string, l: string) => {
    if (!p || !l) return;
    // Belt and braces: the card is re-checked and each number is looked up
    // on the card again inside makeCall. Anything off, no numbers shown.
    const ok = verifyCard(card, settings).length === 0;
    const c = ok ? makeCall(card, p, l, cycles.current) : null;
    saveCycles(cycles.current);
    setCall(c);
    setAwaitingResult(!!c);
    setEndMsg("");
    setCallError(c ? "" : "Couldn't make a checked call. Pick again, or reload the app.");
  };

  const pickPitch = (p: string) => {
    setPitch(p);
    generate(p, loc);
  };
  const pickZone = (z: string) => {
    setZone(z);
    const l = off && z !== "MM" && settings.offPlate ? `${z}x` : z;
    generate(pitch, l);
  };
  const toggleOff = () => {
    const next = !off;
    setOff(next);
    if (zone) generate(pitch, next && zone !== "MM" && settings.offPlate ? `${zone}x` : zone);
  };

  const record = (r: Result) => {
    if (!call) return;
    const { count: after, end } = applyResult(count, r);
    const date = localDate();
    const opp = opponent.trim() || "Unknown";
    const entry: LoggedPitch = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: new Date().toISOString(),
      date,
      opponent: opp,
      batter: batter.trim(),
      pitch: call.pitch,
      loc: call.loc,
      nums: call.spoken,
      result: r,
      countAfter: `${after.b}-${after.s}`,
      end,
    };
    const same = (g: Game) => g.date === date && normOpponent(g.opponent) === normOpponent(opp);
    const existing = games.find(same);
    const next = existing
      ? games.map((g) => (same(g) ? { ...g, pitches: [...g.pitches, entry] } : g))
      : [{ key: gameKey(date, opp), opponent: opp, date, pitches: [entry] }, ...games];
    setGames(next);
    setAwaitingResult(false);
    // Each pitch is called fresh: clear the pitch and spot (off-plate stays as set).
    setPitch("");
    setZone("");
    setCall(null);
    if (end) {
      const how = end === "walk" || end === "strikeout" ? AT_BAT_END_LABELS[end] : RESULT_LABELS[r];
      setEndMsg(`${how} — next batter`);
      setCount({ b: 0, s: 0 });
      setBatter("");
      setAtBat([]);
    } else {
      setCount(after);
      setAtBat((a) => [...a, entry]);
      setEndMsg(`${RESULT_LABELS[r]} · ${after.b}-${after.s}`);
    }
  };

  const history = batterHistory(games, opponent, batter);
  const pitchName = (abbr: string) => settings.pitches.find((p) => p.abbr === abbr)?.name || abbr;
  const small = "rounded-md border border-white/15 bg-white/5 active:bg-white/15";

  return (
    // One screen, no scrolling: fills the space between the top bar and the tabs.
    <div className="flex flex-col gap-2 h-[calc(100dvh-7.25rem-env(safe-area-inset-bottom))] min-h-[30rem]">
      <div className="grid grid-cols-[1fr_4.5rem_4rem] gap-2 items-center shrink-0">
        <input
          className={cn(input, "h-10 py-1")}
          value={opponent}
          aria-label="Opponent"
          onChange={(e) => {
            setOpponent(e.target.value);
            saveOpponent(e.target.value);
          }}
          placeholder="Opponent"
        />
        <input
          className={cn(input, "h-10 py-1 text-center")}
          value={batter}
          aria-label="Batter number"
          inputMode="numeric"
          onChange={(e) => setBatter(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
          placeholder="Bat #"
        />
        <div className="text-center leading-none">
          <div className="text-[10px] text-white/50">COUNT</div>
          <div className="text-2xl font-bold font-mono">
            {count.b}-{count.s}
          </div>
        </div>
      </div>

      {(history || atBat.length > 0) && (
        <button
          type="button"
          onClick={() => history && setShowHistory(true)}
          className="shrink-0 w-full text-left rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 space-y-1"
        >
          {history && (
            <div className="text-xs truncate">
              <span className="font-semibold">#{batter}</span> {history.pa} PA · {history.ab} AB · {history.hits} H ·{" "}
              {history.walks + history.hbp} BB/HBP · {history.ks} K{history.reached ? ` · ${history.reached} ROE/FC` : ""}{" "}
              <span className="text-amber-300">details ›</span>
            </div>
          )}
          <div className="flex gap-1 overflow-hidden">
            {atBat.length > 0 && <span className="text-[11px] text-white/50 shrink-0 self-center">This AB:</span>}
            {atBat.map((p) => (
              <Chip key={p.id} p={p} />
            ))}
            {atBat.length === 0 &&
              history?.atBats.slice(0, 6).map((a, i) => (
                <span
                  key={i}
                  className={cn(
                    "shrink-0 text-[11px] px-1.5 py-0.5 rounded border",
                    a.kind === "hit" && "bg-amber-400 text-black border-amber-400 font-semibold",
                    (a.kind === "strikeout" || a.kind === "out") && "border-red-500 text-red-300",
                    (a.kind === "walk" || a.kind === "safe") && "border-emerald-500 text-emerald-300"
                  )}
                >
                  {a.result}
                </span>
              ))}
          </div>
        </button>
      )}

      <div className="shrink-0 rounded-xl border border-white/15 bg-black/50 h-[6.5rem] flex flex-col items-center justify-center">
        {call ? (
          <>
            <div className="flex gap-8 font-mono font-black leading-none tracking-wider text-[clamp(3rem,17vw,4.75rem)]">
              <div className="text-center">
                {call.pitchNum}
                <div className="font-sans text-[10px] font-semibold tracking-normal text-white/50">PITCH</div>
              </div>
              <div className="text-center text-amber-400">
                {call.locNum}
                <div className="font-sans text-[10px] font-semibold tracking-normal text-amber-400/60">SPOT</div>
              </div>
            </div>
            <div className={cn("text-sm", isOffPlate(call.loc) ? "text-red-400" : "text-white/80")}>
              {pitchName(call.pitch)}, {locationName(call.loc)}
            </div>
          </>
        ) : callError ? (
          <div className="text-center text-red-300 font-semibold px-4 text-sm">{callError}</div>
        ) : endMsg ? (
          <div className="text-2xl font-bold text-amber-400">{endMsg}</div>
        ) : (
          <div className="text-white/50">Tap a pitch and a spot</div>
        )}
      </div>

      {awaitingResult ? (
        // After the call: the result buttons take the place of the pitch pad.
        <div className="flex-1 min-h-0 flex flex-col gap-1.5">
          <ResultRow label="Pitch" items={PITCH_RESULTS} cols={4} onPick={record} tone="pitch" />
          <ResultRow label="Hit" items={HIT_RESULTS} cols={4} onPick={record} tone="hit" />
          <ResultRow label="Safe" items={SAFE_RESULTS} cols={3} onPick={record} tone="safe" />
          <ResultRow label="Out" items={OUT_RESULTS} cols={4} onPick={record} tone="out" />
          <button onClick={() => setAwaitingResult(false)} className={cn(small, "shrink-0 h-10 text-sm font-semibold")}>
            Change the call
          </button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-1.5">
          <div className="grid grid-cols-3 gap-1.5 shrink-0">
            {settings.pitches.map((p) => (
              <button
                key={p.abbr}
                onClick={() => pickPitch(p.abbr)}
                className={cn(
                  small,
                  "h-11 text-base font-bold truncate px-1",
                  pitch === p.abbr && "bg-amber-400 text-black border-amber-400 active:bg-amber-300"
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[2.75rem_1fr_1fr_1fr] gap-1.5 text-center text-[10px] text-white/50 shrink-0">
            <span />
            <span>IN</span>
            <span>MIDDLE</span>
            <span>OUT</span>
          </div>
          <div className="flex-1 min-h-0 grid grid-rows-3 gap-1.5">
            {(["H", "M", "L"] as const).map((h) => (
              <div key={h} className="grid grid-cols-[2.75rem_1fr_1fr_1fr] gap-1.5 items-stretch">
                <span className="text-[10px] text-white/50 self-center text-right pr-1">{{ H: "HIGH", M: "MID", L: "LOW" }[h]}</span>
                {(["I", "M", "O"] as const).map((sd) => {
                  const z = `${h}${sd}`;
                  return (
                    <button
                      key={z}
                      onClick={() => pickZone(z)}
                      className={cn(
                        small,
                        "min-h-10 font-bold",
                        zone === z && (off && z !== "MM" ? "bg-red-600 border-red-500" : "bg-amber-400 text-black border-amber-400")
                      )}
                    >
                      {z}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1.5 shrink-0">
            <button
              onClick={toggleOff}
              disabled={!settings.offPlate}
              className={cn(small, "h-11 text-sm font-semibold disabled:opacity-40", off && "bg-red-600 border-red-500")}
            >
              Off plate{off ? " ON" : ""}
            </button>
            <button onClick={() => generate(pitch, loc)} disabled={!pitch || !zone} className={cn(small, "h-11 text-sm font-semibold disabled:opacity-40")}>
              New numbers
            </button>
            <button
              onClick={() => call && setAwaitingResult(true)}
              disabled={!call}
              className={cn(small, "h-11 text-sm font-semibold disabled:opacity-40")}
            >
              Result
            </button>
          </div>
        </div>
      )}

      {showHistory && history && (
        <HistorySheet batter={batter} opponent={opponent} history={history} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}

function Chip({ p }: { p: LoggedPitch }) {
  const kind = resultKind(p.result);
  return (
    <span
      className={cn(
        "shrink-0 text-[11px] px-1.5 py-0.5 rounded border whitespace-nowrap",
        kind === "hit" && "bg-amber-400 text-black border-amber-400 font-semibold",
        (kind === "out" || p.end === "strikeout" || p.result === "called_k" || p.result === "swing_miss") && "border-red-500 text-red-300",
        kind === "safe" && "border-emerald-500 text-emerald-300",
        kind === "pitch" && p.result !== "called_k" && p.result !== "swing_miss" && "border-white/20 text-white/80"
      )}
    >
      {p.pitch} {p.loc} {RESULT_SHORT[p.result]}
    </span>
  );
}

const TONES: Record<string, string> = {
  pitch: "",
  hit: "border-amber-400/60 text-amber-300",
  safe: "border-emerald-500/60 text-emerald-300",
  out: "border-red-500/60 text-red-300",
};

function ResultRow({
  label,
  items,
  cols,
  onPick,
  tone,
}: {
  label: string;
  items: readonly Result[];
  cols: number;
  onPick: (r: Result) => void;
  tone: keyof typeof TONES;
}) {
  return (
    // Each group grows by how many button rows it needs, so every button fits.
    <div className="min-h-0 flex flex-col" style={{ flex: `${Math.ceil(items.length / cols)} 1 0%` }}>
      <div className="text-[10px] text-white/50 leading-none mb-0.5">{label.toUpperCase()}</div>
      <div
        className="flex-1 min-h-0 grid gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${Math.ceil(items.length / cols)}, minmax(0, 1fr))`,
        }}
      >
        {items.map((r) => (
          <button
            key={r}
            onClick={() => onPick(r)}
            className={cn(
              "rounded-md border border-white/15 bg-white/5 active:bg-white/15 min-h-0 px-1 text-sm font-semibold leading-tight",
              TONES[tone],
              r === "called_k" || r === "swing_miss" ? "border-red-500/60 text-red-300" : ""
            )}
          >
            {RESULT_LABELS[r]}
          </button>
        ))}
      </div>
    </div>
  );
}

function HistorySheet({
  batter,
  opponent,
  history,
  onClose,
}: {
  batter: string;
  opponent: string;
  history: NonNullable<ReturnType<typeof batterHistory>>;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 bg-[#0C1017] flex flex-col" role="dialog" aria-label={`History for number ${batter}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="font-semibold">
          #{batter} vs {opponent}
        </div>
        <button onClick={onClose} className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold">
          Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            ["PA", history.pa],
            ["AB", history.ab],
            ["H", history.hits],
            ["BB", history.walks],
            ["HBP", history.hbp],
            ["K", history.ks],
            ["ROE/FC", history.reached],
            ["Pitches", history.pitches],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-white/10 py-2">
              <div className="text-xl font-bold font-mono">{v}</div>
              <div className="text-[10px] text-white/50">{k}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="text-xs text-white/50 mb-1">At-bats, newest first</div>
          <ul className="space-y-1 text-sm">
            {history.atBats.map((a, i) => (
              <li key={i} className="flex justify-between gap-2 border-b border-white/5 pb-1">
                <span className="text-white/60">{a.date.slice(5)}</span>
                <span className="flex-1">{a.result}</span>
                <span className="text-white/70">on {a.last}</span>
                <span className="text-white/50">{a.pitches}p</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-xs text-white/50 mb-1">Last {history.recent.length} pitches</div>
          <div className="flex flex-wrap gap-1">
            {history.recent.map((p) => (
              <Chip key={p.id} p={p} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Games --------------------------------------------------------------------

function GamesScreen({ games, setGames }: { games: Game[]; setGames: (g: Game[]) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const sorted = [...games].sort((a, b) => b.date.localeCompare(a.date) || b.pitches.length - a.pitches.length);
  const game = open ? games.find((g) => g.key === open) : null;

  const exportCsv = () => {
    const blob = new Blob([gamesCsv(games)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pitch-log-${localDate()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (game) {
    return (
      <div className="space-y-3">
        <button onClick={() => { setOpen(null); setConfirm(false); }} className={cn(btn, "w-full py-3 font-semibold")}>
          Back to games
        </button>
        <div>
          <div className="text-lg font-bold">{game.opponent}</div>
          <div className="text-sm text-white/60">
            {game.date} · {game.pitches.length} pitches · {game.pitches.filter((p) => p.end).length} at-bats
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="text-white/60 text-xs">
              <tr className="text-left">
                <th className="p-2">#</th>
                <th className="p-2">Pitch</th>
                <th className="p-2">Spot</th>
                <th className="p-2">Result</th>
                <th className="p-2">Count</th>
                <th className="p-2">AB end</th>
              </tr>
            </thead>
            <tbody>
              {game.pitches.map((p) => (
                <tr key={p.id} className="border-t border-white/10">
                  <td className="p-2">{p.batter || "–"}</td>
                  <td className="p-2">{p.pitch}</td>
                  <td className={cn("p-2", isOffPlate(p.loc) && "text-red-400")}>{p.loc}</td>
                  <td className="p-2">{RESULT_LABELS[p.result]}</td>
                  <td className="p-2 font-mono">{p.countAfter}</td>
                  <td className="p-2">{p.end ? AT_BAT_END_LABELS[p.end as Exclude<AtBatEnd, "">] : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={() => {
            if (!confirm) return setConfirm(true);
            setGames(games.filter((g) => g.key !== game.key));
            setOpen(null);
            setConfirm(false);
          }}
          className={cn(btn, "w-full py-3 font-semibold border-red-500/60 text-red-300", confirm && "bg-red-600 text-white")}
        >
          {confirm ? "Tap again to delete this game" : "Delete game"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.length === 0 ? (
        <p className="text-white/60 text-center py-10">No games yet. A game starts with the first pitch you log.</p>
      ) : (
        sorted.map((g) => (
          <button key={g.key} onClick={() => setOpen(g.key)} className={cn(btn, "w-full text-left p-3")}>
            <div className="font-semibold">{g.opponent}</div>
            <div className="text-sm text-white/60">
              {g.date} · {g.pitches.length} pitches · {g.pitches.filter((p) => p.end).length} at-bats
            </div>
          </button>
        ))
      )}
      {games.length > 0 && (
        <button onClick={exportCsv} className={cn(btn, "w-full py-3 font-semibold")}>
          Export all as CSV
        </button>
      )}
    </div>
  );
}

// ---- Card ---------------------------------------------------------------------

function CardScreen({
  settings,
  card,
  setSettings,
  onPrinted,
}: {
  settings: PitchSettings;
  card: ReturnType<typeof buildCard>;
  setSettings: (s: PitchSettings) => string;
  onPrinted: () => void;
}) {
  const [copies, setCopies] = useState(12);
  const [confirmNew, setConfirmNew] = useState(false);
  const [seedText, setSeedText] = useState(String(settings.seed));
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState("");
  const teamCode = encodeTeamCode(settings);

  useEffect(() => setSeedText(String(settings.seed)), [settings.seed]);

  const print = () => {
    window.dispatchEvent(new CustomEvent("pc-print-copies", { detail: copies }));
    setTimeout(() => {
      window.print();
      onPrinted();
    }, 50);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-2">
        <div style={{ aspectRatio: `${settings.cardW} / ${settings.cardH}` }}>
          <CardSvg card={card} width={settings.cardW} height={settings.cardH} shade={settings.shade} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-white/10 p-3">
          <div className="text-xs text-white/60 mb-1">Cells per pitch</div>
          {settings.pitches.map((p) => (
            <div key={p.abbr} className="flex justify-between">
              <span>{p.name}</span>
              <span className="font-mono">{card.pitchCodes[p.abbr]?.length ?? 0}</span>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-white/10 p-3">
          <div className="text-xs text-white/60 mb-1">Cells per spot</div>
          <div className="grid grid-cols-2 gap-x-3">
            {locationCodes(settings.offPlate).filter((l) => card.locationCodes[l]).map((l) => (
              <div key={l} className="flex justify-between">
                <span className={isOffPlate(l) ? "text-red-400" : ""}>{l}</span>
                <span className="font-mono">{card.locationCodes[l].length}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2 items-end">
        <label className="text-xs text-white/60 w-28">
          Copies
          <input
            className={input}
            inputMode="numeric"
            value={copies}
            onChange={(e) => setCopies(Math.max(1, Math.min(60, Number(e.target.value.replace(/\D/g, "")) || 1)))}
          />
        </label>
        <button onClick={print} className="flex-1 rounded-lg bg-amber-400 text-black font-bold py-3">
          Print cards + coach sheet
        </button>
      </div>
      <p className="text-xs text-white/50">Print at 100% (actual size), not &quot;fit to page&quot;.</p>

      <div className="rounded-lg border border-white/10 p-3 space-y-2">
        <label className="text-xs text-white/60 block">
          Card number
          <div className="flex gap-2">
            <input className={input} inputMode="numeric" value={seedText} onChange={(e) => setSeedText(e.target.value.replace(/\D/g, "").slice(0, 4))} />
            <button
              className={cn(btn, "px-4 text-sm font-semibold")}
              onClick={() => {
                const n = Number(seedText);
                if (n >= 1000 && n <= 9999) setSettings({ ...settings, seed: n });
                else setSeedText(String(settings.seed));
              }}
            >
              Use
            </button>
          </div>
        </label>
        <button
          onClick={() => {
            if (!confirmNew) return setConfirmNew(true);
            setSettings({ ...settings, seed: randomSeed() });
            setConfirmNew(false);
          }}
          className={cn(btn, "w-full py-3 font-semibold", confirmNew && "bg-red-600 border-red-500")}
        >
          {confirmNew ? "Tap again: new codes means reprinting every wristband" : "Make new codes"}
        </button>
      </div>

      <div className="rounded-lg border border-white/10 p-3 space-y-2">
        <div className="font-semibold">Match another phone</div>
        <p className="text-xs text-white/60">Copy this team code to the other phone and load it there. Both will show card {card.id}.</p>
        <textarea readOnly value={teamCode} className={cn(input, "font-mono text-xs h-20")} onFocus={(e) => e.currentTarget.select()} />
        <button
          className={cn(btn, "w-full py-2 font-semibold")}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(teamCode);
              setMsg("Team code copied.");
            } catch {
              setMsg("Couldn't copy. Press and hold the code to copy it.");
            }
          }}
        >
          Copy team code
        </button>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste a team code (PC1.…)" className={cn(input, "font-mono text-xs h-20")} />
        <button
          className={cn(btn, "w-full py-2 font-semibold")}
          onClick={() => {
            try {
              const s = decodeTeamCode(paste);
              const err = setSettings(s);
              if (err) throw new Error(err);
              setPaste("");
              setMsg(`Loaded. This phone now shows card ${buildCard(s).id}.`);
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Couldn't load that code.");
            }
          }}
        >
          Load team code
        </button>
        {msg && <p className="text-sm text-amber-300">{msg}</p>}
      </div>
    </div>
  );
}

// ---- Setup ----------------------------------------------------------------------

function SetupScreen({
  settings,
  setSettings,
  cardId,
}: {
  settings: PitchSettings;
  setSettings: (s: PitchSettings) => string;
  cardId: string;
}) {
  const update = (patch: Partial<PitchSettings>) => setSettings({ ...settings, ...patch });
  // Pitch edits are a draft until saved, so a half-typed abbreviation never
  // reaches the card.
  const [draft, setDraft] = useState(settings.pitches.map((p) => ({ ...p })));
  const [msg, setMsg] = useState("");
  useEffect(() => setDraft(settings.pitches.map((p) => ({ ...p }))), [settings.pitches]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.pitches);
  const setPitch = (i: number, patch: Partial<PitchSettings["pitches"][number]>) =>
    setDraft((d) => d.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const problem = pitchListProblem(draft);

  return (
    <div className="space-y-4">
      <p className="text-xs text-white/60">
        Anything that changes the card changes the card ID (now {cardId}). Reprint the wristbands after changes.
      </p>

      <div className="rounded-lg border border-white/10 p-3 space-y-2">
        <div className="font-semibold">Pitches</div>
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
              onChange={(e) => setPitch(i, { abbr: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) })}
            />
            <input className={input} value={p.name} maxLength={30} onChange={(e) => setPitch(i, { name: e.target.value })} />
            <input
              className={input}
              inputMode="numeric"
              value={p.weight}
              onChange={(e) => setPitch(i, { weight: Number(e.target.value.replace(/\D/g, "")) || 0 })}
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
          disabled={draft.length >= MAX_PITCHES}
          onClick={() => setDraft((d) => [...d, { abbr: "", name: "", weight: 10 }])}
          className={cn(btn, "w-full py-2 font-semibold disabled:opacity-30")}
        >
          Add pitch
        </button>
        {problem && <p className="text-sm text-red-300">{problem}</p>}
        {dirty && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setDraft(settings.pitches.map((p) => ({ ...p })))} className={cn(btn, "py-3 font-semibold")}>
              Undo changes
            </button>
            <button
              disabled={!!problem}
              onClick={() => setMsg(setSettings({ ...settings, pitches: draft }) || "Saved. Reprint the wristbands.")}
              className="rounded-lg bg-amber-400 text-black font-bold py-3 disabled:opacity-40"
            >
              Save pitches
            </button>
          </div>
        )}
        {msg && <p className="text-sm text-amber-300">{msg}</p>}
      </div>

      <div className="rounded-lg border border-white/10 p-3 space-y-3">
        <Check label="Include off-the-plate spots" checked={settings.offPlate} onChange={(v) => update({ offPlate: v })} />
        <Check label="Shade every other row" checked={settings.shade} onChange={(v) => update({ shade: v })} />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Card width (in)" value={settings.cardW} onChange={(v) => update({ cardW: v })} />
          <NumberField label="Card height (in)" value={settings.cardH} onChange={(v) => update({ cardH: v })} />
        </div>
        <p className="text-xs text-white/50">Measure the window of the wristband and enter it here.</p>
        <p className="text-xs text-white/50">
          Calls are always said pitch number first, spot number second. Each card has two grids with {GRID_COLS[0]}-
          {GRID_COLS[GRID_COLS.length - 1]} across the top and 0-9 down the side.
        </p>
      </div>
    </div>
  );
}

function pitchListProblem(pitches: PitchSettings["pitches"]): string {
  if (!pitches.length) return "Add at least one pitch.";
  if (pitches.some((p) => !p.abbr)) return "Every pitch needs an abbreviation.";
  if (pitches.some((p) => !p.name.trim())) return "Every pitch needs a name.";
  const abbrs = pitches.map((p) => p.abbr);
  const dup = abbrs.find((a, i) => abbrs.indexOf(a) !== i);
  if (dup) return `Two pitches use ${dup}. Give each its own abbreviation.`;
  if (pitches.every((p) => !p.weight)) return "At least one pitch needs a weight above 0.";
  return "";
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <input type="checkbox" className="h-5 w-5 accent-amber-400" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <label className="text-sm">
      {label}
      <input
        className={input}
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = Number(text);
          if (n >= 1 && n <= 10) onChange(Math.round(n * 100) / 100);
          else setText(String(value));
        }}
      />
    </label>
  );
}

// ---- Print ----------------------------------------------------------------------

function PrintArea({ settings, card }: { settings: PitchSettings; card: ReturnType<typeof buildCard> }) {
  const [copies, setCopies] = useState(12);
  useEffect(() => {
    const on = (e: Event) => setCopies(Math.max(1, Math.min(60, Number((e as CustomEvent<number>).detail) || 12)));
    window.addEventListener("pc-print-copies", on);
    return () => window.removeEventListener("pc-print-copies", on);
  }, []);

  const byPitch = settings.pitches.map((p) => ({ label: `${p.abbr} ${p.name}`, codes: card.pitchCodes[p.abbr] || [] }));
  const byLoc = locationCodes(settings.offPlate).filter((l) => card.locationCodes[l]).map((l) => ({ label: `${l} ${locationName(l)}`, codes: card.locationCodes[l], off: isOffPlate(l) }));

  return (
    <div id="pc-print" className="pc-print-only">
      <div className="pc-sheet">
        {Array.from({ length: copies }, (_, i) => (
          <div key={i} className="pc-print-card">
            <CardSvg card={card} width={settings.cardW} height={settings.cardH} shade={settings.shade} printSize />
          </div>
        ))}
      </div>
      <div className="pc-coach">
        <h1>Coach sheet — card {card.id}</h1>
        <p>Call order: pitch number first (pitch grid), spot number second (location grid). First digit is the column (1-5), second is the row (0-9).</p>
        <h2>By pitch</h2>
        {byPitch.map((g) => (
          <p key={g.label}>
            <b>{g.label}:</b> {g.codes.join(", ")}
          </p>
        ))}
        <h2>By location</h2>
        {byLoc.map((g) => (
          <p key={g.label} style={g.off ? { color: "#d40000" } : undefined}>
            <b>{g.label}:</b> {g.codes.join(", ")}
          </p>
        ))}
      </div>
    </div>
  );
}
