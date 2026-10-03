"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { BarChart3 } from "lucide-react";
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
  outcomeOf,
  OUTCOME_LABELS,
  callStats,
  callScore,
  bestCalls,
  type Outcome,
  type CallLine,
  missCode,
  missCellLabel,
  missName,
  MISS_COLS,
  MISS_ROWS,
  normCardCode,
  RESULT_LABELS,
  applyResult,
  batterHistory,
  buildCard,
  verifyCard,
  GRID_COLS,
  GRID_CELLS,
  ZONES,
  allocateByWeight,
  hasLocWeights,
  gameKey,
  gamesCsv,
  isOffPlate,
  locationCodes,
  localDate,
  locationName,
  makeCall,
  randomSeed,
  encodeTeamCode,
  pitchColors,
  pitchScreenColors,
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
import { keepAllKnown, keepCard, listTeamCards, openCard, type TeamCard } from "@/components/pitch/card-sync";
import { SaveMsg } from "@/components/pitch/save-msg";
import { PrinterScale, PrintTestSheet } from "@/components/pitch/print-test";
import {
  PlayListEditor,
  SignsCardPanel,
  SignsPrint,
  SignsScreen,
  requestPrint,
  usePrintRequest,
} from "@/components/pitch/signs";
import {
  buildOffenseCard,
  decodeFullTeamCode,
  defaultOffense,
  type OffenseSettings,
} from "@/lib/pitch/offense";
import {
  loadCycles,
  loadGames,
  loadOffense,
  loadPrintedSignsId,
  saveOffense,
  savePrintedSignsId,
  loadOpponent,
  loadPrintedId,
  loadPrintScale,
  savePrintScale,
  loadSettings,
  saveCycles,
  saveGames,
  saveOpponent,
  savePrintedId,
  saveSettings,
  loadCardHistory,
  loadSignsHistory,
  rememberCard,
  rememberSigns,
  type CardHistoryEntry,
} from "@/components/pitch/store";

type Tab = "call" | "signs" | "games" | "card" | "setup";

const btn = "rounded-lg border border-white/15 bg-white/5 active:bg-white/15 transition-colors";
const input =
  "w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-base text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-amber-400";

