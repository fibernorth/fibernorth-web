"use client";

import { useState } from "react";
import { Copy, MessageSquare, X } from "lucide-react";
import { fillText, LEAD_TEXT_TEMPLATES, type TemplateExtras } from "@/lib/lead-email-templates";
import { smsUrl } from "@/lib/leads";
import { cn } from "@/lib/utils";

type PickerLead = { name?: string; contactName?: string; serviceType?: string; address?: string; source?: string; phone?: string };

/**
 * The Text button's starters, filled in for this lead: copy one to paste
 * anywhere, or open it in the phone's Messages app. Nothing sends from here.
 * Using one (Copy or Send in Messages) asks "Are you sure?" before it's
 * logged on the lead, and the picker stays open either way.
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

        {LEAD_TEXT_TEMPLATES.map((t) => {
          const body = fillText(t.key, lead, extras);
          return (
            <div key={t.key} className="rounded-lg border border-border p-3 space-y-2">
              <div className="text-sm font-medium">{t.label}</div>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{body}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void copy(t.key, t.label, body)}
                  className={cn(
                    "flex-1 h-10 rounded-md border text-sm font-medium inline-flex items-center justify-center gap-2",
                    copied === t.key ? "border-accent text-accent" : "border-border hover:bg-muted"
                  )}
                >
                  <Copy className="h-4 w-4" /> {copied === t.key ? "Copied" : "Copy"}
                </button>
                {phone && (
                  <a
                    href={smsUrl(phone, body)}
                    onClick={() => markUsed(t.label)}
                    className="flex-1 h-10 rounded-md border border-primary/50 text-primary text-sm font-medium inline-flex items-center justify-center gap-2"
                  >
                    <MessageSquare className="h-4 w-4" /> Send in Messages
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
