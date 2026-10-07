"use client";

// Sales pieces of the lead card: the suggested next touch from the
// follow-up schedule, "Job done" on won jobs, and referral partners.

import { useMemo, useState } from "react";
import { CalendarPlus, CheckCircle2, Handshake, Mail, MessageSquare, Phone, Search } from "lucide-react";
import { useAuth } from "@/context/auth-provider";
import { cn } from "@/lib/utils";
import { money } from "@/lib/proposal";
import { nextCadenceStep, type CadenceStep } from "@/lib/cadence";
import { quoteLastValidDay } from "@/lib/proposal";
import { fillText, LEAD_TEXT_TEMPLATES, type TemplateExtras } from "@/lib/lead-email-templates";
import { STAGE_LABELS, isPastDue, smsUrl, type Lead, type LeadActivity, type LeadStage } from "@/lib/leads";
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
  // The customer-facing "good through" day.
  const exp = lead.quote?.sentAt ? quoteLastValidDay(lead.quote) : null;
  return { quoteUrl: lead.quote?.url || "", expires: exp ? plainDate(exp) : "", reviewUrl: reviewUrl || "" };
}

function whenText(date: string, today: string): { text: string; cls: string } {
  if (isPastDue(date, today)) return { text: "overdue", cls: "text-destructive font-semibold" };
  if (date === today) return { text: "today", cls: "text-secondary font-semibold" };
  return { text: plainDate(date), cls: "text-muted-foreground" };
}

/**
 * The schedule's next step with a one-tap button that opens the right thing
 * already filled in: Messages with a starter text, the phone dialer, or the
 * card's Email composer with a starter email. Nothing sends by itself.
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

/**
 * "Schedule the job" on a won job: puts it on the FiberNorth Jobs calendar
 * (Admin -> Calendar) and takes the lead off "To schedule". Rescheduling
 * moves the same calendar event.
 */
export function ScheduleJob({ lead, today, onSave }: { lead: Lead; today: string; onSave: SaveFn }) {
  const { getIdToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [f, setF] = useState({
    date: lead.jobScheduledAt || "",
    endDate: lead.jobEndAt || "",
    time: "",
    notes: "",
  });
  if (lead.stage !== "won" || lead.jobDoneAt) return null;

  const save = async () => {
    setErr("");
    setBusy(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const title = `${lead.name || "Job"}${lead.serviceType ? `: ${lead.serviceType.replace(/-/g, " ")}` : ""}`;
      const notes = [
        f.notes.trim(),
        lead.phone ? `Phone: ${lead.phone}` : "",
        lead.contactName ? `Contact: ${lead.contactName}` : "",
        lead.saleAmount ? `Sale: $${lead.saleAmount}` : "",
        `Lead: https://fibernorth.com/admin/leads?lead=${lead.id}`,
      ]
        .filter(Boolean)
        .join("\n");
      const res = await fetch("/api/admin/calendar", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          leadId: lead.id,
          eventId: lead.jobEventId || undefined,
          job: { title, date: f.date, endDate: f.time ? "" : f.endDate, time: f.time, location: lead.address || "", notes },
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; id?: string; htmlLink?: string };
      if (!res.ok || !json.id) throw new Error(json.error || `Couldn't add it to the calendar (${res.status})`);
      const days = f.endDate && !f.time && f.endDate > f.date ? `${plainDate(f.date)} to ${plainDate(f.endDate)}` : plainDate(f.date);
      const r = await onSave(
        lead,
        {
          jobScheduledAt: f.date,
          jobEndAt: f.time ? "" : f.endDate,
          jobEventId: json.id,
          jobEventLink: json.htmlLink || "",
          nextAction: "Job day",
          nextActionAt: f.date,
        },
        { ts: now(), type: "system", text: `${lead.jobScheduledAt ? "Job moved to" : "Job scheduled for"} ${days} on the jobs calendar` }
      );
      if (r === "error") throw new Error("It's on the calendar, but the lead didn't save. Try again.");
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't schedule the job");
    } finally {
      setBusy(false);
    }
  };

  const input = "px-3 py-2 bg-muted border border-border rounded-md text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary";
  return (
    <div className="space-y-2">
      {lead.jobScheduledAt && !open ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <CalendarPlus className="h-4 w-4 text-primary" />
          <span>
            Job scheduled {plainDate(lead.jobScheduledAt)}
            {lead.jobEndAt && lead.jobEndAt > lead.jobScheduledAt ? ` to ${plainDate(lead.jobEndAt)}` : ""}
          </span>
          {lead.jobEventLink && (
            <a href={lead.jobEventLink} target="_blank" rel="noopener noreferrer" className="text-primary underline">
              Calendar
            </a>
          )}
          <button type="button" onClick={() => setOpen(true)} className={cn("underline text-muted-foreground px-1", tap)}>
            Change
          </button>
        </div>
      ) : !open ? (
        <button
          type="button"
          onClick={() => {
            setF((x) => ({ ...x, date: x.date || today }));
            setOpen(true);
          }}
          className={cn(btn, "border-primary text-primary")}
        >
          <CalendarPlus className="h-4 w-4" />
          Schedule the job
        </button>
      ) : null}
      {open && (
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-xs space-y-1">
              <span className="block text-muted-foreground">First day</span>
              <input id={`job-day-${lead.id}`} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={input} />
            </label>
            <label className="text-xs space-y-1">
              <span className="block text-muted-foreground">Start time (blank = all day)</span>
              <input id={`job-time-${lead.id}`} type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} className={input} />
            </label>
            {!f.time && (
              <label className="text-xs space-y-1">
                <span className="block text-muted-foreground">Last day (multi-day)</span>
                <input
                  id={`job-end-${lead.id}`}
                  type="date"
                  min={f.date}
                  value={f.endDate}
                  onChange={(e) => setF({ ...f, endDate: e.target.value })}
                  className={input}
                />
              </label>
            )}
          </div>
          <input
            id={`job-notes-${lead.id}`}
            value={f.notes}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
            placeholder="Crew, drill, locate ticket… (phone and lead link are added)"
            className={cn(input, "w-full")}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !f.date}
              onClick={() => void save()}
              className={cn(btn, "bg-primary text-primary-foreground border-primary")}
            >
              {busy ? "Adding…" : lead.jobScheduledAt ? "Move the job" : "Add to jobs calendar"}
            </button>
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className={cn(btn, "border-border")}>
              Cancel
            </button>
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
      )}
    </div>
  );
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

