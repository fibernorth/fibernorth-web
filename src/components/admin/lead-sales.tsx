"use client";

// Sales pieces of the lead card: the suggested next touch from the
// follow-up schedule, "Job done" on won jobs, and referral partners.

import { useMemo, useState } from "react";
import { CheckCircle2, Handshake, Mail, MessageSquare, Phone, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { money } from "@/lib/proposal";
import { nextCadenceStep, quoteExpiryDate, type CadenceStep } from "@/lib/cadence";
import { fillText, LEAD_TEXT_TEMPLATES, type TemplateExtras } from "@/lib/lead-email-templates";
import { STAGE_LABELS, smsUrl, type Lead, type LeadActivity, type LeadStage } from "@/lib/leads";
import { feePct, partnerName, partnerStats, referralFee, searchPartners, DEFAULT_REFERRAL_PCT } from "@/lib/referrals";

export type SaveResult = "ok" | "queued" | "error";
export type SaveFn = (lead: Lead, patch: Partial<Lead>, activity?: LeadActivity) => Promise<SaveResult>;

const now = () => new Date().toISOString();
const tap = "min-h-11 sm:min-h-0";
const btn = cn("px-3 py-1.5 rounded-md text-sm border flex items-center justify-center gap-1.5 disabled:opacity-50", tap);

/** "October 1" for a YYYY-MM-DD. */
export function plainDate(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return isNaN(d.getTime()) ? ymd : d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

/** Link, expiry and review URL for filling a starter on this lead. */
export function templateExtras(lead: Lead, reviewUrl?: string): TemplateExtras {
  const exp = quoteExpiryDate(lead.quote);
  return { quoteUrl: lead.quote?.url || "", expires: exp ? plainDate(exp) : "", reviewUrl: reviewUrl || "" };
}

function whenText(date: string, today: string): { text: string; cls: string } {
  if (date < today) return { text: "overdue", cls: "text-destructive font-semibold" };
  if (date === today) return { text: "today", cls: "text-secondary font-semibold" };
  return { text: plainDate(date), cls: "text-muted-foreground" };
}

/**
 * The schedule's next step with a one-tap button that opens the right thing
 * already filled in: Messages with a starter text, the phone dialer, or the
 * card's email box with a starter email. Nothing sends by itself.
 */
export function SuggestedStep({
  lead,
  today,
  reviewUrl,
  onCallTap,
  onEmail,
  onSave,
}: {
  lead: Lead;
  today: string;
  reviewUrl?: string;
  onCallTap: (id: string) => void;
  onEmail: (templateKey: string) => void;
  onSave: SaveFn;
}) {
  const step = useMemo(() => nextCadenceStep(lead, today), [lead, today]);
  const [askLog, setAskLog] = useState(false);
  const [msg, setMsg] = useState("");
  if (!step) return null;

  const when = whenText(step.date, today);
  const textKey = step.templateKey;
  const body = fillText(textKey, lead, templateExtras(lead, reviewUrl));
  const phone = lead.phone || "";
  const showCall = step.kind === "call" || step.kind === "call+text";
  const showText = step.kind === "text" || step.kind === "call+text";
  const showEmail = step.kind === "email";

  const logText = async () => {
    const label = LEAD_TEXT_TEMPLATES.find((t) => t.key === textKey)?.label || "text";
    const r = await onSave(lead, {}, { ts: now(), type: "text", text: `Texted (${label.toLowerCase()} starter)` });
    setAskLog(false);
    setMsg(r === "queued" ? "No signal. Saved on this phone." : r === "ok" ? "Logged." : "");
    setTimeout(() => setMsg(""), 4000);
  };

  return (
    <div className="mx-4 mb-3 rounded-md border border-secondary/40 bg-secondary/5 px-3 py-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm flex-1 min-w-[12rem]">
          <span className="text-muted-foreground">Next touch: </span>
          <span className="font-medium">{step.label}</span>{" "}
          <span className={when.cls}>{when.text}</span>
          <StepHint step={step} />
        </p>
        <div className="flex flex-wrap gap-2">
          {showCall && phone && (
            <a href={`tel:${phone}`} onClick={() => onCallTap(lead.id)} className={cn(btn, "border-primary/50 text-primary")}>
              <Phone className="h-4 w-4" />
              Call
            </a>
          )}
          {showText && phone && (
            <a href={smsUrl(phone, body)} onClick={() => setAskLog(true)} className={cn(btn, "border-primary/50 text-primary")}>
              <MessageSquare className="h-4 w-4" />
              Text it
            </a>
          )}
          {showEmail && (
            <button type="button" onClick={() => onEmail(step.templateKey)} className={cn(btn, "border-primary/50 text-primary")}>
              <Mail className="h-4 w-4" />
              Write the email
            </button>
          )}
        </div>
      </div>
      {askLog && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">Sent the text?</span>
          <button type="button" onClick={logText} className={cn(btn, "border-primary text-primary")}>
            Log it
          </button>
          <button type="button" onClick={() => setAskLog(false)} className={cn(btn, "border-border text-muted-foreground")}>
            Not now
          </button>
        </div>
      )}
      {msg && <p className="text-sm text-accent">{msg}</p>}
    </div>
  );
}

function StepHint({ step }: { step: CadenceStep }) {
  const hint =
    step.track === "quote" && step.key !== "quote:expiring"
      ? " (quote follow-up)"
      : step.track === "new"
        ? " (new lead)"
        : "";
  return hint ? <span className="text-muted-foreground">{hint}</span> : null;
}

/** "Job done" on a won job: logs it and sets the review ask for 2 days out. */
export function JobDone({ lead, today, onSave }: { lead: Lead; today: string; onSave: SaveFn }) {
  const [busy, setBusy] = useState(false);
  if (lead.stage !== "won") return null;
  if (lead.jobDoneAt) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <CheckCircle2 className="h-4 w-4 text-accent" />
        <span>Job done {lead.jobDoneAt}</span>
        <button
          type="button"
          disabled={busy}
          className={cn("underline text-muted-foreground px-1", tap)}
          onClick={async () => {
            setBusy(true);
            await onSave(lead, { jobDoneAt: "" }, { ts: now(), type: "system", text: "Job done taken back" });
            setBusy(false);
          }}
        >
          Undo
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await onSave(lead, { jobDoneAt: today }, { ts: now(), type: "note", text: "Job done" });
        setBusy(false);
      }}
      className={cn(btn, "border-accent text-accent")}
    >
      <CheckCircle2 className="h-4 w-4" />
      Job done
    </button>
  );
}

