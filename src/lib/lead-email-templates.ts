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
];

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

export function fillTemplate(
  t: Pick<LeadEmailTemplate, "subject" | "body">,
  lead: { name?: string; serviceType?: string; address?: string }
): { subject: string; body: string } {
  const first = (lead.name || "").trim().split(/\s+/)[0] || "there";
  const utility = utilityWords(lead.serviceType);
  const street = (lead.address || "").split(",")[0].trim();
  const place = street ? ` at ${street}` : "";
  const fill = (s: string) => s.replace(/\{first\}/g, first).replace(/\{utility\}/g, utility).replace(/\{place\}/g, place);
  const subject = fill(t.subject);
  return { subject: subject.charAt(0).toUpperCase() + subject.slice(1), body: fill(t.body) };
}