/**
 * "Contractor account" switch: they keep calling with work, so each job is
 * its own lead under them and the account itself is never due or stale.
 */
export function AccountToggle({ lead, onSave }: { lead: Lead; onSave: SaveFn }) {
  const [busy, setBusy] = useState(false);
  if (lead.parentLeadId) return null; // a job can't be an account
  return (
    <label className={cn("flex items-start gap-3 text-sm cursor-pointer", busy && "opacity-60")}>
      <input
        type="checkbox"
        className="mt-0.5 h-5 w-5 accent-primary"
        checked={Boolean(lead.isAccount)}
        disabled={busy}
        onChange={async (e) => {
          const on = e.target.checked;
          setBusy(true);
          await onSave(
            lead,
            { isAccount: on },
            { ts: now(), type: "system", text: on ? "Made a contractor account (jobs are their own leads)" : "No longer a contractor account" }
          );
          setBusy(false);
        }}
      />
      <span>
        <span className="font-medium">Contractor account</span>
        <span className="block text-muted-foreground">
          They send repeat work. Every job is its own lead under them with its own quote, walk and job day. The account
          itself never shows as due or stale.
        </span>
      </span>
    </label>
  );
}

/** "Contractor · 4 jobs (2 open)" in an account's header. */
export function AccountLine({ lead, leads }: { lead: Lead; leads: Lead[] }) {
  const jobs = useMemo(() => leads.filter((l) => l.parentLeadId === lead.id), [leads, lead.id]);
  if (!lead.isAccount) return null;
  const open = jobs.filter((j) => !["won", "lost", "not_a_lead"].includes(String(j.stage))).length;
  return (
    <span className="text-accent font-medium">
      Contractor · {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
      {open ? ` (${open} open)` : ""}
    </span>
  );
}

/** "Job for Popp Excavating" on a job under a contractor account. */
export function ParentChip({ lead, leads, onOpenLead }: { lead: Lead; leads: Lead[]; onOpenLead: (id: string) => void }) {
  if (!lead.parentLeadId) return null;
  const parent = leads.find((l) => l.id === lead.parentLeadId);
  return (
    <span
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onOpenLead(lead.parentLeadId!);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.stopPropagation();
          onOpenLead(lead.parentLeadId!);
        }
      }}
      className="text-primary hover:underline cursor-pointer"
    >
      Job for {parent?.name || "contractor"}
    </span>
  );
}

/**
 * A contractor account's jobs: each one is its own lead (stage, quotes,
 * walk, job day) linked back here. "New job" starts one with the
 * contractor's contact info filled in.
 */