/**
 * Who sent this job, and the partner's fee once it's won. Pick a partner
 * from a search of the contractor list (or any lead).
 */
export function ReferralPanel({
  lead,
  leads,
  today,
  onSave,
  onOpenLead,
}: {
  lead: Lead;
  leads: Lead[];
  today: string;
  onSave: SaveFn;
  onOpenLead: (id: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [pct, setPct] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const partner = lead.referredBy ? leads.find((l) => l.id === lead.referredBy) : undefined;
  const results = useMemo(() => (picking ? searchPartners(leads, q, lead.id) : []), [picking, leads, q, lead.id]);
  const fee = referralFee(lead);
  const pctValue = pct ?? String(feePct(lead));

  const run = async (patch: Partial<Lead>, text?: string) => {
    setBusy(true);
    await onSave(lead, patch, text ? { ts: now(), type: "system", text } : undefined);
    setBusy(false);
  };

  const inputCls =
    "w-full px-3 py-2 min-h-11 sm:min-h-0 bg-muted border border-border rounded-md text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Handshake className="h-4 w-4 text-muted-foreground" />
        {lead.referredBy ? (
          <>
            <span className="text-muted-foreground">Referred by</span>
            {partner ? (
              <button type="button" onClick={() => onOpenLead(partner.id)} className={cn("text-primary hover:underline text-left", tap)}>
                {partnerName(partner)}
              </button>
            ) : (
              <span className="text-muted-foreground">(partner lead was deleted)</span>
            )}
            <button type="button" onClick={() => setPicking((v) => !v)} className={cn("underline text-muted-foreground px-1", tap)}>
              Change
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run({ referredBy: "" }, `Referral partner removed${partner ? ` (${partner.name})` : ""}`)}
              className={cn("underline text-muted-foreground px-1", tap)}
            >
              Remove
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setPicking((v) => !v)} className={cn(btn, "border-border")}>
            {picking ? "Cancel" : "Referred by a partner?"}
          </button>
        )}
      </div>

      {picking && (
        <div className="space-y-2 border border-border rounded-md p-3 bg-muted/30">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Contractor name, contact or phone"
              className={cn(inputCls, "pl-9")}
            />
          </div>
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">No match. Add the partner as a lead first (source: Contractor letter).</p>
          ) : (
            <ul className="space-y-1">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      await run(
                        {
                          referredBy: p.id,
                          referralFeePct: lead.referralFeePct ?? DEFAULT_REFERRAL_PCT,
                          ...(lead.referralFeeStatus ? {} : { referralFeeStatus: "owed" as const }),
                        },
                        `Referred by ${p.name || "a partner"}`
                      );
                      setPicking(false);
                      setQ("");
                    }}
                    className={cn("w-full text-left px-3 py-2 rounded-md hover:bg-muted text-sm", tap)}
                  >
                    <span className="font-medium">{partnerName(p)}</span>
                    {p.address && <span className="block text-muted-foreground truncate">{p.address}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {lead.referredBy && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor={`pct-${lead.id}`} className="text-muted-foreground">
            Partner fee %
          </label>
          <input
            id={`pct-${lead.id}`}
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="0.5"
            value={pctValue}
            onChange={(e) => setPct(e.target.value)}
            className={cn(inputCls, "w-24")}
          />
          {pct !== null && pct !== String(feePct(lead)) && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                await run({ referralFeePct: Number(pct) });
                setPct(null);
              }}
              className={cn(btn, "border-border")}
            >
              Set
            </button>
          )}
        </div>
      )}

      {fee && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-sm",
            fee.status === "paid" ? "bg-muted" : "bg-secondary/10 border border-secondary/40"
          )}
        >
          <span className="flex-1 min-w-[12rem]">
            {fee.status === "paid" ? "Referral fee paid" : "Referral fee owed"}:{" "}
            <span className="font-semibold tabular-nums">{money(fee.amount)}</span>{" "}
            <span className="text-muted-foreground">
              ({fee.pct}% of {money(fee.sale)}){fee.paidAt ? ` on ${fee.paidAt}` : ""}
            </span>
          </span>
          {fee.status === "owed" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(
                  { referralFeeStatus: "paid", referralFeePaidAt: today },
                  `Referral fee ${money(fee.amount)} paid${partner ? ` to ${partner.name}` : ""}`
                )
              }
              className={cn(btn, "border-accent text-accent")}
            >
              Mark paid
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => run({ referralFeeStatus: "owed", referralFeePaidAt: "" }, "Referral fee set back to owed")}
              className={cn("underline text-muted-foreground px-1", tap)}
            >
              Undo
            </button>
          )}
        </div>
      )}
      {lead.referredBy && lead.stage === "won" && !fee && (
        <p className="text-sm text-muted-foreground">Add the total sale under Edit details to work out the partner&apos;s fee.</p>
      )}
    </div>
  );
}

