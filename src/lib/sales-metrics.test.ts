import { describe, it, expect } from "vitest";
import {
  callsToday,
  cleanSpend,
  costPerWonBySource,
  monthsBack,
  openQuotes,
  quoteSentDateOf,
  quoteWinRate,
  wonDateOf,
  wonLastDays,
  wonThisMonth,
} from "./sales-metrics";
import type { Lead, LeadActivity } from "./leads";

const at = (d: string) => `${d}T16:00:00.000Z`;
const lead = (p: Partial<Lead>): Lead =>
  ({ id: Math.random().toString(36), name: "", phone: "", email: "", address: "", serviceType: "", source: "website", stage: "new", ...p }) as Lead;
const accepted = (d: string): LeadActivity => ({ ts: at(d), type: "quote", text: 'Customer ACCEPTED quote v1 (signed "Don")' });
const sentLine = (d: string, v = 1): LeadActivity => ({ ts: at(d), type: "quote", text: `Quote v${v} sent to don@x.com: $3,000.00` });

const today = "2026-09-25";

describe("dates", () => {
  it("months back across a year end", () => {
    expect(monthsBack("2026-02-10", 3)).toEqual(["2026-02", "2026-01", "2025-12"]);
  });
  it("won date from the accept line, a stage move, else last contact", () => {
    expect(wonDateOf(lead({ stage: "won", activity: [accepted("2026-09-10")] }))).toBe("2026-09-10");
    expect(wonDateOf(lead({ stage: "won", activity: [{ ts: at("2026-09-12"), type: "stage", text: "Moved to Won" }] }))).toBe("2026-09-12");
    expect(wonDateOf(lead({ stage: "won", lastContactAt: "2026-08-01" }))).toBe("2026-08-01");
    expect(wonDateOf(lead({ stage: "quoted", activity: [accepted("2026-09-10")] }))).toBeNull();
  });
  it("first quote date survives a revision", () => {
    const l = lead({ activity: [sentLine("2026-09-01"), sentLine("2026-09-08", 2)], quote: { status: "sent", total: 1, version: 2, sentAt: at("2026-09-08") } });
    expect(quoteSentDateOf(l)).toBe("2026-09-01");
    expect(quoteSentDateOf(lead({ quote: { status: "sent", total: 1, version: 1, sentAt: at("2026-09-03") } }))).toBe("2026-09-03");
  });
});

describe("callsToday", () => {
  it("counts the Due list by source", () => {
    const r = callsToday(
      [
        lead({ source: "meta-ads", stage: "new" }),
        lead({ source: "meta-ads", stage: "contacted", nextActionAt: "2026-09-24" }),
        lead({ source: "website", stage: "nurture", nextActionAt: today }),
        lead({ source: "website", stage: "contacted", nextActionAt: "2026-09-30" }),
        lead({ source: "website", stage: "lost", nextActionAt: "2026-09-01" }),
      ],
      today
    );
    expect(r.total).toBe(3);
    expect(r.bySource).toEqual([
      { source: "meta-ads", label: "Meta ads", n: 2 },
      { source: "website", label: "Website", n: 1 },
    ]);
  });
});

describe("openQuotes", () => {
  it("count, dollars, oldest and expiring soon", () => {
    const a = lead({ stage: "quoted", quote: { status: "sent", total: 3000, version: 1, sentAt: at("2026-09-01"), expiresAt: at("2026-10-01") } });
    const b = lead({ stage: "quoted", quote: { status: "viewed", total: 4500.5, version: 1, sentAt: at("2026-09-20"), expiresAt: at("2026-10-20") } });
    const expired = lead({ stage: "quoted", quote: { status: "sent", total: 999, version: 1, sentAt: at("2026-08-01"), expiresAt: at("2026-08-31") } });
    const won = lead({ stage: "won", quote: { status: "accepted", total: 999, version: 1, sentAt: at("2026-09-01") } });
    const r = openQuotes([a, b, expired, won], today);
    expect(r).toMatchObject({ count: 2, dollars: 7500.5, oldestDays: 24 });
    expect(r.oldest).toBe(a);
    expect(r.expiringSoon.map((x) => x.expires)).toEqual(["2026-10-01"]);
  });
});

