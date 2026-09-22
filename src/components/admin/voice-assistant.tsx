"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, X, Loader2, Check, Send } from "lucide-react";
import { useAuth } from "@/context/auth-provider";

// Floating mic button for the admin. Speech goes through the browser's own
// speech recognition (no audio leaves the phone), the text goes to
// /api/assistant which plans a set of pipeline changes, and nothing is saved
// until the user taps Confirm.

interface PlannedAction {
  tool: string;
  input: Record<string, unknown>;
  label: string;
}

type SpeechRecognitionCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

function getRecognizer(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function VoiceAssistant() {
  const { getIdToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "plan" | "apply">("");
  const [reply, setReply] = useState("");
  const [actions, setActions] = useState<PlannedAction[]>([]);
  const [results, setResults] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [canListen, setCanListen] = useState(false);
  const recRef = useRef<InstanceType<SpeechRecognitionCtor> | null>(null);

  useEffect(() => {
    setCanListen(Boolean(getRecognizer()));
  }, []);

  const reset = () => {
    setText("");
    setReply("");
    setActions([]);
    setResults([]);
    setError("");
  };

  const startListening = () => {
    const Ctor = getRecognizer();
    if (!Ctor) return;
    setError("");
    setReply("");
    setActions([]);
    setResults([]);
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript + " ";
      setText(t.trim());
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error !== "no-speech" && e.error !== "aborted") setError(`Mic: ${e.error}`);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const stopListening = () => {
    recRef.current?.stop();
    setListening(false);
  };

  const plan = async () => {
    if (!text.trim()) return;
    stopListening();
    setBusy("plan");
    setError("");
    setReply("");
    setActions([]);
    setResults([]);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: "plan", text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      setReply(json.reply || "");
      setActions(json.actions || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy("");
    }
  };

  const apply = async () => {
    setBusy("apply");
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: "apply", actions }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      setResults(json.results || []);
      setActions([]);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy("");
    }
  };

  const removeAction = (i: number) => setActions((a) => a.filter((_, j) => j !== i));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Voice assistant"
        className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90"
      >
        <Mic className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 sm:inset-auto sm:right-5 sm:bottom-5 sm:w-[420px]">
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Tell me what happened</p>
          <button onClick={() => { stopListening(); setOpen(false); reset(); }} className="p-1 text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder={
            canListen
              ? "Tap the mic and talk, or type. Example: talked to Don Kelly, wants water and septic 400 feet, call him back Friday."
              : "Type it. Example: walked the Ellis job, quote them by Thursday."
          }
          className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
        />

        <div className="flex gap-2">
          {canListen && (
            <button
              onClick={listening ? stopListening : startListening}
              className={`flex-1 py-3 rounded-lg flex items-center justify-center gap-2 font-medium ${
                listening ? "bg-destructive text-white" : "bg-muted border border-border"
              }`}
            >
              {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              {listening ? "Stop" : "Talk"}
            </button>
          )}
          <button
            onClick={plan}
            disabled={busy !== "" || !text.trim()}
            className="flex-1 py-3 rounded-lg bg-primary text-primary-foreground flex items-center justify-center gap-2 font-medium disabled:opacity-50"
          >
            {busy === "plan" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            Do it
          </button>
        </div>

        {error && (
          <div className="border border-destructive/50 bg-destructive/10 text-destructive rounded-md p-3 text-sm">{error}</div>
        )}

        {reply && <p className="text-sm">{reply}</p>}

        {actions.length > 0 && (
          <div className="space-y-2">
            <ul className="space-y-1.5">
              {actions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm bg-muted/60 rounded-md px-3 py-2">
                  <span className="flex-1">{a.label}</span>
                  <button onClick={() => removeAction(i)} className="text-muted-foreground" aria-label="Remove">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              onClick={apply}
              disabled={busy !== ""}
              className="w-full py-3 rounded-lg bg-accent text-white flex items-center justify-center gap-2 font-medium disabled:opacity-50"
            >
              {busy === "apply" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              Confirm and save
            </button>
          </div>
        )}

        {results.length > 0 && (
          <ul className="text-sm space-y-1">
            {results.map((r, i) => (
              <li key={i} className={r.startsWith("Failed") ? "text-destructive" : "text-accent"}>
                {r}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