export function ContractorJobs({
  lead,
  leads,
  today,
  onOpenLead,
  onCreate,
}: {
  lead: Lead;
  leads: Lead[];
  today: string;
  onOpenLead: (id: string) => void;
  onCreate: (input: { name: string; address: string; serviceType: string; notes: string; contactName: string }) => Promise<string | null>;
}) {
  const jobs = useMemo(
    () =>
      leads
        .filter((l) => l.parentLeadId === lead.id && l.id !== lead.id)
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    [leads, lead.id]
  );
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ address: "", name: "", serviceType: "", notes: "", contactName: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (lead.parentLeadId) return null; // a job isn't an account itself
  // Only accounts (or a lead that already has jobs) get the Jobs section.
  if (!lead.isAccount && jobs.length === 0) return null;
  const won = jobs.filter((j) => j.stage === "won").length;
  const open = jobs.filter((j) => !["won", "lost", "not_a_lead"].includes(String(j.stage))).length;
  const input = "px-3 py-2 bg-muted border border-border rounded-md text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary";

  const create = async () => {
    setErr("");
    setBusy(true);
    const name = f.name.trim() || `${lead.name || "Job"}: ${f.address.trim() || "new job"}`;
    const e = await onCreate({ ...f, name });
    setBusy(false);
    if (e) {
      setErr(e);
      return;
    }
    setF({ address: "", name: "", serviceType: "", notes: "", contactName: "" });
    setAdding(false);
  };

  return (
    <div className="border-t border-border pt-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">
          Jobs{jobs.length ? ` (${jobs.length} · ${open} open · ${won} won)` : ""}
        </p>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={cn(btn, "border-border text-xs")}>
            + New job
          </button>
        )}
      </div>
      {jobs.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">
          A contractor who&apos;ll send more than one job? Add each job here. Each gets its own stage, quote, walk and job day.
        </p>
      )}
      {jobs.length > 0 && (
        <ul className="space-y-1 text-sm">
          {jobs.map((j) => {
            const due = j.nextActionAt || "";
            return (
              <li key={j.id} className="flex flex-wrap items-baseline gap-x-2">
                <button type="button" onClick={() => onOpenLead(j.id)} className={cn("text-primary hover:underline text-left", tap)}>
                  {j.address || j.name || "(no address)"}
                </button>
                <span className="text-muted-foreground">{STAGE_LABELS[j.stage as LeadStage] ?? j.stage}</span>
                {j.quote?.status && <span className="text-xs text-muted-foreground">quote {j.quote.status}</span>}
                {j.jobScheduledAt && <span className="text-xs text-accent">job {plainDate(j.jobScheduledAt)}</span>}
                {due && j.nextAction && !["lost", "not_a_lead"].includes(String(j.stage)) && (
                  <span className={cn("text-xs", isPastDue(due, today) ? "text-destructive font-semibold" : "text-muted-foreground")}>
                    {isPastDue(due, today) ? "overdue" : plainDate(due)} {j.nextAction}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {adding && (
        <div className="rounded-md border border-border p-3 space-y-2">
          <input
            autoFocus
            aria-label="Job site address"
            value={f.address}
            onChange={(e) => setF({ ...f, address: e.target.value })}
            placeholder="Job site address"
            className={cn(input, "w-full")}
          />
          <input
            aria-label="Job name"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder={`Name (default: ${lead.name || "Contractor"}: address)`}
            className={cn(input, "w-full")}
          />
          <div className="grid sm:grid-cols-2 gap-2">
            <input
              aria-label="On-site contact"
              value={f.contactName}
              onChange={(e) => setF({ ...f, contactName: e.target.value })}
              placeholder="On-site contact (optional)"
              className={input}
            />
            <input
              aria-label="Service"
              value={f.serviceType}
              onChange={(e) => setF({ ...f, serviceType: e.target.value })}
              placeholder="What's the work? (bore, water line…)"
              className={input}
            />
          </div>
          <textarea
            aria-label="Notes"
            rows={2}
            value={f.notes}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
            placeholder="Notes"
            className={cn(input, "w-full")}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || (!f.address.trim() && !f.name.trim())}
              onClick={() => void create()}
              className={cn(btn, "bg-primary text-primary-foreground border-primary")}
            >
              {busy ? "Adding…" : "Add job"}
            </button>
            <button type="button" disabled={busy} onClick={() => setAdding(false)} className={cn(btn, "border-border")}>
              Cancel
            </button>
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
      )}
    </div>
  );
}
