"use client";

import { useMemo, useState } from "react";
import { Building2, ChevronDown, ChevronUp, Phone } from "lucide-react";
import { contractorGroups, jobQuoteText, jobValue, type ContractorGroup } from "@/lib/contractors";
import { STAGE_LABELS, isPastDue, type Lead, type LeadStage } from "@/lib/leads";
import { money } from "@/lib/proposal";
import { plainDate } from "@/components/admin/lead-sales";
import { buildHaystack, matchesSearch } from "@/lib/quote-search";
import { cn } from "@/lib/utils";

// The Contractors tab on the Leads page: each contractor account with its
// jobs (each job is its own lead) and totals. Tapping the account or a job
// opens that lead's card.

const tap = "min-h-11 sm:min-h-0";
const shortDate = (ymd: string) => plainDate(ymd).replace(/^(\w{3})\w*/, "$1");

export function ContractorsView({
  leads,
  today,
  onOpenLead,
}: {
  /** The leads this person may see (private ones already left out). */
  leads: Lead[];
  today: string;
  onOpenLead: (id: string) => void;
}) {
  const groups = useMemo(() => contractorGroups(leads), [leads]);
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    if (!q.trim()) return groups;
    return groups.filter((g) =>
      matchesSearch(
        q,
        buildHaystack(
          [g.account.name, g.account.contactName, g.account.email, g.account.address, ...g.jobs.flatMap((j) => [j.name, j.address])],
          [g.account.phone]
        )
      )
    );
  }, [groups, q]);
  const sum = useMemo(
    () =>
      groups.reduce(
        (a, g) => ({ open: a.open + g.totals.open, won: a.won + g.totals.wonDollars, done: a.done + g.totals.done }),
        { open: 0, won: 0, done: 0 }
      ),
    [groups]
  );

  if (groups.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-10 text-center text-muted-foreground">
        No contractor accounts yet. Open a contractor&apos;s lead and check &quot;Contractor account&quot;, then add each job under it.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>
          {groups.length} contractor{groups.length === 1 ? "" : "s"}
        </span>
        <span>{sum.open} open jobs</span>
        <span>{money(sum.won)} won</span>
        <span>{sum.done} done</span>
      </div>
      {groups.length > 4 && (
        <input
          aria-label="Find a contractor"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a contractor or job address"
          className="w-full px-3 py-2 min-h-11 sm:min-h-0 bg-muted border border-border rounded-md text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      )}
      {shown.length === 0 && <p className="text-sm text-muted-foreground">No contractor matches.</p>}
      {shown.map((g) => (
        <ContractorCard key={g.account.id} group={g} today={today} onOpenLead={onOpenLead} />
      ))}
    </div>
  );
}

function ContractorCard({ group, today, onOpenLead }: { group: ContractorGroup; today: string; onOpenLead: (id: string) => void }) {
  const { account: a, jobs, totals: t } = group;
  // Jobs that are still in play show by default; closed ones on request.
  const [showAll, setShowAll] = useState(false);
  const active = jobs.filter((j) => !["lost", "not_a_lead"].includes(String(j.stage)) && !j.jobDoneAt);
  const list = showAll ? jobs : active;
  const hidden = jobs.length - active.length;
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => onOpenLead(a.id)}
            className={cn("flex items-center gap-2 font-semibold text-left hover:text-primary", tap)}
          >
            <Building2 className="h-4 w-4 text-accent shrink-0" />
            {a.name || "(no name)"}
          </button>
          <p className="text-sm text-muted-foreground">
            {[a.contactName, a.phone, a.email].filter(Boolean).join(" · ") || "No contact info"}
          </p>
        </div>
        {a.phone && (
          <a href={`tel:${a.phone.replace(/[^\d+]/g, "")}`} className={cn("px-3 py-1.5 rounded-md text-sm border border-border flex items-center gap-1.5 hover:bg-muted", tap)}>
            <Phone className="h-4 w-4" /> Call
          </a>
        )}
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <Stat label="Jobs" value={String(t.jobs)} />
        <Stat label="Open" value={String(t.open)} strong={t.open > 0} />
        <Stat
          label="Won"
          value={`${money(t.wonDollars)}${t.won ? ` (${t.won})` : ""}`}
          note={t.wonUnpriced ? `${t.wonUnpriced} with no amount` : ""}
        />
        <Stat label="Done" value={String(t.done)} note={t.scheduled ? `${t.scheduled} scheduled` : ""} />
      </dl>
      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No jobs yet. Open the contractor and use &quot;+ New job&quot;.</p>
      ) : (
        <>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs in play.</p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {list.map((j) => (
                <JobRow key={j.id} job={j} today={today} onOpen={() => onOpenLead(j.id)} />
              ))}
            </ul>
          )}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className={cn("text-sm text-muted-foreground underline flex items-center gap-1", tap)}
            >
              {showAll ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showAll ? "Hide done and closed jobs" : `Show ${hidden} done or closed job${hidden === 1 ? "" : "s"}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note, strong }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2">
      <dt className="text-xs text-muted-foreground uppercase tracking-wider">{label}</dt>
      <dd className={cn("tabular-nums", strong && "text-primary font-semibold")}>{value}</dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}

function JobRow({ job: j, today, onOpen }: { job: Lead; today: string; onOpen: () => void }) {
  const quote = jobQuoteText(j, today);
  const value = j.stage === "won" ? jobValue(j) : null;
  const due = j.nextActionAt || "";
  const closed = ["lost", "not_a_lead"].includes(String(j.stage));
  return (
    <li>
      <button type="button" onClick={onOpen} className={cn("w-full text-left py-2 px-1 hover:bg-muted/50 rounded-sm", tap)}>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-primary font-medium">{j.address || j.name || "(no address)"}</span>
          <span className={cn("text-xs", closed ? "text-muted-foreground line-through" : "text-muted-foreground")}>
            {STAGE_LABELS[j.stage as LeadStage] ?? j.stage}
          </span>
          {value !== null && <span className="text-xs text-accent tabular-nums">{money(value)}</span>}
        </div>
        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {j.address && j.name && j.name !== j.address && <span>{j.name}</span>}
          {quote.status ? (
            <span className={cn(quote.status === "expired" && "text-destructive")}>
              Quote {quote.status}
              {quote.total !== null ? ` ${money(quote.total)}` : ""}
              {quote.count > 1 ? ` (${quote.count} quotes)` : ""}
            </span>
          ) : (
            <span>No quote yet</span>
          )}
          {j.jobScheduledAt && (
            <span className="text-accent">
              Scheduled {shortDate(j.jobScheduledAt)}
              {j.jobEndAt && j.jobEndAt !== j.jobScheduledAt ? `–${shortDate(j.jobEndAt)}` : ""}
            </span>
          )}
          {j.jobDoneAt && <span className="text-accent">Done {shortDate(j.jobDoneAt)}</span>}
          {due && j.nextAction && !closed && !j.jobDoneAt && (
            <span className={cn(isPastDue(due, today) && "text-destructive font-semibold")}>
              {isPastDue(due, today) ? "overdue" : shortDate(due)}: {j.nextAction}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}
