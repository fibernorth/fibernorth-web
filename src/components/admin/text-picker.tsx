"use client";

import { useState } from "react";
import { Copy, MessageSquare, RotateCcw, Save, X } from "lucide-react";
import { fillText, LEAD_TEXT_TEMPLATES, toTextTemplate, type TemplateExtras } from "@/lib/lead-email-templates";
import { useMyTextTemplates } from "@/hooks/use-my-text-templates";
import { smsUrl } from "@/lib/leads";
import { cn } from "@/lib/utils";

type PickerLead = { name?: string; contactName?: string; serviceType?: string; address?: string; source?: string; phone?: string };

/**
 * The Text button's starters, filled in for this lead: copy one to paste
 * anywhere, or open it in the phone's Messages app. Nothing sends from here.
 * Using one (Copy or Send in Messages) asks "Are you sure?" before it's
 * logged on the lead, and the picker stays open either way. Each text can
 * be edited first, and "Save as my default" keeps the edit (with this lead's
 * details turned back into fill-ins) for every future lead, per user.
 */
export function TextPicker({
  lead,
  extras,
  onClose,
  onLog,
}: {
  lead: PickerLead;
  extras?: TemplateExtras;
  onClose: () => void;
  /** Records that a text went out (label of the starter used), after the user confirms. */
  onLog?: (label: string) => void;
}) {
  const { texts, save } = useMyTextTemplates();
  const [copied, setCopied] = useState("");
  const [logged, setLogged] = useState<string[]>([]);
  // The starter just used, waiting on "Yes, log it".
  const [pending, setPending] = useState("");
  const markUsed = (label: string) => {
    if (onLog) setPending(label);
  };
  const confirmLog = () => {
    if (!pending || !onLog) return;
    onLog(pending);
    setLogged((l) => [...l, pending]);
    setPending("");
  };
  const phone = lead.phone || "";
  const who = (lead.contactName || lead.name || "").trim();

  const copy = async (key: string, label: string, body: string) => {
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      // Older browsers: select-and-copy fallback.
      const ta = document.createElement("textarea");
      ta.value = body;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        // nothing more to try
      }
      ta.remove();
    }
    setCopied(key);
    markUsed(label);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center">
      <div
        className="w-full max-w-lg bg-card border border-border rounded-t-2xl sm:rounded-2xl p-4 space-y-3 max-h-[85dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold">Text {who || "this lead"}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-md hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {pending && (
          <div className="sticky top-0 z-10 rounded-md border border-primary/40 bg-card p-3 space-y-2 shadow-lg">
            <p className="text-sm font-medium">Are you sure? Log &quot;Texted: {pending}&quot; on this lead.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmLog}
                className="flex-1 h-10 rounded-md bg-primary text-primary-foreground text-sm font-semibold"
              >
                Yes, log it
              </button>
              <button
                type="button"
                onClick={() => setPending("")}
                className="flex-1 h-10 rounded-md border border-border text-sm font-medium hover:bg-muted"
              >
                No
              </button>
            </div>
          </div>
        )}

        {logged.length > 0 && (
          <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
            Logged on the lead: {logged.map((l) => `Texted: ${l}`).join(", ")}
          </p>
        )}

        {LEAD_TEXT_TEMPLATES.map((t) => (
          <StarterCard
            key={t.key}
            starterKey={t.key}
            label={t.label}
            mine={fillText(t.key, lead, extras, texts)}
            hasMine={Boolean(texts[t.key])}
            phone={phone}
            copied={copied === t.key}
            onCopy={(body) => void copy(t.key, t.label, body)}
            onSend={() => markUsed(t.label)}
            onSaveDefault={(body) => save(t.key, toTextTemplate(body, lead, extras))}
            onReset={() => save(t.key, "")}
          />
        ))}
      </div>
    </div>
  );
}

/** One starter: editable text, Copy / Send, and save-as-my-default. */
function StarterCard({
  starterKey,
  label,
  mine,
  hasMine,
  phone,
  copied,
  onCopy,
  onSend,
  onSaveDefault,
  onReset,
}: {
  starterKey: string;
  label: string;
  /** What this user starts from: their saved version, or the built-in one. */
  mine: string;
  hasMine: boolean;
  phone: string;
  copied: boolean;
  onCopy: (body: string) => void;
  onSend: () => void;
  onSaveDefault: (body: string) => Promise<string>;
  onReset: () => Promise<string>;
}) {
  // Follows the saved version until the user types here.
  const [draft, setDraft] = useState<string | null>(null);
  const body = draft ?? mine;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const run = async (fn: () => Promise<string>, ok: string) => {
    setBusy(true);
    const err = await fn();
    setBusy(false);
    if (!err) setDraft(null);
    setNote(err || ok);
    setTimeout(() => setNote(""), 4000);
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">
          {label}
          {hasMine && <span className="ml-2 text-xs font-normal text-muted-foreground">(your version)</span>}
        </div>
      </div>
      <textarea
        id={`text-${starterKey}`}
        value={body}
        onChange={(e) => setDraft(e.target.value)}
        rows={5}
        aria-label={`${label} text`}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed resize-y"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onCopy(body)}
          disabled={!body.trim()}
          className={cn(
            "flex-1 h-10 rounded-md border text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50",
            copied ? "border-accent text-accent" : "border-border hover:bg-muted"
          )}
        >
          <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy"}
        </button>
        {phone && (
          <a
            href={smsUrl(phone, body)}
            onClick={onSend}
            className="flex-1 h-10 rounded-md border border-primary/50 text-primary text-sm font-medium inline-flex items-center justify-center gap-2"
          >
            <MessageSquare className="h-4 w-4" /> Send in Messages
          </a>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {draft !== null && draft !== mine && (
          <>
            <button
              type="button"
              disabled={busy || !body.trim()}
              onClick={() => void run(() => onSaveDefault(body), "Saved. This is your default for every lead now.")}
              className="h-8 px-2.5 rounded-md border border-primary/50 text-primary inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> Save as my default
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDraft(null)}
              className="h-8 px-2.5 rounded-md border border-border hover:bg-muted"
            >
              Undo edits
            </button>
          </>
        )}
        {hasMine && draft === null && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(onReset, "Back to the original text.")}
            className="h-8 px-2.5 rounded-md border border-border hover:bg-muted inline-flex items-center gap-1.5 text-muted-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Back to original
          </button>
        )}
        {note && <span className="text-accent">{note}</span>}
      </div>
    </div>
  );
}
