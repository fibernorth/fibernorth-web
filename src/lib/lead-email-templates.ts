// Starter emails for the lead card's "send this email" box. Plain, short, in
// Bill's voice. {first}, {utility} and {place} are filled from the lead; the
// estimator edits anything before it goes.

export interface LeadEmailTemplate {
  key: string;
  label: string;
  subject: string;
  body: string;
}

export const LEAD_EMAIL_TEMPLATES: LeadEmailTemplate[] = [
  {
    key: "checkin",
    label: "Checking in",
    subject: "Your {utility} line",
    body: `Hi {first},

Bill Gaylord with FiberNorth Underground. You reached out to us about running a {utility} line{place}, and I wanted to check in.

Whenever you're ready for a quote, just reply here or call or text me at (231) 944-6471 and we'll get it set up. If you have any questions before then, ask away.

Thanks,
Bill Gaylord
FiberNorth Underground`,
  },
  {
    key: "missed",
    label: "Tried to call",
    subject: "Sorry I missed you",
    body: `Hi {first},

I tried calling about the {utility} line you asked us about{place}, but didn't catch you.

When you get a minute, call or text me at (231) 944-6471, or reply here with a good time to talk. If you're not ready yet, no problem. Let me know when you are and we'll set up a quote.

Thanks,
Bill Gaylord
FiberNorth Underground`,
  },
  {
    key: "later",
    label: "Not ready yet",
    subject: "Whenever you're ready",
    body: `Hi {first},

Thanks for talking with me about the {utility} line{place}. Sounds like the timing isn't quite there yet, and that's fine.

When you're ready, reply here or call or text me at (231) 944-6471 and I'll get you a quote. If anything comes up in the meantime, I'm happy to answer questions.

Thanks,
Bill Gaylord
FiberNorth Underground`,
  },
  {
    key: "quote-followup",
    label: "Quote follow-up",
    subject: "Your quote for the {utility} line",
    body: `Hi {first},

Checking in on the quote I sent for the {utility} line{place}. Wanted to make sure it came through and see if you had any questions.{quoteLinkEmail}

If something on it doesn't fit what you had in mind, tell me and I'll adjust it. If you're ready to go, you can accept it right on that page and I'll call to set a date.

Thanks,
Bill, FiberNorth
(231) 944-6471`,
  },
  {
    key: "quote-expiring",
    label: "Quote expiring",
    subject: "Your quote is good through {expires}",
    body: `Hi {first},

Quick note. The quote for the {utility} line{place} is good through {expires}.{quoteLinkEmail}

If you want to go ahead, accept it on the page or reply here and I'll get you on the schedule. If the timing isn't right, that's fine. Let me know and I can redo it when you're ready.

Thanks,
Bill, FiberNorth
(231) 944-6471`,
  },
  {
    key: "review",
    label: "Ask for a review",
    subject: "Thanks from FiberNorth",
    body: `Hi {first},

Thanks again for having us out for the {utility} line.

If you were happy with how it went, would you leave us a Google review? It's how most people around here find us.{reviewLinkEmail}

And if anything isn't right, call or text me at (231) 944-6471 and I'll come take a look.

Thanks,
Bill, FiberNorth`,
  },
];

/**
 * Short text starters for the sms: button. Opens the phone's Messages app
 * with this filled in; nothing is sent from here.
 */
export const LEAD_TEXT_TEMPLATES: Array<{ key: string; label: string; body: string }> = [
  {
    key: "new-first",
    label: "First reply",
    body: "Hi {first}, got your request about the {utility} line{place}. Just tried to call. When's a good time to talk? Bill, FiberNorth",
  },
  {
    key: "missed",
    label: "Tried to call",
    body: "Hi {first}, tried you again about the {utility} line. Still want a quote? Call or text when it suits you, or send me a good time and I'll call. Bill, FiberNorth",
  },
  {
    key: "quote-followup",
    label: "Quote follow-up",
    body: "Hi {first}, making sure the quote for the {utility} line came through OK. Any questions on it, just ask.{quoteLinkText} Bill, FiberNorth",
  },
  {
    key: "quote-expiring",
    label: "Quote expiring",
    body: "Hi {first}, heads up, the quote for the {utility} line is good through {expires}. If you want to go ahead, accept it on the page or text me back.{quoteLinkText} Bill, FiberNorth",
  },
  {
    key: "review",
    label: "Ask for a review",
    body: "Hi {first}, thanks again for having us out. If you were happy with the job, a Google review would help us a lot.{reviewLinkText} Bill, FiberNorth",
  },
];

/** Extra details some starters use: the quote link, its end date, the review link. */
export interface TemplateExtras {
  quoteUrl?: string;
  /** Plain date, e.g. "October 24" */
  expires?: string;
  reviewUrl?: string;
}

/** Plain words for the utility a lead asked about. */
export function utilityWords(serviceType: string | undefined): string {
  const s = (serviceType || "").toLowerCase().replace(/[-_]/g, " ").trim();
  if (!s || s.startsWith("sub /")) return "utility";
  if (s.includes("internet") || s.includes("fiber")) return "fiber / internet";
  if (s.includes("water")) return "water";
  if (s.includes("power") || s.includes("electric")) return "power";
  if (s.includes("gas")) return "gas";
  if (s.includes("sewer") || s.includes("septic")) return "sewer";
  if (s.includes("drain")) return "drain";
  if (s.includes("irrigation")) return "irrigation";
  if (s.includes("other") || s.includes("not sure")) return "utility";
  return s;
}

type TemplateLead = { name?: string; contactName?: string; serviceType?: string; address?: string };

function filler(lead: TemplateLead, extras: TemplateExtras) {
  const first = (lead.contactName || lead.name || "").trim().split(/\s+/)[0] || "there";
  const utility = utilityWords(lead.serviceType);
  const street = (lead.address || "").split(",")[0].trim();
  const place = street ? ` at ${street}` : "";
  const q = (extras.quoteUrl || "").trim();
  const r = (extras.reviewUrl || "").trim();
  const values: Record<string, string> = {
    first,
    utility,
    place,
    expires: (extras.expires || "").trim() || "the date on it",
    quoteLinkEmail: q ? `\n\nHere's the link again: ${q}` : "",
    quoteLinkText: q ? ` Link: ${q}` : "",
    reviewLinkEmail: r
      ? `\n\nHere's the link: ${r}`
      : "\n\nJust search FiberNorth Underground on Google and click Write a review.",
    reviewLinkText: r ? ` Takes a minute: ${r}` : " Search FiberNorth Underground on Google.",
  };
  return (s: string) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m));
}

export function fillTemplate(
  t: Pick<LeadEmailTemplate, "subject" | "body">,
  lead: TemplateLead,
  extras: TemplateExtras = {}
): { subject: string; body: string } {
  const fill = filler(lead, extras);
  const subject = fill(t.subject);
  return { subject: subject.charAt(0).toUpperCase() + subject.slice(1), body: fill(t.body) };
}

/** A text starter filled for this lead; "" when the key is unknown. */
export function fillText(key: string, lead: TemplateLead, extras: TemplateExtras = {}): string {
  const t = LEAD_TEXT_TEMPLATES.find((x) => x.key === key);
  return t ? filler(lead, extras)(t.body) : "";
}