/** One line for a partner's card: jobs sent, won, dollars, fees. */
export function PartnerLine({ lead, leads }: { lead: Lead; leads: Lead[] }) {
  const s = useMemo(() => partnerStats(lead.id, leads), [lead.id, leads]);
  if (s.referred === 0) return null;
  return (
    <span className="text-accent">
      Sent us {s.referred} {s.referred === 1 ? "job" : "jobs"}
      {s.won ? ` · ${s.won} won · ${money(s.dollars)}` : ""}
      {s.feesOwed ? ` · ${money(s.feesOwed)} fee owed` : ""}
    </span>
  );
}

/** Partner's expanded card: the jobs they sent, with fee status. */
export function PartnerJobs({ lead, leads, onOpenLead }: { lead: Lead; leads: Lead[]; onOpenLead: (id: string) => void }) {
  const jobs = useMemo(
    () => leads.filter((l) => l.referredBy === lead.id && l.id !== lead.id && l.stage !== "not_a_lead"),
    [leads, lead.id]
  );
  const s = useMemo(() => partnerStats(lead.id, leads), [lead.id, leads]);
  if (jobs.length === 0) return null;
  return (
    <div className="border-t border-border pt-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Jobs this partner sent: {s.referred} · won {s.won} · {money(s.dollars)}
        {s.feesPaid ? ` · fees paid ${money(s.feesPaid)}` : ""}
        {s.feesOwed ? ` · fees owed ${money(s.feesOwed)}` : ""}
      </p>
      <ul className="space-y-1 text-sm">
        {jobs.map((j) => {
          const fee = referralFee(j);
          return (
            <li key={j.id} className="flex flex-wrap items-center gap-x-2">
              <button type="button" onClick={() => onOpenLead(j.id)} className={cn("text-primary hover:underline text-left", tap)}>
                {j.name || "(no name)"}
              </button>
              <span className="text-muted-foreground">{STAGE_LABELS[j.stage as LeadStage] ?? j.stage}</span>
              {fee && (
                <span className={fee.status === "paid" ? "text-muted-foreground" : "text-secondary font-medium"}>
                  fee {money(fee.amount)} {fee.status}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
