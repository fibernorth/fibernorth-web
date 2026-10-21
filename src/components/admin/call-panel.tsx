"use client";

import { useState } from "react";
import { Loader2, Phone, RotateCcw, Save, X } from "lucide-react";
import { fillText, LEAD_VM_SCRIPTS, toTextTemplate, type TemplateExtras } from "@/lib/lead-email-templates";
import { useMyTextTemplates } from "@/hooks/use-my-text-templates";
import { useMyProfile } from "@/hooks/use-my-profile";
import { cn } from "@/lib/utils";

type CallLead = { name?: string; contactName?: string; serviceType?: string; address?: string; source?: string; phone?: string };
type SaveResult = "ok" | "queued" | "error";
export type CallOutcome = "vm" | "talked" | "noanswer";

const OUTCOMES: Array<{ key: CallOutcome; label: string }> = [
  { key: "vm", label: "Left voicemail" },
  { key: "talked", label: "They answered" },
  { key: "noanswer", label: "No answer, no VM" },
];

/** A phone or tablet that can place the call itself (tel: links). */
function canDial(): boolean {
  if (typeof window === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.matchMedia?.("(pointer: coarse)").matches;
}

/**
 * The Call button's window: pick a voicemail script, then Call with the
 * script still on screen. On a phone Call dials; on a computer it only
 * starts the log. Either way the log waits right there: "Left voicemail"
 * with the script used is the default, "They answered" takes notes from the
 * call. Saving asks "Are you sure?" and the window stays open after.
 * Scripts can be edited and saved as the user's own, like the texts.
 */
export function CallPanel({
  lead,
  extras,
  onClose,
  onLog,
}: {
  lead: CallLead;
  extras?: TemplateExtras;
  onClose: () => void;
  /** Saves the call on the lead. `text` is the history line. */
  onLog: (outcome: CallOutcome, text: string) => Promise<SaveResult>;
}) {
  const { texts, save } = useMyTextTemplates();
  const { me } = useMyProfile();
  const fillExtras = { ...extras, me };
  const [dialer] = useState(canDial);
  const phone = lead.phone || "";
  const who = (lead.contactName || lead.name || "").trim();

  const [scriptKey, setScriptKey] = useState(LEAD_VM_SCRIPTS[0].key);
  const [draft, setDraft] = useState<string | null>(null);
  const script = LEAD_VM_SCRIPTS.find((s) => s.key === scriptKey);
  const mine = script ? fillText(script.key, lead, fillExtras, texts) : "";
  const body = draft ?? mine;
  const [scriptNote, setScriptNote] = useState("");

  const [started, setStarted] = useState(false);
  const [outcome, setOutcome] = useState<CallOutcome>("vm");
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logged, setLogged] = useState("");
  const [err, setErr] = useState("");

  const pick = (key: string) => {
    setScriptKey(key);
    setDraft(null);
  };

  const saveScript = async (fn: () => Promise<string>, ok: string) => {
    const e = await fn();
    if (!e) setDraft(null);
    setScriptNote(e || ok);
    setTimeout(() => setScriptNote(""), 4000);
  };

  const lineFor = (): string => {
    const n = notes.trim();
    if (outcome === "talked") return n || "Talked";
    const base = outcome === "vm" ? `No answer, left VM${script ? ` (${script.label.toLowerCase()} script)` : ""}` : "No answer, no VM";
    const said = outcome === "vm" && body.trim() ? `\nVoicemail: ${body.trim()}` : "";
    return `${n ? `${base}. ${n}` : base}${said}`;
  };

  const doLog = async () => {
    setSaving(true);
    setErr("");
    const line = lineFor();
    const r = await onLog(outcome, line);
    setSaving(false);
    setConfirming(false);
    if (r === "error") {
      setErr("Didn't save. Try again.");
      return;
    }
    setLogged(r === "queued" ? `${line} (no signal, saved on this phone)` : line);
    setNotes("");
  };

  const callBtn = "flex-1 h-12 rounded-md bg-primary text-primary-foreground text-base font-semibold inline-flex items-center justify-center gap-2";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center">
      <div className="w-full max-w-lg bg-card border border-border rounded-t-2xl sm:rounded-2xl p-4 space-y-3 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-semibold">Call {who || "this lead"}</div>
            {phone && <div className="text-sm text-muted-foreground">{phone}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-md hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 1. Pick a script */}
        <div className="flex flex-wrap gap-1.5">
          {LEAD_VM_SCRIPTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => pick(s.key)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm border",
                scriptKey === s.key ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {s.label}
              {texts[s.key] ? " ★" : ""}
            </button>
          ))}
        </div>

        {script ? (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Voicemail script{texts[script.key] ? " (your version)" : ""}</div>
            <textarea
              value={body}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              aria-label="Voicemail script"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-base leading-relaxed resize-y"
            />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {draft !== null && draft !== mine && (
                <>
                  <button
                    type="button"
                    disabled={!body.trim()}
                    onClick={() => void saveScript(() => save(script.key, toTextTemplate(body, lead, fillExtras)), "Saved as your default script.")}
                    className="h-8 px-2.5 rounded-md border border-primary/50 text-primary inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" /> Save as my default
                  </button>
                  <button type="button" onClick={() => setDraft(null)} className="h-8 px-2.5 rounded-md border border-border hover:bg-muted">
                    Undo edits
                  </button>
                </>
              )}
              {texts[script.key] && draft === null && (
                <button
                  type="button"
                  onClick={() => void saveScript(() => save(script.key, ""), "Back to the original script.")}
                  className="h-8 px-2.5 rounded-md border border-border hover:bg-muted inline-flex items-center gap-1.5 text-muted-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Back to original
                </button>
              )}
              {scriptNote && <span className="text-accent">{scriptNote}</span>}
            </div>
          </div>
        ) : null}

        {/* 2. Call */}
        <div className="flex gap-2">
          {dialer && phone ? (
            <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} onClick={() => setStarted(true)} className={callBtn}>
              <Phone className="h-5 w-5" /> Call
            </a>
          ) : (
            <button type="button" onClick={() => setStarted(true)} className={callBtn}>
              <Phone className="h-5 w-5" /> {started ? "Calling: log it below" : "Call (log it)"}
            </button>
          )}
        </div>
        {!dialer && phone && (
          <p className="text-xs text-muted-foreground">
            Dial {phone} on your phone. This computer can&apos;t place the call, so Call just starts the log.{" "}
            <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="underline">
              Dial from this computer
            </a>
          </p>
        )}

        {/* 3. Log it, right here */}
        {started && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
            {logged ? (
              <>
                <p className="text-sm text-accent">Logged on the lead: {logged}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLogged("");
                      setOutcome("vm");
                    }}
                    className="h-10 px-3 rounded-md border border-border text-sm hover:bg-muted"
                  >
                    Log another call
                  </button>
                  <button type="button" onClick={onClose} className="h-10 px-3 rounded-md border border-border text-sm hover:bg-muted">
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-medium">How did it go?</div>
                <div className="flex flex-wrap gap-1.5">
                  {OUTCOMES.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => {
                        setOutcome(o.key);
                        setConfirming(false);
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-sm border",
                        outcome === o.key ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:bg-muted"
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={outcome === "talked" ? 5 : 2}
                  placeholder={outcome === "talked" ? "Notes from the call: what they need, timing, next step" : "Anything to add (optional)"}
                  aria-label="Call notes"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-y"
                />
                {confirming ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium whitespace-pre-wrap">Are you sure? Log &quot;{lineFor()}&quot; on this lead.</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void doLog()}
                        className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
                      >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {saving ? "Saving..." : "Yes, log it"}
                      </button>
                      <button type="button" disabled={saving} onClick={() => setConfirming(false)} className="h-10 px-3 rounded-md border border-border text-sm">
                        Back
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="h-10 px-4 rounded-md border border-primary/50 text-primary text-sm font-semibold"
                  >
                    Save to the log
                  </button>
                )}
                {err && <p className="text-sm text-destructive">{err}</p>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
