import { localDateOf } from "@/lib/leads";
import { businessDaysBetween } from "@/lib/business-days";
import { quoteLastValidDay, statusOn } from "@/lib/proposal";
import type { QuoteRequest } from "@/lib/types";

// Where a quote stands with the customer, for the Quotes page and the lead
// card: sent when and how long ago, opened or not (first, last, how often),
// and when it runs out. Pure, so both screens say the same thing.

export type QuoteBucket = "draft" | "waiting" | "opened" | "accepted" | "declined" | "expired";

export const BUCKET_LABELS: Record<QuoteBucket, string> = {
  draft: "Not sent",
  waiting: "Sent, not opened",
  opened: "Opened",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

export interface QuoteTrack {
  bucket: QuoteBucket;
  /** Detroit day it was (last) sent, or "" for a draft. */
  sentDay: string;
  /** Business days since it was sent (0 = sent today). */
  sentAgo: number | null;
  /** Days since the request came in. */
  requestAgo: number | null;
  openedAt: string;
  lastOpenedAt: string;
  opens: number;
  /** Last day it's good through, and business days left (negative once past). */
  goodThrough: string;
  daysLeft: number | null;
  /** Sent 3+ business days ago and never opened: worth a call. */
  unopenedNudge: boolean;
}

type Q = Pick<
  QuoteRequest,
  "estimateStatus" | "version" | "sentAt" | "viewedAt" | "lastViewedAt" | "viewCount" | "expiresAt" | "createdAt"
>;

export function quoteTrack(q: Q, today: string): QuoteTrack {
  const sent = Boolean(q.version && q.estimateStatus && q.estimateStatus !== "draft" && q.sentAt);
  const status = statusOn(q, today);
  const bucket: QuoteBucket = !sent
    ? "draft"
    : status === "accepted"
      ? "accepted"
      : status === "declined"
        ? "declined"
        : status === "expired"
          ? "expired"
          : q.viewedAt
            ? "opened"
            : "waiting";
  const sentDay = sent ? localDateOf(q.sentAt as string) : "";
  const sentAgo = sentDay ? businessDaysBetween(sentDay, today) : null;
  const createdDay = q.createdAt ? localDateOf(q.createdAt) : "";
  const requestAgo = createdDay ? businessDaysBetween(createdDay, today) : null;
  const goodThrough = sent ? quoteLastValidDay(q) || "" : "";
  const daysLeft = goodThrough ? businessDaysBetween(today, goodThrough) : null;
  return {
    bucket,
    sentDay,
    sentAgo,
    requestAgo,
    openedAt: q.viewedAt || "",
    lastOpenedAt: q.lastViewedAt || q.viewedAt || "",
    opens: Number(q.viewCount || 0),
    goodThrough,
    daysLeft,
    unopenedNudge: bucket === "waiting" && (sentAgo ?? 0) >= 3,
  };
}

const plainDay = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const plainWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Detroit" });

export function agoText(n: number | null): string {
  if (n === null) return "";
  if (n <= 0) return "today";
  return `${n} business day${n === 1 ? "" : "s"} ago`;
}

/** One line for a card: "Sent Sep 24 (3 business days ago) · Opened Sep 26, 3:04 AM · 3 opens". */
export function trackLine(t: QuoteTrack): string {
  if (t.bucket === "draft") return t.requestAgo !== null ? `Not sent yet · request came in ${agoText(t.requestAgo)}` : "Not sent yet";
  const parts = [`Sent ${plainDay(t.sentDay)} (${agoText(t.sentAgo)})`];
  if (t.openedAt) {
    parts.push(`Opened ${plainWhen(t.openedAt)}`);
    if (t.opens > 1) parts.push(`${t.opens} opens, last ${plainWhen(t.lastOpenedAt)}`);
  } else {
    parts.push("Not opened yet");
  }
  if (t.bucket === "waiting" || t.bucket === "opened") {
    if (t.daysLeft !== null && t.daysLeft >= 0) parts.push(`good through ${plainDay(t.goodThrough)}`);
  }
  return parts.join(" · ");
}
