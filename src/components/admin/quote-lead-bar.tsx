"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, MessageSquare, Phone, Loader2, ExternalLink } from "lucide-react";
import { useAuth } from "@/context/auth-provider";
import { useFirestoreDocument } from "@/hooks/use-firestore-document";
import { saveLead } from "@/actions/leads";
import { emailLead } from "@/actions/lead-email";
import { billPhoneFor } from "@/lib/bill-phone";
import { AddToCalendar } from "@/components/admin/add-to-calendar";
import { useToday } from "@/hooks/use-today";
import { cn } from "@/lib/utils";
import {
  STAGE_LABELS,
  businessDaysBetween,
  followUpOf,
  isPastDue,
  smsUrl,
  type Lead,
  type LeadActivity,
  type LeadStage,
} from "@/lib/leads";

// The lead on top of a quote: who it is, where things stand, and call /
// text / email from right here. Whatever is logged goes on the lead's
// history, the same as from the lead card.

const btn =
  "px-3 py-1.5 min-h-11 sm:min-h-0 rounded-md text-sm border border-border flex items-center gap-1.5 hover:border-primary hover:text-primary";
const input =
  "w-full px-3 py-2 bg-muted border border-border rounded-md text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary";
const now = () => new Date().toISOString();

function lastContactText(d: string | undefined, today: string): string {
  if (!d) return "never contacted";
  if (d >= today) return "last contact today";
  const n = businessDaysBetween(d, today);
  return `last contact ${n} business day${n === 1 ? "" : "s"} ago`;
}

export function QuoteLeadBar({
  leadId,
  quoteUrl,
  quoteLabel,
  actions,
}: {
  leadId: string;
  /** The customer's proposal link, offered in the email. */
  quoteUrl?: string;
  quoteLabel?: string;
  /** More buttons for the quote, shown beside Add to calendar (e.g. QuickBooks). */
  actions?: React.ReactNode;
}) {
  const { getIdToken } = useAuth();
  const today = useToday();
  const { data: lead, loading } = useFirestoreDocument<Omit<Lead, "id">>(`leads/${leadId}`);
  const [logFor, setLogFor] = useState<"call" | "text" | null>(null);
  const [mailOpen, setMailOpen] = useState(false);
  const [mail, setMail] = useState({ to: "", subject: "", body: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (loading) return <div className="h-16 rounded-lg border border-border bg-card animate-pulse" />;
  if (!lead) return null;
  const L = { ...lead, id: leadId } as Lead;
  const follow = followUpOf(L, today);
  const phone = (L.phone || "").trim();
  const email = (L.email || "").trim();

  const log = async (activity: LeadActivity, done: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const r = await saveLead(leadId, {}, activity, token);
      if (!r.ok) throw new Error(r.error);
      setMsg({ ok: true, text: done });
      setLogFor(null);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't log it" });
    } finally {
      setBusy(false);
    }
  };

  const openMail = () => {
    const first = (L.contactName || L.name || "").split(/\s+/)[0] || "there";
    setMail({
      to: email,
      subject: quoteLabel ? `Your FiberNorth quote: ${quoteLabel}` : "Your FiberNorth quote",
      body: `Hi ${first},\n\n${
        quoteUrl ? `Here's the link to your quote: ${quoteUrl}\n\n` : ""
      }Let me know if you have any questions, or if you'd like to get on the schedule.\n\nThanks,\nBill Gaylord\nFiberNorth Underground\n${billPhoneFor(L.source)}`,
    });
    setMailOpen(true);
    setMsg(null);
  };

  const sendMail = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const r = await emailLead({ leadId, to: mail.to, subject: mail.subject, body: mail.body }, token);
      if (!r.ok) throw new Error(r.error || "Email failed");
      await saveLead(leadId, {}, { ts: now(), type: "email", text: `Emailed "${mail.subject}" to ${mail.to}` }, token);
      setMailOpen(false);
      setMsg({ ok: true, text: `Sent to ${mail.to}. Logged on the lead.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Email failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-lg">{L.name || "(no name)"}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {STAGE_LABELS[L.stage as LeadStage] ?? L.stage}
            </span>
          </div>
          <div className="text-sm text-muted-foreground">
            {[L.contactName, phone, email].filter(Boolean).join(" · ")}
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">{lastContactText(L.lastContactAt, today)}</span>
            {follow.at && (
              <>
                {" · "}
                <span className={cn(isPastDue(follow.at, today) ? "text-destructive font-semibold" : follow.at === today ? "text-secondary font-semibold" : "")}>
                  {isPastDue(follow.at, today) ? "overdue" : follow.at === today ? "today" : follow.at}
                </span>{" "}
                {follow.action}
              </>
            )}
            {L.appointmentAt && L.appointmentAt >= today && (
              <span className="text-accent"> · Walk {L.appointmentAt === today ? "today" : L.appointmentAt}</span>
            )}
          </div>
        </div>
        <Link href={`/admin/leads?lead=${leadId}`} className="text-sm text-primary inline-flex items-center gap-1">
          Open lead <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {phone && (
          <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} onClick={() => setLogFor("call")} className={btn}>
            <Phone className="h-4 w-4" /> Call
          </a>
        )}
        {phone && (
          <a href={smsUrl(phone)} onClick={() => setLogFor("text")} className={btn}>
            <MessageSquare className="h-4 w-4" /> Text
          </a>
        )}
        {email && (
          <button type="button" onClick={openMail} className={btn}>
            <Mail className="h-4 w-4" /> Email
          </button>
        )}
        <AddToCalendar
          subject={{ leadId, name: L.name, address: L.address, phone, service: L.serviceType }}
          today={today}
        />
        {actions}
      </div>

      {logFor === "call" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">How&apos;d the call go?</span>
          <button disabled={busy} className={btn} onClick={() => log({ ts: now(), type: "call", text: "Talked (from the quote)" }, "Logged: talked.")}>
            Talked
          </button>
          <button disabled={busy} className={btn} onClick={() => log({ ts: now(), type: "attempt", text: "No answer (from the quote)" }, "Logged: no answer.")}>
            No answer
          </button>
          <button disabled={busy} className={btn} onClick={() => log({ ts: now(), type: "attempt", text: "Left a voicemail (from the quote)" }, "Logged: left a voicemail.")}>
            Left VM
          </button>
          <button className="text-muted-foreground underline px-1" onClick={() => setLogFor(null)}>
            Skip
          </button>
        </div>
      )}
      {logFor === "text" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Sent the text?</span>
          <button disabled={busy} className={btn} onClick={() => log({ ts: now(), type: "text", text: "Texted (from the quote)" }, "Logged: texted.")}>
            Yes, log it
          </button>
          <button className="text-muted-foreground underline px-1" onClick={() => setLogFor(null)}>
            Skip
          </button>
        </div>
      )}

      {mailOpen && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <input aria-label="To" value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })} className={input} />
          <input aria-label="Subject" value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} className={input} />
          <textarea aria-label="Message" rows={7} value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} className={input} />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !mail.to.trim() || !mail.subject.trim() || !mail.body.trim()}
              onClick={() => void sendMail()}
              className="px-4 py-2 rounded-md text-sm bg-primary text-primary-foreground font-semibold disabled:opacity-50 flex items-center gap-2"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send email
            </button>
            <button type="button" onClick={() => setMailOpen(false)} className="px-4 py-2 rounded-md text-sm border border-border">
              Cancel
            </button>
          </div>
        </div>
      )}
      {msg && <p className={cn("text-sm", msg.ok ? "text-accent" : "text-destructive")}>{msg.text}</p>}
    </div>
  );
}