describe("quoteWinRate", () => {
  it("won out of quotes sent in the last 90 days", () => {
    const r = quoteWinRate(
      [
        lead({ stage: "won", activity: [sentLine("2026-09-01"), accepted("2026-09-05")] }),
        lead({ stage: "lost", activity: [sentLine("2026-08-01")] }),
        lead({ stage: "quoted", activity: [sentLine("2026-09-20")] }),
        lead({ stage: "won", activity: [sentLine("2026-05-01")] }), // too old
        lead({ stage: "won" }), // won without a quote
      ],
      today
    );
    expect(r).toEqual({ sent: 3, won: 1, lost: 1, open: 1, rate: 1 / 3 });
    expect(quoteWinRate([], today).rate).toBeNull();
  });
});

describe("won dollars", () => {
  const leads = [
    lead({ stage: "won", saleAmountNum: 3000, activity: [accepted("2026-09-10")] }),
    lead({ stage: "won", saleAmount: "$5,000", activity: [accepted("2026-09-02")] }),
    lead({ stage: "won", activity: [accepted("2026-09-03")] }), // no amount yet
    lead({ stage: "won", saleAmountNum: 10000, activity: [accepted("2026-08-15")] }),
  ];
  it("this month, with saleAmount parsed when there's no number", () => {
    expect(wonThisMonth(leads, today)).toEqual({ count: 3, dollars: 8000, avgJob: 4000 });
  });
  it("last 90 days", () => {
    expect(wonLastDays(leads, today)).toEqual({ count: 4, dollars: 18000, avgJob: 6000 });
  });
});

describe("costPerWonBySource", () => {
  it("spend over won jobs per source for the chosen months", () => {
    const leads = [
      lead({ source: "meta-ads", createdAt: at("2026-09-02") }),
      lead({ source: "meta-ads", createdAt: at("2026-09-03"), stage: "won", saleAmountNum: 4000, activity: [accepted("2026-09-12")] }),
      lead({ source: "meta-ads", createdAt: at("2026-08-03"), stage: "won", saleAmountNum: 2000, activity: [accepted("2026-08-12")] }),
      lead({ source: "website", createdAt: at("2026-09-05"), stage: "won", saleAmountNum: 3000, activity: [accepted("2026-09-06")] }),
      lead({ source: "meta-ads", createdAt: at("2026-09-04"), stage: "not_a_lead" }),
    ];
    const spend = { "2026-09": { "meta-ads": 600, "google-ads": 200 }, "2026-08": { "meta-ads": 500 } };
    const rows = costPerWonBySource(leads, spend, ["2026-09"]);
    expect(rows.find((r) => r.source === "meta-ads")).toMatchObject({ spend: 600, leads: 2, won: 1, dollars: 4000, costPerWon: 600 });
    expect(rows.find((r) => r.source === "google-ads")).toMatchObject({ spend: 200, won: 0, costPerWon: null });
    expect(rows.find((r) => r.source === "website")).toMatchObject({ spend: 0, won: 1, costPerWon: null });
    const both = costPerWonBySource(leads, spend, ["2026-09", "2026-08"]);
    expect(both.find((r) => r.source === "meta-ads")).toMatchObject({ spend: 1100, won: 2, costPerWon: 550 });
  });
  it("cleans the spend form", () => {
    expect(cleanSpend({ "meta-ads": "$1,250.50", "google-ads": -3, junk: 99, referral: "abc" })).toEqual({
      "meta-ads": 1250.5,
      "google-ads": 0,
      "campground-letter": 0,
      "contractor-letter": 0,
      referral: 0,
      other: 0,
    });
  });
});
