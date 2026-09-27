"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  AT_BAT_END_LABELS,
  MAX_PITCHES,
  RESULTS,
  RESULT_LABELS,
  applyResult,
  batterHistory,
  buildCard,
  clampPitchCols,
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

  const setSettings = (s: PitchSettings) => {
    setSettingsState(s);
    saveSettings(s);
  };
  const setGames = (g: Game[]) => {
    setGamesState(g);
    saveGames(g);
  };
  const markPrinted = (id: string) => {
    setPrintedIdState(id);
    savePrintedId(id);
  };

  const card = useMemo(() => (settings ? buildCard(settings) : null), [settings]);

  if (!ready || !settings || !card) {
    return <div className="min-h-dvh bg-[#0C1017]" />;
  }

  const cardChanged = printedId !== "" && printedId !== card.id;

  return (
    <div className="min-h-dvh bg-[#0C1017] text-white flex flex-col">
      <header className="pc-noprint sticky top-0 z-10 bg-[#0C1017]/95 backdrop-blur border-b border-white/10 px-4 py-2 flex items-center justify-between">
        <div className="font-bold tracking-wide">
          TC <span className="text-amber-400">Diamonds</span>
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

      <main className="pc-noprint flex-1 px-3 pb-24 pt-3">
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
  const cycles = useRef(loadCycles());

  useEffect(() => setOpponent(loadOpponent()), []);

  const loc = zone ? (off && zone !== "MM" && settings.offPlate ? `${zone}x` : zone) : "";

  const generate = (p: string, l: string) => {
    if (!p || !l) return;
    const c = makeCall(card, p, l, cycles.current, settings.mixOrder);
    saveCycles(cycles.current);
    setCall(c);
    setAwaitingResult(!!c);
    setEndMsg("");
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
    const key = gameKey(date, opp);
    const existing = games.find((g) => g.key === key);
    const next = existing
      ? games.map((g) => (g.key === key ? { ...g, pitches: [...g.pitches, entry] } : g))
      : [{ key, opponent: opp, date, pitches: [entry] }, ...games];
    setGames(next);
    setAwaitingResult(false);
    if (end) {
      setEndMsg(`${AT_BAT_END_LABELS[end as Exclude<AtBatEnd, "">]} — next batter`);
      setCount({ b: 0, s: 0 });
      setBatter("");
      setAtBat([]);
    } else {
      setCount(after);
      setAtBat((a) => [...a, entry]);
    }
  };

  const history = batterHistory(games, opponent, batter);
  const pitchName = (abbr: string) => settings.pitches.find((p) => p.abbr === abbr)?.name || abbr;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_5.5rem_4.5rem] gap-2 items-end">
        <label className="text-xs text-white/60">
          Opponent
          <input
            className={input}
            value={opponent}
            onChange={(e) => {
              setOpponent(e.target.value);
              saveOpponent(e.target.value);
            }}
            placeholder="Team name"
          />
        </label>
        <label className="text-xs text-white/60">
          Batter #
          <input
            className={input}
            value={batter}
            inputMode="numeric"
            onChange={(e) => setBatter(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
            placeholder="#"
          />
        </label>
        <div className="text-center">
          <div className="text-xs text-white/60">Count</div>
          <div className="text-2xl font-bold font-mono">
            {count.b}-{count.s}
          </div>
        </div>
      </div>

      {history && (
        <div className="rounded-lg border border-white/15 bg-white/5 p-3 space-y-2">
          <div className="text-sm">
            <span className="font-semibold">#{batter}</span> vs {opponent} — {history.atBats} AB, {history.hits} hit
            {history.hits === 1 ? "" : "s"}, {history.ks} K, {history.pitches} pitches
          </div>
          <div className="flex flex-wrap gap-1">
            {history.recent.map((p) => (
              <span
                key={p.id}
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded border",
                  p.result === "hit"
                    ? "bg-amber-400 text-black border-amber-400 font-semibold"
                    : ["called_k", "swing_miss", "out"].includes(p.result)
                      ? "border-red-500 text-red-300"
                      : "border-white/20 text-white/80"
                )}
              >
                {p.pitch} {p.loc} · {RESULT_LABELS[p.result]}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-white/15 bg-black/50 min-h-[9.5rem] flex flex-col items-center justify-center py-3">
        {call ? (
          <>
            <div className="font-mono font-black leading-none tracking-wider text-[clamp(4rem,22vw,7.5rem)]">
              {call.spoken[0]} <span className="text-amber-400">{call.spoken[1]}</span>
            </div>
            <div className={cn("mt-2 text-lg", isOffPlate(call.loc) ? "text-red-400" : "text-white/80")}>
              {pitchName(call.pitch)}, {locationName(call.loc)}
            </div>
          </>
        ) : endMsg ? (
          <div className="text-2xl font-bold text-amber-400">{endMsg}</div>
        ) : (
          <div className="text-white/50">Tap a pitch and a spot</div>
        )}
      </div>

      {awaitingResult && (
        <div className="grid grid-cols-3 gap-2">
          {RESULTS.map((r) => (
            <button
              key={r}
              onClick={() => record(r)}
              className={cn(
                btn,
                "py-3 text-sm font-semibold",
                r === "hit" && "border-amber-400/60 text-amber-300",
                (r === "called_k" || r === "swing_miss") && "border-red-500/60 text-red-300"
              )}
            >
              {RESULT_LABELS[r]}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {settings.pitches.map((p) => (
          <button
            key={p.abbr}
            onClick={() => pickPitch(p.abbr)}
            className={cn(
              btn,
              "py-4 text-lg font-bold",
              pitch === p.abbr && "bg-amber-400 text-black border-amber-400 active:bg-amber-300"
            )}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div>
        <div className="grid grid-cols-[3.5rem_1fr_1fr_1fr] gap-2 text-center text-xs text-white/60 mb-1">
          <span />
          <span>In</span>
          <span>Middle</span>
          <span>Out</span>
        </div>
        {(["H", "M", "L"] as const).map((h) => (
          <div key={h} className="grid grid-cols-[3.5rem_1fr_1fr_1fr] gap-2 mb-2 items-center">
            <span className="text-xs text-white/60 text-right pr-1">{{ H: "High", M: "Middle", L: "Low" }[h]}</span>
            {(["I", "M", "O"] as const).map((s) => {
              const z = `${h}${s}`;
              return (
                <button
                  key={z}
                  onClick={() => pickZone(z)}
                  className={cn(
                    btn,
                    "h-16 font-bold",
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

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={toggleOff}
          disabled={!settings.offPlate}
          className={cn(btn, "py-3 font-semibold disabled:opacity-40", off && "bg-red-600 border-red-500")}
        >
          Off the plate{off ? ": ON" : ""}
        </button>
        <button onClick={() => generate(pitch, loc)} disabled={!pitch || !zone} className={cn(btn, "py-3 font-semibold disabled:opacity-40")}>
          Same call, new numbers
        </button>
      </div>

      {atBat.length > 0 && (
        <div className="rounded-lg border border-white/10 p-3">
          <div className="text-xs text-white/60 mb-1">This at-bat</div>
          <ol className="space-y-1 text-sm">
            {atBat.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span className="font-mono">{p.nums.join(" ")}</span>
                <span className="flex-1 text-white/80">
                  {p.pitch} {p.loc}
                </span>
                <span>{RESULT_LABELS[p.result]}</span>
                <span className="font-mono text-white/60">{p.countAfter}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
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
  setSettings: (s: PitchSettings) => void;
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
              setSettings(s);
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
  setSettings: (s: PitchSettings) => void;
  cardId: string;
}) {
  const update = (patch: Partial<PitchSettings>) => setSettings({ ...settings, ...patch });
  const setPitch = (i: number, patch: Partial<PitchSettings["pitches"][number]>) =>
    update({ pitches: settings.pitches.map((p, k) => (k === i ? { ...p, ...patch } : p)) });

  return (
    <div className="space-y-4">
      <p className="text-xs text-white/60">
        Anything that changes the grid changes the card ID (now {cardId}). Reprint the wristbands after changes.
      </p>

      <div className="rounded-lg border border-white/10 p-3 space-y-2">
        <div className="font-semibold">Pitches</div>
        <div className="grid grid-cols-[4rem_1fr_4.5rem_2.5rem] gap-2 text-xs text-white/60">
          <span>Abbr</span>
          <span>Name</span>
          <span>Weight</span>
          <span />
        </div>
        {settings.pitches.map((p, i) => (
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
              disabled={settings.pitches.length <= 1}
              onClick={() => update({ pitches: settings.pitches.filter((_, k) => k !== i) })}
              className={cn(btn, "text-lg disabled:opacity-30")}
            >
              ×
            </button>
          </div>
        ))}
        <button
          disabled={settings.pitches.length >= MAX_PITCHES}
          onClick={() => update({ pitches: [...settings.pitches, { abbr: "NP", name: "New pitch", weight: 10 }] })}
          className={cn(btn, "w-full py-2 font-semibold disabled:opacity-30")}
        >
          Add pitch
        </button>
        <DuplicateWarning settings={settings} />
      </div>

      <div className="rounded-lg border border-white/10 p-3 space-y-3">
        <Check label="Include off-the-plate spots" checked={settings.offPlate} onChange={(v) => update({ offPlate: v })} />
        <Check label="Mix which number comes first" checked={settings.mixOrder} onChange={(v) => update({ mixOrder: v })} />
        <Check label="Shade every other row" checked={settings.shade} onChange={(v) => update({ shade: v })} />
        <label className="block text-sm">
          Pitch columns (3 to 6)
          <select
            className={input}
            value={settings.pitchCols}
            onChange={(e) => update({ pitchCols: clampPitchCols(Number(e.target.value)) })}
          >
            {[3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} pitch, {10 - n} location
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Card width (in)" value={settings.cardW} onChange={(v) => update({ cardW: v })} />
          <NumberField label="Card height (in)" value={settings.cardH} onChange={(v) => update({ cardH: v })} />
        </div>
        <p className="text-xs text-white/50">Measure the window of the wristband and enter it here.</p>
      </div>
    </div>
  );
}

function DuplicateWarning({ settings }: { settings: PitchSettings }) {
  const abbrs = settings.pitches.map((p) => p.abbr);
  const dup = abbrs.find((a, i) => a && abbrs.indexOf(a) !== i);
  const blank = abbrs.some((a) => !a);
  if (!dup && !blank) return null;
  return (
    <p className="text-sm text-red-300">
      {blank ? "Every pitch needs an abbreviation." : `Two pitches use ${dup}. Give each its own abbreviation.`}
    </p>
  );
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
        <p>First digit is the column, second is the row.</p>
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