export function PitchCaller({ onSignOut }: { onSignOut?: () => void }) {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("call");
  const [settings, setSettingsState] = useState<PitchSettings | null>(null);
  const [games, setGamesState] = useState<Game[]>([]);
  const [printedId, setPrintedIdState] = useState("");
  const [offense, setOffenseState] = useState<OffenseSettings | null>(null);
  const [printedSignsId, setPrintedSignsIdState] = useState("");
  const [cardView, setCardView] = useState<"pitch" | "signs">("pitch");
  const printReq = usePrintRequest();
  // Corrects what this device prints (see print-scale.ts); never part of a card.
  const [printScale, setPrintScaleState] = useState(100);
  const setPrintScale = (n: number) => { setPrintScaleState(n); savePrintScale(n); };
  // Unsaved edits in Setup, so the Card tab can warn before printing.
  const [pitchDirty, setPitchDirty] = useState(false);
  const [batterDirty, setBatterDirty] = useState(false);
  const [runnerDirty, setRunnerDirty] = useState(false);
  const signsDirty = batterDirty || runnerDirty;

  useEffect(() => {
    setOffenseState(loadOffense());
    setPrintedSignsIdState(loadPrintedSignsId());
    setSettingsState(loadSettings());
    setGamesState(loadGames());
    setPrintedIdState(loadPrintedId());
    setPrintScaleState(loadPrintScale());
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
  /** Only a signs setup that passes every check is kept. */
  const setOffense = (o: OffenseSettings, _force = false): string => {
    try {
      buildOffenseCard(o);
    } catch (e) {
      return e instanceof Error ? e.message : "That setup doesn't make a valid signs card.";
    }
    setOffenseState(o);
    saveOffense(o);
    return "";
  };
  const markSignsPrinted = (id: string) => {
    setPrintedSignsIdState(id);
    savePrintedSignsId(id);
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

  const signs = useMemo(() => {
    if (!offense) return null;
    try {
      return { card: buildOffenseCard(offense), error: "" };
    } catch (e) {
      return { card: null, error: e instanceof Error ? e.message : "Signs card check failed" };
    }
  }, [offense]);

  // Every card this phone shows is remembered, for the quick switch.
  const [switcher, setSwitcher] = useState(false);
  const builtId = built?.card?.id || "";
  const signsId = signs?.card?.id || "";
  // ...and kept on the server under its number, so any phone can open it.
  useEffect(() => {
    if (builtId && settings) {
      rememberCard(builtId, settings);
      void keepCard("pitch", builtId, settings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builtId]);
  useEffect(() => {
    if (signsId && offense) {
      rememberSigns(signsId, offense);
      void keepCard("signs", signsId, offense);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signsId]);
  useEffect(() => {
    void keepAllKnown();
  }, []);

  if (!ready || !settings || !built || !offense || !signs) {
    return <div className="min-h-dvh bg-[#0C1017]" />;
  }
  if (!signs.card) {
    return (
      <div className="min-h-dvh bg-[#0C1017] text-white p-6 space-y-4">
        <p className="text-red-300 font-semibold">The signs card didn&apos;t pass its check, so no signs will be shown.</p>
        <p className="text-sm text-white/70">{signs.error}</p>
        <button className="rounded-lg bg-amber-400 text-black font-bold px-4 py-3" onClick={() => setOffense(defaultOffense(offense.seed), true)}>
          Reset signs to the defaults
        </button>
      </div>
    );
  }
  const signsCard = signs.card;
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
  // The header button switches whichever card is on screen.
  const onSigns = tab === "signs" || ((tab === "card" || tab === "setup") && cardView === "signs");
  const signsChanged = printedSignsId !== "" && printedSignsId !== signsCard.id;

  return (
    <div className="min-h-dvh bg-[#0C1017] text-white flex flex-col w-full max-w-md mx-auto sm:border-x sm:border-white/10">
      <header className="pc-noprint sticky top-0 z-10 bg-[#0C1017]/95 backdrop-blur border-b border-white/10 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold tracking-wide">
          <DMark className="h-7 w-auto" />
          <span>
            TC <span className="text-amber-400">Diamonds</span>
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setSwitcher(true)}
            aria-label="Switch card"
            className="font-mono text-white/90 text-xs text-right leading-tight rounded-md border border-white/20 px-2 py-1.5 active:bg-white/10"
          >
            {onSigns ? `Signs ${signsCard.id}` : `Card ${card.id}`} ▾
          </button>
          {onSignOut && (
            <button onClick={onSignOut} className="text-white/50 text-xs underline">
              Sign out
            </button>
          )}
        </div>
      </header>

      {switcher && (
        <CardSwitcher
          kind={onSigns ? "signs" : "pitch"}
          currentId={onSigns ? signsCard.id : card.id}
          onClose={() => setSwitcher(false)}
          onPickPitch={(s) => setSettings(s)}
          onPickSigns={(o) => setOffense(o, true)}
          settings={settings}
          offense={offense}
        />
      )}

      {cardChanged && (
        <div className="pc-noprint mx-3 mt-2 rounded-lg border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-sm">
          The card changed from {printedId} to {card.id}. Reprint the wristbands before the next game.{" "}
          <button className="underline" onClick={() => markPrinted(card.id)}>
            Done
          </button>
        </div>
      )}
      {signsChanged && (
        <div className="pc-noprint mx-3 mt-2 rounded-lg border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-sm">
          The signs card changed from {printedSignsId} to {signsCard.id}. Reprint the batter/runner cards and the call sheet.{" "}
          <button className="underline" onClick={() => markSignsPrinted(signsCard.id)}>
            Done
          </button>
        </div>
      )}

      <main className={cn("pc-noprint flex-1 px-3 pt-2", tab === "call" || tab === "signs" ? "pb-0" : "pb-24")}>
        {tab === "call" && <CallScreen settings={settings} card={card} games={games} setGames={setGames} />}
        {tab === "signs" && <SignsScreen offense={offense} card={signsCard} />}
        {tab === "games" && <GamesScreen games={games} setGames={setGames} />}
        {tab === "card" && (
          <div className="space-y-4">
            <CardCheck settings={settings} offense={offense} pitchId={card.id} signsId={signsCard.id} setSettings={setSettings} setOffense={setOffense} />
            <CardToggle view={cardView} setView={setCardView} pitchDirty={pitchDirty} signsDirty={signsDirty} />
            {cardView === "pitch" ? (
              <>
                {pitchDirty && <UnsavedWarning what="pitch" onGo={() => setTab("setup")} />}
                <CardScreen settings={settings} card={card} setSettings={setSettings} onPrinted={() => markPrinted(card.id)} printScale={printScale} setPrintScale={setPrintScale} />
              </>
            ) : (
              <>
                {signsDirty && <UnsavedWarning what="signs" onGo={() => setTab("setup")} />}
                <SignsCardPanel
                  offense={offense}
                  card={signsCard}
                  cardW={settings.cardW}
                  cardH={settings.cardH}
                  shade={settings.shade}
                  setOffense={setOffense}
                  onPrinted={() => markSignsPrinted(signsCard.id)}
                />
              </>
            )}
          </div>
        )}
        {/* Setup stays mounted so unsaved edits survive switching tabs. */}
        <div className={cn("space-y-4", tab !== "setup" && "hidden")}>
          <CardToggle view={cardView} setView={setCardView} pitchDirty={pitchDirty} signsDirty={signsDirty} />
          <div className={cn("space-y-4", cardView !== "pitch" && "hidden")}>
            <SetupScreen settings={settings} setSettings={setSettings} cardId={card.id} onDirty={setPitchDirty} />
            <SpotWeights settings={settings} setSettings={setSettings} card={card} />
          </div>
          <div className={cn("space-y-4", cardView !== "signs" && "hidden")}>
            <p className="text-xs text-white/60">
              Batter/runner signs (card {signsCard.id}). Add, rename or remove plays with the ×, then tap Save. Reprint the
              batter/runner cards after. Nothing here changes the pitch card.
            </p>
            <PlayListEditor
              title="Batter plays"
              who="batter"
              plays={offense.batter}
              onDirty={setBatterDirty}
              onSave={(b) => setOffense({ ...offense, batter: b }, true)}
            />
            <PlayListEditor
              title="Runner plays"
              who="runner"
              plays={offense.runner}
              onDirty={setRunnerDirty}
              onSave={(r) => setOffense({ ...offense, runner: r }, true)}
            />
          </div>
        </div>
      </main>

      <nav className="pc-noprint fixed bottom-0 inset-x-0 mx-auto w-full max-w-md z-10 border-t border-white/10 bg-[#0C1017]/95 backdrop-blur grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {(
          [
            ["call", "Pitch"],
            ["signs", "Signs"],
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

      <div id="pc-print" className="pc-print-only">
        {printReq.mode === "pitch" ? (
          <PrintArea settings={settings} card={card} copies={printReq.copies} printScale={printScale} />
        ) : printReq.mode === "pitch-test" ? (
          <PrintTestSheet width={settings.cardW} height={settings.cardH} scale={printScale} />
        ) : (
          <SignsPrint
            offense={offense}
            card={signsCard}
            cardW={settings.cardW}
            cardH={settings.cardH}
            shade={settings.shade}
            mode={printReq.mode}
            copies={printReq.copies}
          />
        )}
      </div>
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
  const [confirmReset, setConfirmReset] = useState(false);
  const [showWorking, setShowWorking] = useState(false);
  // Where the pitch actually went when she missed the spot ("" = hit it).
  const [missed, setMissed] = useState("");
  const [pickingMiss, setPickingMiss] = useState(false);
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
    setMissed("");
    setPickingMiss(false);
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
      ...(missed ? { actual: missed, hitSpot: false } : { hitSpot: true }),
    };
    setMissed("");
    setPickingMiss(false);
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
  // Most successful call: against this batter if she has one, else today's game.
  const bestVsBatter = history ? bestCalls(history.all, 1, 1)[0] : undefined;
  const todaysPitches = games
    .filter((g) => g.date === localDate() && normOpponent(g.opponent) === normOpponent(opponent || "Unknown"))
    .flatMap((g) => g.pitches);
  const bestToday = bestVsBatter ? undefined : bestCalls(todaysPitches, 2, 1)[0];
  const best = bestVsBatter ?? bestToday;

  // Today's game against this opponent (runs live on the game).
  const today = localDate();
  const oppName = opponent.trim() || "Unknown";
  const sameGame = (g: Game) => g.date === today && normOpponent(g.opponent) === normOpponent(oppName);
  const game = games.find(sameGame);
  const addRuns = (side: "us" | "them", delta: number) => {
    const cur = game?.[side] ?? 0;
    const nextVal = Math.max(0, cur + delta);
    if (nextVal === cur) return;
    setGames(
      game
        ? games.map((g) => (sameGame(g) ? { ...g, [side]: nextVal } : g))
        : [{ key: gameKey(today, oppName), opponent: oppName, date: today, pitches: [], [side]: nextVal }, ...games]
    );
  };

  const pitchName = (abbr: string) => settings.pitches.find((p) => p.abbr === abbr)?.name || abbr;
  const small = "rounded-md border border-white/15 bg-white/5 active:bg-white/15";

  return (
    // One screen, no scrolling: fills the space between the top bar and the tabs.
    <div className="flex flex-col gap-2 h-[calc(100dvh-7.25rem-env(safe-area-inset-bottom))] min-h-[30rem]">
      <div className="grid grid-cols-[1fr_4rem_3.5rem_2.75rem] gap-2 items-center shrink-0">
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
        <button
          type="button"
          onClick={() => setConfirmReset((v) => !v)}
          className="text-center leading-none rounded-md active:bg-white/10"
          aria-label="Count; tap to reset the at-bat"
        >
          <div className="text-[10px] text-white/50">COUNT</div>
          <div className="text-2xl font-bold font-mono">
            {count.b}-{count.s}
          </div>
        </button>
        <button
          type="button"
          onClick={() => setShowWorking(true)}
          aria-label="What's working"
          className="h-10 rounded-lg border border-white/15 bg-white/5 flex flex-col items-center justify-center active:bg-white/15"
        >
          <BarChart3 className="h-4 w-4 text-amber-300" />
          <span className="text-[9px] text-white/60 leading-none mt-0.5">WORKING</span>
        </button>
      </div>

      {confirmReset && (
        <div className="shrink-0 grid grid-cols-[1fr_auto_auto] gap-2 items-center rounded-lg border border-amber-400/50 bg-amber-400/10 px-2 py-1.5 text-sm">
          <span>Reset the count, batter # and this at-bat? (Saved pitches stay.)</span>
          <button
            onClick={() => {
              setCount({ b: 0, s: 0 });
              setBatter("");
              setAtBat([]);
              setPitch("");
              setZone("");
              setCall(null);
              setAwaitingResult(false);
              setEndMsg("");
              setCallError("");
              setConfirmReset(false);
            }}
            className="rounded-md bg-amber-400 text-black font-semibold px-3 py-2"
          >
            Reset
          </button>
          <button onClick={() => setConfirmReset(false)} className="rounded-md border border-white/20 px-3 py-2">
            No
          </button>
        </div>
      )}

      <div className="shrink-0 grid grid-cols-2 gap-2">
        {(
          [
            ["us", "US"],
            ["them", "THEM"],
          ] as const
        ).map(([side, label]) => (
          <div key={side} className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-1.5 py-0.5">
            <span className="text-[10px] text-white/50 w-9">{label}</span>
            <span className="flex-1 text-center text-xl font-bold font-mono">{game?.[side] ?? 0}</span>
            <button
              onClick={() => addRuns(side, -1)}
              aria-label={`Take a run off ${label}`}
              className="h-7 w-8 rounded-md border border-white/15 text-lg leading-none active:bg-white/15"
            >
              −
            </button>
            <button
              onClick={() => addRuns(side, 1)}
              aria-label={`Add a run for ${label}`}
              className="h-7 w-10 rounded-md bg-amber-400 text-black text-lg font-bold leading-none active:bg-amber-300"
            >
              +
            </button>
          </div>
        ))}
      </div>

      {(history || atBat.length > 0 || best) && (
        <div className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-2 py-1 space-y-1">
          <button type="button" onClick={() => history && setShowHistory(true)} className="w-full text-left text-xs truncate">
            {history ? (
              <>
                <span className="font-semibold">#{batter}</span> {history.pa} PA · {history.ab} AB · {history.hits} H ·{" "}
                {history.walks + history.hbp} BB · {history.ks} K <span className="text-amber-300">details ›</span>
              </>
            ) : atBat.length > 0 ? (
              <span className="text-white/60">This at-bat</span>
            ) : (
              <span className="text-white/60">Enter a batter # to see her pitches</span>
            )}
          </button>
          {/* Every pitch to this batter, newest first: pitch, spot, what happened. Swipe for more. */}
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {best && (
              <button
                type="button"
                onClick={() => setShowWorking(true)}
                className="shrink-0 text-xs font-bold px-2 py-1 rounded-md border-2 border-green-400 text-green-300 whitespace-nowrap leading-none"
                title="Most successful call; tap for What's working"
              >
                ★ {bestVsBatter ? `vs #${batter}` : "today"}: {best.pitch} {best.loc} {best.good}/{best.thrown}
              </button>
            )}
            {(history ? history.all : [...atBat].reverse()).map((p) => (
              <Chip key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}

      <div className="shrink-0 rounded-xl border border-white/15 bg-black/50 h-[5.25rem] [@media(min-height:720px)]:h-[6.5rem] flex flex-col items-center justify-center">
        {call ? (
          <>
            <div className="flex gap-8 font-mono font-black leading-none tracking-wider text-[clamp(2.75rem,15vw,3.75rem)] [@media(min-height:720px)]:text-[clamp(3rem,17vw,4.75rem)]">
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
          <ResultRow label="Hit" items={HIT_RESULTS} cols={3} onPick={record} tone="hit" />
          <ResultRow label="Safe" items={SAFE_RESULTS} cols={3} onPick={record} tone="safe" />
          <ResultRow label="Out" items={OUT_RESULTS} cols={4} onPick={record} tone="out" />
          <div className="shrink-0 grid grid-cols-2 gap-1.5">
            <button
              onClick={() => (missed ? setMissed("") : setPickingMiss(true))}
              className={cn(small, "h-10 text-sm font-semibold truncate px-1", missed && "bg-red-600 border-red-500 text-white")}
            >
              {missed ? `Missed: ${missName(missed)} ✕` : "Missed spot…"}
            </button>
            <button onClick={() => setAwaitingResult(false)} className={cn(small, "h-10 text-sm font-semibold")}>
              Change the call
            </button>
          </div>
          {pickingMiss && call && (
            <MissPicker
              called={call.loc}
              onPick={(code) => {
                setMissed(code);
                setPickingMiss(false);
              }}
              onCancel={() => setPickingMiss(false)}
            />
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-1.5">
          <div className="grid grid-cols-3 gap-1.5 shrink-0">
            {settings.pitches.map((p) => (
              <button
                key={p.abbr}
                onClick={() => pickPitch(p.abbr)}
                style={pitch === p.abbr ? undefined : { color: pitchScreenColors(settings.pitches)[p.abbr] }}
                className={cn(
                  small,
                  "h-10 text-base font-bold truncate px-1",
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
                        "min-h-9 font-bold",
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
              className={cn(small, "h-10 text-sm font-semibold disabled:opacity-40", off && "bg-red-600 border-red-500")}
            >
              Off plate{off ? " ON" : ""}
            </button>
            <button onClick={() => generate(pitch, loc)} disabled={!pitch || !zone} className={cn(small, "h-10 text-sm font-semibold disabled:opacity-40")}>
              New numbers
            </button>
            <button
              onClick={() => call && setAwaitingResult(true)}
              disabled={!call}
              className={cn(small, "h-10 text-sm font-semibold disabled:opacity-40")}
            >
              Result
            </button>
          </div>
        </div>
      )}

      {showWorking && (
        <WorkingSheet
          games={games}
          opponent={opponent}
          pitchNames={Object.fromEntries(settings.pitches.map((p) => [p.abbr, p.name]))}
          onClose={() => setShowWorking(false)}
        />
      )}

      {showHistory && history && (
        <HistorySheet
          batter={batter}
          opponent={opponent}
          history={history}
          pitchNames={Object.fromEntries(settings.pitches.map((p) => [p.abbr, p.name]))}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}

/**
 * Type the code printed on a wristband card or call sheet to make sure this
 * phone is calling from the same set.
 */
/**
 * Type the code printed on a card. If it's this phone's card, say so. If it's
 * another version of the same setup (a different card number), offer to switch
 * the calling app to it, so the app always matches the card in hand.
 */
function CardCheck({
  settings,
  offense,
  pitchId,
  signsId,
  setSettings,
  setOffense,
}: {
  settings: PitchSettings;
  offense: OffenseSettings;
  pitchId: string;
  signsId: string;
  setSettings: (s: PitchSettings) => string;
  setOffense: (o: OffenseSettings, force?: boolean) => string;
}) {
  const [text, setText] = useState("");
  const code = normCardCode(text);
  const ready = /^\d{4}-[A-Z]{3}$/.test(code);
  const seed = ready ? Number(code.slice(0, 4)) : 0;
  let switchTo: null | { kind: "pitch" | "signs"; apply: () => void } = null;
  if (ready && code !== pitchId && code !== signsId) {
    try {
      const s = { ...settings, seed };
      if (buildCard(s).id === code) switchTo = { kind: "pitch", apply: () => setSettings(s) };
    } catch {}
    try {
      const o = { ...offense, seed };
      if (!switchTo && buildOffenseCard(o).id === code) switchTo = { kind: "signs", apply: () => setOffense(o, true) };
    } catch {}
  }
  const verdict = !ready
    ? null
    : code === pitchId
      ? { ok: true, msg: `Match: the app is calling pitch card ${pitchId}.` }
      : code === signsId
        ? { ok: true, msg: `Match: the app is using signs card ${signsId}.` }
        : switchTo
          ? { ok: false, msg: `Not the card the app is using now (pitch ${pitchId}, signs ${signsId}), but it's one of your versions.` }
          : {
              ok: false,
              msg: `No match. That card was made with different pitches or plays than this phone has. Reprint, or load the code from the phone that printed it.`,
            };
  return (
    <div className="rounded-lg border border-white/15 bg-white/5 p-3 space-y-2">
      <div className="text-sm font-semibold">Check a card</div>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type the code on the card, e.g. 4703-PKH"
        autoCapitalize="characters"
        className={input}
      />
      {verdict && (
        <p className={cn("text-sm font-semibold", verdict.ok ? "text-emerald-300" : "text-red-300")}>
          {verdict.ok ? "✓ " : "✗ "}
          {verdict.msg}
        </p>
      )}
      {switchTo && (
        <button onClick={switchTo.apply} className="w-full rounded-lg bg-amber-400 text-black font-bold py-3">
          Use {code} for {switchTo.kind === "pitch" ? "pitch calling" : "signs"}
        </button>
      )}
    </div>
  );
}

/**
 * Where did it go? 5 x 5 target: the middle 3 x 3 is the strike zone, the
 * ring is outside. The called spot is outlined. Covers the result buttons
 * until a cell is tapped.
 */
function MissPicker({ called, onPick, onCancel }: { called: string; onPick: (code: string) => void; onCancel: () => void }) {
  const calledZone = called.replace(/x$/, "");
  return (
    <div className="fixed inset-x-0 bottom-0 top-[7.5rem] z-20 mx-auto w-full max-w-md bg-[#0C1017] p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Where did it go?</div>
        <button onClick={onCancel} className="rounded-md border border-white/20 px-3 py-1.5 text-sm">
          Cancel
        </button>
      </div>
      <div className="text-xs text-white/50">Middle is the strike zone. Called spot is outlined.</div>
      <div className="flex-1 min-h-0 grid grid-cols-5 grid-rows-5 gap-1">
        {Array.from({ length: MISS_ROWS * MISS_COLS }, (_, i) => {
          const row = Math.floor(i / MISS_COLS);
          const col = i % MISS_COLS;
          const code = missCode(row, col);
          const inZone = !code.startsWith("r");
          return (
            <button
              key={code}
              onClick={() => onPick(code)}
              className={cn(
                "rounded-md text-xs font-semibold leading-tight px-0.5",
                inZone ? "bg-white/10 border border-white/25" : "bg-red-900/30 border border-red-500/30 text-red-200",
                code === calledZone && "ring-2 ring-amber-400"
              )}
            >
              {missCellLabel(row, col)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * What's working: how each pitch and each pitch + spot call has done, so the
 * coach can see mid-game what to go back to and what's getting hit.
 */
function WorkingSheet({
  games,
  opponent,
  pitchNames,
  onClose,
}: {
  games: Game[];
  opponent: string;
  pitchNames: Record<string, string>;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<"game" | "team" | "all">("game");
  const today = localDate();
  const opp = normOpponent(opponent || "Unknown");
  const pitches = games
    .filter((g) => (scope === "all" ? true : normOpponent(g.opponent) === opp && (scope === "team" || g.date === today)))
    .flatMap((g) => g.pitches);
  const { byPitch, byCall, total } = callStats(pitches);
  const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "–");
  const best = byCall
    .filter((l) => l.thrown >= 2)
    .sort((a, b) => callScore(b) - callScore(a) || b.thrown - a.thrown)
    .slice(0, 5);
  const hurt = byCall
    .filter((l) => l.hits > 0)
    .sort((a, b) => b.hits - a.hits || callScore(a) - callScore(b))
    .slice(0, 4);
  const callText = (l: CallLine) =>
    [
      `${l.thrown} thrown`,
      l.swinging && `${l.swinging} swing-miss`,
      l.looking && `${l.looking} looking`,
      l.foul && `${l.foul} foul`,
      l.outs && `${l.outs} out${l.outs > 1 ? "s" : ""}`,
      l.hits && `${l.hits} hit${l.hits > 1 ? "s" : ""}`,
      l.balls && `${l.balls} ball${l.balls > 1 ? "s" : ""}`,
    ]
      .filter(Boolean)
      .join(" · ");
  const bar = (l: CallLine) => {
    const parts: Array<[Outcome, number]> = [
      ["swinging", l.swinging],
      ["looking", l.looking],
      ["foul", l.foul],
      ["out", l.outs],
      ["ball", l.balls],
      ["hit", l.hits],
    ];
    const rest = l.thrown - parts.reduce((a, [, n]) => a + n, 0);
    return (
      <div className="flex h-2 rounded overflow-hidden bg-white/5">
        {parts.map(([o, n]) =>
          n ? <div key={o} className={OUTCOME_STYLE[o].split(" ")[0]} style={{ width: `${(100 * n) / l.thrown}%` }} /> : null
        )}
        {rest > 0 && <div className="bg-yellow-300" style={{ width: `${(100 * rest) / l.thrown}%` }} />}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-30 bg-[#0C1017] flex flex-col mx-auto max-w-md" role="dialog" aria-label="What's working">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="font-semibold">What&apos;s working</div>
        <button onClick={onClose} className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold">
          Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-3 rounded-lg border border-white/15 overflow-hidden text-sm">
          {(
            [
              ["game", "This game"],
              ["team", `vs ${opponent || "team"}`],
              ["all", "All games"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setScope(k)}
              className={cn("py-2 font-semibold truncate px-1", scope === k ? "bg-amber-400 text-black" : "text-white/70")}
            >
              {label}
            </button>
          ))}
        </div>

        {total.thrown === 0 ? (
          <p className="text-white/60 text-center py-8">No pitches logged here yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                ["Pitches", String(total.thrown)],
                ["Strike %", pct(total.strikes, total.thrown)],
                ["Hit spot", pct(total.spotHit, total.spotKnown)],
                ["Hits", String(total.hits)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-white/10 py-2">
                  <div className="text-lg font-bold font-mono">{v}</div>
                  <div className="text-[10px] text-white/50">{k}</div>
                </div>
              ))}
            </div>

            <div>
              <div className="text-xs text-white/50 mb-1">Working best (pitch + spot, 2+ thrown)</div>
              {best.length === 0 && <p className="text-sm text-white/50">Not enough pitches yet.</p>}
              <ul className="space-y-1.5">
                {best.map((l) => (
                  <li key={`${l.pitch}|${l.loc}`} className="rounded-md border border-green-500/40 px-2 py-1.5">
                    <div className="flex justify-between text-sm">
                      <b>
                        {pitchNames[l.pitch] || l.pitch}, {locationName(l.loc)}
                      </b>
                      <span className="text-green-300 font-semibold">{pct(l.good, l.thrown)} good</span>
                    </div>
                    <div className="text-xs text-white/60 mb-1">{callText(l)}</div>
                    {bar(l)}
                  </li>
                ))}
              </ul>
            </div>

            {hurt.length > 0 && (
              <div>
                <div className="text-xs text-white/50 mb-1">Getting hit</div>
                <ul className="space-y-1.5">
                  {hurt.map((l) => (
                    <li key={`${l.pitch}|${l.loc}`} className="rounded-md border border-red-500/40 px-2 py-1.5">
                      <div className="flex justify-between text-sm">
                        <b>
                          {pitchNames[l.pitch] || l.pitch}, {locationName(l.loc)}
                        </b>
                        <span className="text-red-300 font-semibold">
                          {l.hits} hit{l.hits > 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="text-xs text-white/60 mb-1">{callText(l)}</div>
                      {bar(l)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="text-xs text-white/50 mb-1">By pitch</div>
              <table className="w-full text-sm">
                <thead className="text-[10px] text-white/50">
                  <tr className="text-right">
                    <th className="text-left font-normal">Pitch</th>
                    <th className="font-normal">#</th>
                    <th className="font-normal">Strike</th>
                    <th className="font-normal">Whiff</th>
                    <th className="font-normal">Hits</th>
                    <th className="font-normal">Spot</th>
                  </tr>
                </thead>
                <tbody>
                  {byPitch.map((l) => (
                    <tr key={l.pitch} className="border-t border-white/10 text-right">
                      <td className="text-left py-1.5">
                        {pitchNames[l.pitch] || l.pitch}
                        <div className="mt-1">{bar(l)}</div>
                      </td>
                      <td className="font-mono">{l.thrown}</td>
                      <td className="font-mono">{pct(l.strikes, l.thrown)}</td>
                      <td className="font-mono text-orange-300">{l.swinging}</td>
                      <td className="font-mono text-green-300">{l.hits}</td>
                      <td className="font-mono">{pct(l.spotHit, l.spotKnown)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-white/40 mt-1">
                Good = any strike or an out. Strike % counts every pitch that wasn&apos;t a ball. Spot % only counts pitches
                logged since hit/missed spot was tracked.
              </p>
            </div>
            <Legend />
          </>
        )}
      </div>
    </div>
  );
}

/** Colors by what the pitch did (same everywhere in the app). */
export const OUTCOME_STYLE: Record<Outcome, string> = {
  hit: "bg-green-500 text-black border-green-400",
  out: "bg-red-600 text-white border-red-500",
  foul: "bg-blue-600 text-white border-blue-500",
  swinging: "bg-orange-500 text-black border-orange-400",
  looking: "bg-purple-600 text-white border-purple-500",
  ball: "bg-white/10 text-white/85 border-white/25",
  safe: "bg-yellow-300 text-black border-yellow-200",
  hbp: "bg-pink-500 text-black border-pink-400",
};

function Chip({ p }: { p: LoggedPitch }) {
  const o = outcomeOf(p.result);
  return (
    <span
      className={cn("shrink-0 text-xs font-semibold px-2 py-1 rounded-md border whitespace-nowrap leading-none", OUTCOME_STYLE[o])}
      title={`${p.pitch} ${p.loc}: ${RESULT_LABELS[p.result]}${p.actual ? `, missed to ${missName(p.actual)}` : ""}`}
    >
      {p.pitch} {p.loc} · {RESULT_SHORT[p.result]}
      {p.actual ? " ✕" : ""}
    </span>
  );
}

/** Color key, shown in the history and What's working sheets. */
function Legend() {
  return (
    <div className="flex flex-wrap gap-1 text-[11px]">
      {(["hit", "out", "foul", "swinging", "looking", "ball", "safe", "hbp"] as Outcome[]).map((o) => (
        <span key={o} className={cn("px-1.5 py-0.5 rounded border", OUTCOME_STYLE[o])}>
          {OUTCOME_LABELS[o]}
        </span>
      ))}
      <span className="px-1.5 py-0.5 rounded border border-white/20 text-white/70">✕ = missed spot</span>
    </div>
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
  pitchNames,
  onClose,
}: {
  batter: string;
  opponent: string;
  history: NonNullable<ReturnType<typeof batterHistory>>;
  pitchNames: Record<string, string>;
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
        {bestCalls(history.all, 1, 3).length > 0 && (
          <div>
            <div className="text-xs text-white/50 mb-1">Worked best vs #{batter}</div>
            <ul className="space-y-1">
              {bestCalls(history.all, 1, 3).map((l, i) => (
                <li key={`${l.pitch}|${l.loc}`} className="flex justify-between gap-2 rounded-md border border-green-500/40 px-2 py-1.5 text-sm">
                  <span>
                    <span className="text-green-300 font-bold">{i === 0 ? "★ " : ""}</span>
                    <b>{pitchNames[l.pitch] || l.pitch}</b>, {locationName(l.loc)}
                  </span>
                  <span className="text-green-300 font-semibold whitespace-nowrap">
                    {l.good}/{l.thrown} good{l.hits ? ` · ${l.hits} hit` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Legend />
        <div>
          <div className="text-xs text-white/50 mb-1">Every pitch, newest first: the call, then what happened</div>
          <ul className="space-y-1.5">
            {history.all.map((p) => (
              <li key={p.id} className="rounded-md border border-white/10 px-2 py-1.5 text-sm">
                <div className="flex justify-between gap-2">
                  <span>
                    <b>{pitchNames[p.pitch] || p.pitch}</b>, {locationName(p.loc)}
                  </span>
                  <span className="font-mono text-white/50 text-xs">{p.nums.join(" ")}</span>
                </div>
                <div className="flex justify-between gap-2 text-xs mt-0.5">
                  <span className={cn("px-1.5 py-0.5 rounded border font-semibold", OUTCOME_STYLE[outcomeOf(p.result)])}>
                    {RESULT_LABELS[p.result]}
                    {p.end === "walk" ? " (walk)" : p.end === "strikeout" ? " (strikeout)" : ""}
                  </span>
                  <span className="text-white/50">
                    {p.date.slice(5)} · count {p.countAfter}
                  </span>
                </div>
                <div className={cn("text-xs mt-0.5", p.actual ? "text-red-300" : "text-emerald-300/80")}>
                  {p.actual ? `Missed the spot: went ${missName(p.actual)}` : "Hit the spot"}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ---- Games --------------------------------------------------------------------

function GamesScreen({ games, setGames }: { games: Game[]; setGames: (g: Game[]) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
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
            {game.date} · Us {game.us ?? 0} – Them {game.them ?? 0} · {game.pitches.length} pitches ·{" "}
            {game.pitches.filter((p) => p.end).length} at-bats
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
                <th className="p-2">Missed to</th>
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
                  <td className="p-2 text-red-300">{p.actual ? missName(p.actual) : ""}</td>
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
              {g.date} · Us {g.us ?? 0} – Them {g.them ?? 0} · {g.pitches.length} pitches · {g.pitches.filter((p) => p.end).length} at-bats
            </div>
          </button>
        ))
      )}
      {games.length > 0 && (
        <>
          <button onClick={exportCsv} className={cn(btn, "w-full py-3 font-semibold")}>
            Export all as CSV
          </button>
          <button
            onClick={() => {
              if (!confirmAll) return setConfirmAll(true);
              setGames([]);
              setConfirmAll(false);
            }}
            className={cn(btn, "w-full py-3 font-semibold border-red-500/60 text-red-300", confirmAll && "bg-red-600 text-white")}
          >
            {confirmAll ? `Tap again to delete all ${games.length} games (export first if you want them)` : "Start over: clear all games"}
          </button>
          {confirmAll && (
            <button onClick={() => setConfirmAll(false)} className={cn(btn, "w-full py-2 text-sm")}>
              Keep them
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ---- Card ---------------------------------------------------------------------

/** Defense (pitch card) and offense (signs card) are set up and printed separately. */
function CardToggle({
  view,
  setView,
  pitchDirty,
  signsDirty,
}: {
  view: "pitch" | "signs";
  setView: (v: "pitch" | "signs") => void;
  pitchDirty: boolean;
  signsDirty: boolean;
}) {
  return (
    <div className="grid grid-cols-2 rounded-lg border border-white/15 overflow-hidden">
      {(
        [
          ["pitch", "Defense: pitch card", pitchDirty],
          ["signs", "Offense: signs", signsDirty],
        ] as const
      ).map(([k, label, dirty]) => (
        <button
          key={k}
          onClick={() => setView(k)}
          className={cn("py-2.5 text-sm font-semibold", view === k ? "bg-amber-400 text-black" : "text-white/70")}
        >
          {label}
          {dirty && <span className="ml-1 text-red-500">●</span>}
        </button>
      ))}
    </div>
  );
}

function UnsavedWarning({ what, onGo }: { what: "pitch" | "signs"; onGo: () => void }) {
  return (
    <div className="rounded-lg border border-red-500/70 bg-red-600/20 p-3 text-sm space-y-2">
      <p className="font-semibold text-red-200">
        You have {what === "pitch" ? "pitch" : "play"} changes in Setup that are NOT saved. These cards don&apos;t have them.
      </p>
      <button onClick={onGo} className="rounded-md bg-red-600 px-3 py-2 font-semibold">
        Go to Setup and save
      </button>
    </div>
  );
}

function CardScreen({
  settings,
  card,
  setSettings,
  onPrinted,
  printScale,
  setPrintScale,
}: {
  settings: PitchSettings;
  card: ReturnType<typeof buildCard>;
  setSettings: (s: PitchSettings) => string;
  onPrinted: () => void;
  printScale: number;
  setPrintScale: (n: number) => void;
}) {
  const [copies, setCopies] = useState(12);
  const [confirmNew, setConfirmNew] = useState(false);
  const [seedText, setSeedText] = useState(String(settings.seed));
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState("");
  const [seedMsg, setSeedMsg] = useState("");
  // The pitch card has its own code; the signs card is shared separately.
  const teamCode = encodeTeamCode(settings);

  useEffect(() => setSeedText(String(settings.seed)), [settings.seed]);

  const print = () => requestPrint("pitch", copies, onPrinted);

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-2">
        <div style={{ aspectRatio: `${settings.cardW} / ${settings.cardH}` }}>
          <CardSvg card={card} leftColors={pitchColors(settings.pitches)} width={settings.cardW} height={settings.cardH} shade={settings.shade} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-white/10 p-3">
          <div className="text-xs text-white/60 mb-1">Cells per pitch</div>
          {settings.pitches.map((p) => (
            <div key={p.abbr} className="flex justify-between items-center gap-2">
              <span className="font-semibold" style={{ color: pitchScreenColors(settings.pitches)[p.abbr] }}>
                {p.name}
              </span>
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
      <PrinterScale
        width={settings.cardW}
        height={settings.cardH}
        scale={printScale}
        setScale={setPrintScale}
        onTest={() => requestPrint("pitch-test", 1)}
      />

      <div className="rounded-lg border border-white/10 p-3 space-y-2">
        <label className="text-xs text-white/60 block">
          Card number
          <div className="flex gap-2">
            <input className={input} inputMode="numeric" value={seedText} onChange={(e) => setSeedText(e.target.value.replace(/\D/g, "").slice(0, 4))} />
            <button
              className={cn(btn, "px-4 text-sm font-semibold")}
              onClick={() => {
                const n = Number(seedText);
                if (n >= 1000 && n <= 9999) {
                  const err = setSettings({ ...settings, seed: n });
                  if (err) setSeedText(String(settings.seed));
                  setSeedMsg(err || (n === settings.seed ? "" : "Saved. Reprint the wristbands."));
                } else {
                  setSeedText(String(settings.seed));
                  setSeedMsg("Card numbers are 1000 to 9999.");
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
            setSeedMsg(setSettings({ ...settings, seed: randomSeed() }) || "Saved. Reprint the wristbands.");
            setConfirmNew(false);
          }}
          className={cn(btn, "w-full py-3 font-semibold", confirmNew && "bg-red-600 border-red-500")}
        >
          {confirmNew ? "Tap again: new codes means reprinting every wristband" : "Make new codes"}
        </button>
        <SaveMsg msg={seedMsg} />
      </div>

      <div className="rounded-lg border border-white/10 p-3 space-y-2">
        <div className="font-semibold">Match another phone</div>
        <p className="text-xs text-white/60">
          Pitch card code: copy it to the other phone and load it there. Both will show pitch card {card.id}. It doesn&apos;t change the batter/runner signs (they have their own code).
        </p>
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
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste a pitch card code (PC2.…)" className={cn(input, "font-mono text-xs h-20")} />
        <button
          className={cn(btn, "w-full py-2 font-semibold")}
          onClick={() => {
            try {
              // Pitch card only; the signs card is left as it is.
              const { pitch: s } = decodeFullTeamCode(paste);
              const err = setSettings(s);
              if (err) throw new Error(err);
              setPaste("");
              setMsg(`Loaded. This phone now shows pitch card ${buildCard(s).id}. Signs unchanged.`);
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Couldn't load that code.");
            }
          }}
        >
          Load team code
        </button>
        <SaveMsg msg={msg} />
      </div>
    </div>
  );
}

// ---- Setup ----------------------------------------------------------------------

function SetupScreen({
  settings,
  setSettings,
  cardId,
  onDirty,
}: {
  settings: PitchSettings;
  setSettings: (s: PitchSettings) => string;
  cardId: string;
  onDirty: (dirty: boolean) => void;
}) {
  const [optMsg, setOptMsg] = useState("");
  const update = (patch: Partial<PitchSettings>) => setOptMsg(setSettings({ ...settings, ...patch }) || "Saved.");
  // Pitch edits are a draft until saved, so a half-typed abbreviation never
  // reaches the card.
  const [draft, setDraft] = useState(settings.pitches.map((p) => ({ ...p })));
  const [msg, setMsg] = useState("");
  useEffect(() => setDraft(settings.pitches.map((p) => ({ ...p }))), [settings.pitches]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.pitches);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
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
        {dirty && <p className="text-sm font-semibold text-red-300">Not saved yet. Tap Save pitches.</p>}
        {dirty && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setDraft(settings.pitches.map((p) => ({ ...p })))} className={cn(btn, "py-3 font-semibold")}>
              Undo changes
            </button>
            <button
              disabled={!!problem}
              onClick={() => setMsg(setSettings({ ...settings, pitches: draft }) || "Saved. Reprint the pitch wristbands.")}
              className="rounded-lg bg-amber-400 text-black font-bold py-3 disabled:opacity-40"
            >
              Save pitches
            </button>
          </div>
        )}
        <SaveMsg msg={msg} />
      </div>

      <div className="rounded-lg border border-white/10 p-3 space-y-3">
        <Check label="Include off-the-plate spots" checked={settings.offPlate} onChange={(v) => update({ offPlate: v })} />
        <Check label="Shade every other row" checked={settings.shade} onChange={(v) => update({ shade: v })} />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Card width (in)" value={settings.cardW} onChange={(v) => update({ cardW: v })} />
          <NumberField label="Card height (in)" value={settings.cardH} onChange={(v) => update({ cardH: v })} />
        </div>
        <SaveMsg msg={optMsg} />
        <p className="text-xs text-white/50">Measure the window of the wristband and enter it here.</p>
        <p className="text-xs text-white/50">
          Calls are always said pitch number first, spot number second. Each card has two grids with {GRID_COLS[0]}-
          {GRID_COLS[GRID_COLS.length - 1]} across the top and 0-9 down the side.
        </p>
      </div>
    </div>
  );
}

/**
 * How often each spot gets called, like the pitch weights. Starts from how
 * many cells each spot has now; "Even split" goes back to the default.
 */
function SpotWeights({
  settings,
  setSettings,
  card,
}: {
  settings: PitchSettings;
  setSettings: (s: PitchSettings) => string;
  card: ReturnType<typeof buildCard>;
}) {
  const locs = locationCodes(settings.offPlate);
  const current = useMemo(
    () =>
      Object.fromEntries(
        locs.map((l) => [l, hasLocWeights(settings) ? Number(settings.locWeights?.[l] ?? 0) : card.locationCodes[l]?.length ?? 0])
      ) as Record<string, number>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.locWeights, settings.offPlate, card.id]
  );
  const [draft, setDraft] = useState<Record<string, number>>(current);
  const [msg, setMsg] = useState("");
  useEffect(() => setDraft(current), [current]);
  const dirty = locs.some((l) => (draft[l] ?? 0) !== (current[l] ?? 0));
  const cells = useMemo(() => {
    try {
      const n = allocateByWeight(locs.map((l) => draft[l] ?? 0), GRID_CELLS);
      return Object.fromEntries(locs.map((l, i) => [l, n[i]])) as Record<string, number>;
    } catch {
      return {} as Record<string, number>;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, settings.offPlate]);
  const allZero = locs.every((l) => !(draft[l] > 0));

  const cell = (l: string) => (
    <label key={l} className={cn("rounded-md border p-1.5 text-center", isOffPlate(l) ? "border-red-400/40" : "border-white/15")}>
      <div className={cn("text-xs font-semibold", isOffPlate(l) && "text-red-300")}>{l}</div>
      <input
        inputMode="numeric"
        aria-label={`${l} weight`}
        value={draft[l] ?? 0}
        onChange={(e) => setDraft({ ...draft, [l]: Number(e.target.value.replace(/\D/g, "").slice(0, 3)) || 0 })}
        className="w-full mt-1 rounded bg-black/40 border border-white/15 px-1 py-1 text-center text-base"
      />
      <div className="text-[10px] text-white/50 mt-0.5">{cells[l] ?? 0} cells</div>
    </label>
  );

  return (
    <div className="rounded-lg border border-white/10 p-3 space-y-2">
      <div className="font-semibold">Spots: how often each gets called</div>
      <p className="text-xs text-white/60">
        Bigger number = called more. Every spot keeps at least one cell. {GRID_CELLS} cells total.
        {hasLocWeights(settings) ? "" : " Now: even split."}
      </p>
      <div className="grid grid-cols-3 gap-1.5">{ZONES.map(cell)}</div>
      {settings.offPlate && (
        <>
          <div className="text-xs text-white/50 pt-1">Off the plate</div>
          <div className="grid grid-cols-4 gap-1.5">{locs.filter(isOffPlate).map(cell)}</div>
        </>
      )}
      {dirty && <p className="text-sm font-semibold text-red-300">Not saved yet. Tap Save spots.</p>}
      <div className="grid grid-cols-2 gap-2">
        {dirty ? (
          <>
            <button onClick={() => setDraft(current)} className={cn(btn, "py-3 font-semibold")}>
              Undo changes
            </button>
            <button
              disabled={allZero}
              onClick={() => {
                const locWeights = Object.fromEntries(locs.map((l) => [l, Math.max(1, draft[l] || 0)]));
                setMsg(setSettings({ ...settings, locWeights }) || "Saved. Reprint the pitch wristbands.");
              }}
              className="rounded-lg bg-amber-400 text-black font-bold py-3 disabled:opacity-40"
            >
              Save spots
            </button>
          </>
        ) : (
          hasLocWeights(settings) && (
            <button
              onClick={() => {
                const { locWeights: _drop, ...rest } = settings;
                void _drop;
                setMsg(setSettings(rest as PitchSettings) || "Back to an even split. Reprint the pitch wristbands.");
              }}
              className={cn(btn, "py-3 font-semibold col-span-2")}
            >
              Even split (default)
            </button>
          )
        )}
      </div>
      <SaveMsg msg={msg} />
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

/**
 * The strike zone with each spot's numbers in its own box: IN on the left,
 * OUT on the right (the spot names are inside/outside, so it reads the same
 * for either batter). Off-the-plate spots ring the zone in red.
 */
function ZoneGrid({ card, offPlate }: { card: ReturnType<typeof buildCard>; offPlate: boolean }) {
  const nums = (l: string) => [...(card.locationCodes[l] || [])].sort().join("  ");
  // 25 even squares: the strike zone in the middle 3 x 3, off the plate
  // around it. An off-plate spot that runs along a side (high, low, in, out)
  // fills each square on that side with the same numbers.
  const CORNERS = new Set(["HI", "HO", "LI", "LO"]);
  const LABEL: Record<string, string> = {
    HI: "HIGH IN",
    HM: "HIGH MID",
    HO: "HIGH OUT",
    MI: "MID IN",
    MM: "MIDDLE",
    MO: "MID OUT",
    LI: "LOW IN",
    LM: "LOW MID",
    LO: "LOW OUT",
    HIx: "HIGH IN",
    HMx: "HIGH",
    HOx: "HIGH OUT",
    MIx: "IN",
    MOx: "OUT",
    LIx: "LOW IN",
    LMx: "LOW",
    LOx: "LOW OUT",
  };
  const rows: string[][] = offPlate
    ? [
        ["HIx", "HMx", "HMx", "HMx", "HOx"],
        ["MIx", "HI", "HM", "HO", "MOx"],
        ["MIx", "MI", "MM", "MO", "MOx"],
        ["MIx", "LI", "LM", "LO", "MOx"],
        ["LIx", "LMx", "LMx", "LMx", "LOx"],
      ]
    : [
        ["HI", "HM", "HO"],
        ["MI", "MM", "MO"],
        ["LI", "LM", "LO"],
      ];
  return (
    <div className="pc-zone-side">
      <div className={cn("pc-zone-heads", offPlate ? "pc-zone-cols-5" : "pc-zone-cols-3")}>
        {offPlate && <span />}
        <span>IN</span>
        <span>MIDDLE</span>
        <span>OUT</span>
        {offPlate && <span />}
      </div>
      <div className={cn("pc-zone-grid", offPlate ? "pc-zone-cols-5" : "pc-zone-cols-3")}>
        {rows.flatMap((row, r) =>
          row.map((l, c) => (
            <div
              key={`${r}-${c}`}
              className={cn(
                "pc-zone-box",
                isOffPlate(l) ? "pc-zone-yellow" : CORNERS.has(l) ? "pc-zone-green" : "pc-zone-red"
              )}
            >
              <div className="pc-zone-label">{LABEL[l] ?? l}</div>
              <div className="pc-zone-nums">{nums(l)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Quick switch between card versions: the ones this phone has used, newest
 * first, or type the code printed on a card. Pitch card on every tab but
 * Signs, where it switches the batter/runner signs.
 */
function CardSwitcher({
  kind,
  currentId,
  onClose,
  onPickPitch,
  onPickSigns,
  settings,
  offense,
}: {
  kind: "pitch" | "signs";
  currentId: string;
  onClose: () => void;
  onPickPitch: (s: PitchSettings) => string;
  onPickSigns: (o: OffenseSettings) => string;
  settings: PitchSettings;
  offense: OffenseSettings;
}) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [looking, setLooking] = useState("");
  // Every card the team has made, from any phone.
  const [team, setTeam] = useState<TeamCard[] | null>(null);
  useEffect(() => {
    let live = true;
    void listTeamCards().then((list) => live && setTeam(list.filter((c) => c.kind === kind)));
    return () => {
      live = false;
    };
  }, [kind]);
  const history = useMemo(
    () => (kind === "pitch" ? loadCardHistory() : loadSignsHistory()) as CardHistoryEntry<PitchSettings | OffenseSettings>[],
    [kind]
  );
  const pick = (entry: { settings: PitchSettings | OffenseSettings }) => {
    const err = kind === "pitch" ? onPickPitch(entry.settings as PitchSettings) : onPickSigns(entry.settings as OffenseSettings);
    if (err) setMsg(err);
    else onClose();
  };
  const code = normCardCode(text);
  const ready = /^\d{4}-[A-Z]{3}$/.test(code);
  // A typed code: one this phone has used, or the same setup with that card number.
  let match: { settings: PitchSettings | OffenseSettings } | null = null;
  if (ready) {
    const hit = history.find((h) => h.id === code);
    if (hit) match = hit;
    else {
      const seed = Number(code.slice(0, 4));
      try {
        if (kind === "pitch") {
          const s = { ...settings, seed };
          if (buildCard(s).id === code) match = { settings: s };
        } else {
          const o = { ...offense, seed };
          if (buildOffenseCard(o).id === code) match = { settings: o };
        }
      } catch {
        // not a valid setup
      }
    }
  }
  // Any card the team has used, from any phone: looked up by its number.
  const lookUp = async (id: string = code) => {
    setLooking(id);
    setMsg("");
    try {
      const found = await openCard(id);
      // The number on the card says which kind it is; prefer the one this
      // switcher is for when (rarely) both exist.
      const usePitch = found.pitch && (kind === "pitch" || !found.signs);
      if (usePitch) {
        const err = onPickPitch(found.pitch!);
        if (err) setMsg(err);
        else onClose();
      } else if (found.signs) {
        const err = onPickSigns(found.signs);
        if (err) setMsg(err);
        else onClose();
      } else {
        setMsg(`No card ${id} yet. Check the number, or open it once on the phone that made it.`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't look that card up.");
    } finally {
      setLooking("");
    }
  };
  const when = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " +
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="pc-noprint fixed inset-0 z-30 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md bg-[#0C1017] border border-white/15 rounded-t-2xl sm:rounded-2xl p-4 space-y-3 max-h-[85dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="font-bold text-lg">{kind === "pitch" ? "Switch pitch card" : "Switch signs card"}</div>
          <button onClick={onClose} className="rounded-md border border-white/20 px-3 py-1.5 text-sm">
            Close
          </button>
        </div>
        <label className="block text-sm">
          <span className="text-white/60">Type the code on the card</span>
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setMsg("");
            }}
            placeholder="e.g. 4703-PKH"
            autoCapitalize="characters"
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-3 text-lg font-mono text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </label>
        {ready &&
          (code === currentId ? (
            <p className="text-emerald-300 font-semibold">That&apos;s the card you&apos;re on.</p>
          ) : match ? (
            <button onClick={() => pick(match!)} className="w-full rounded-lg bg-amber-400 text-black font-bold py-3">
              Use {code}
            </button>
          ) : (
            <button
              disabled={!!looking}
              onClick={() => void lookUp()}
              className="w-full rounded-lg bg-amber-400 text-black font-bold py-3 disabled:opacity-60"
            >
              {looking === code ? "Looking…" : `Open ${code}`}
            </button>
          ))}
        {msg && <p className="text-red-300 text-sm">{msg}</p>}
        {team && team.some((t) => !history.some((h) => h.id === t.id)) && (
          <>
            <div className="text-sm text-white/60 pt-1">Team cards (made on other phones)</div>
            <div className="space-y-1.5">
              {team
                .filter((t) => !history.some((h) => h.id === t.id))
                .map((t) => {
                  const on = t.id === currentId;
                  return (
                    <button
                      key={t.id}
                      disabled={on || !!looking}
                      onClick={() => void lookUp(t.id)}
                      className={cn(
                        "w-full flex items-center justify-between rounded-lg border px-3 py-3 text-left",
                        on ? "border-amber-400 bg-amber-400/10" : "border-white/15 bg-white/5 active:bg-white/15"
                      )}
                    >
                      <span className="font-mono font-bold text-base">{t.id}</span>
                      <span className="text-xs text-white/60">
                        {looking === t.id ? "Opening…" : on ? "in use" : `made ${when(t.createdAt)}`}
                      </span>
                    </button>
                  );
                })}
            </div>
          </>
        )}
        <div className="text-sm text-white/60 pt-1">Recent cards on this phone</div>
        <div className="space-y-1.5">
          {history.length === 0 && <p className="text-sm text-white/50">None yet.</p>}
          {history.map((h) => {
            const on = h.id === currentId;
            return (
              <button
                key={h.id}
                disabled={on}
                onClick={() => pick(h)}
                className={cn(
                  "w-full flex items-center justify-between rounded-lg border px-3 py-3 text-left",
                  on ? "border-amber-400 bg-amber-400/10" : "border-white/15 bg-white/5 active:bg-white/15"
                )}
              >
                <span className="font-mono font-bold text-base">{h.id}</span>
                <span className="text-xs text-white/60">{on ? "in use" : `used ${when(h.usedAt)}`}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PrintArea({ settings, card, copies, printScale }: { settings: PitchSettings; card: ReturnType<typeof buildCard>; copies: number; printScale: number }) {
  const colors = pitchColors(settings.pitches);
  const byPitch = settings.pitches.map((p) => ({ label: `${p.abbr} ${p.name}`, codes: card.pitchCodes[p.abbr] || [], color: colors[p.abbr] }));
  return (
    <>
      <div className="pc-sheet">
        {Array.from({ length: copies }, (_, i) => (
          <div key={i} className="pc-print-card">
            <CardSvg card={card} leftColors={pitchColors(settings.pitches)} width={settings.cardW} height={settings.cardH} shade={settings.shade} printSize printScale={printScale} />
          </div>
        ))}
      </div>
      <div className="pc-coach pc-zone-sheet">
        <h1>Pitch calls: card {card.id}</h1>
        <p className="pc-zone-how">
          Say the <b>pitch number</b> first, then the <b>spot number</b>. Pick any number in the box; rotate through them.
        </p>
        <div className="pc-zone-wrap">
          <div className="pc-zone-pitches">
            {byPitch.map((g) => (
              <div key={g.label} className="pc-zone-pitch" style={{ color: g.color }}>
                <div className="pc-zone-pitch-name">{g.label}</div>
                <div className="pc-zone-nums">{[...g.codes].sort().join("  ")}</div>
              </div>
            ))}
          </div>
          <ZoneGrid card={card} offPlate={settings.offPlate} />
        </div>
      </div>
    </>
  );
}
