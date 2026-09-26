import { describe, it, expect } from "vitest";
import {
  acceptedSaleTotal,
  customerContentKey,
  defaultScope,
  endOfDetroitDay,
  expiresAtFor,
  formatCustomerDate,
  goodThroughText,
  isDefaultScope,
  isPastExpiry,
  isQuoteExpiredOn,
  leadQuoteRollup,
  proposalLines,
  proposalPreviewUrl,
  proposalSubject,
  quoteFirstExpiredDay,
  quoteLastValidDay,
  sentTotalOf,
  statusOn,
  unsentChanges,
} from "./proposal";

describe("isDefaultScope", () => {
  it("knows the generated scope at any footage, so it can follow a redraw", () => {
    expect(isDefaultScope(defaultScope("water-line", 150), "water-line")).toBe(true);
    expect(isDefaultScope(defaultScope("water-line"), "water-line")).toBe(true);
    expect(isDefaultScope("", "water-line")).toBe(true);
  });
  it("treats anything the estimator typed as his", () => {
    expect(isDefaultScope("Bore under the driveway to the barn.", "water-line")).toBe(false);
    expect(isDefaultScope(defaultScope("water-line", 150) + " Two pits.", "water-line")).toBe(false);
  });
});
import type { MapAnnotation, QuoteLine } from "@/lib/types";

describe("proposalLines", () => {
  it("keeps a $0 line with a description so it shows as Included, and drops blank rows", () => {
    const lines: QuoteLine[] = [
      { description: "Directional bore, ~150 ft", kind: "work", qty: 1, unitPrice: 4000 },
      { description: "Restoration, topsoil and seed", kind: "work", qty: 1, unitPrice: 0 },
      { description: "  ", kind: "material", qty: 1, unitPrice: 0 },
    ];
    expect(proposalLines(lines).map((l) => l.description)).toEqual(["Directional bore, ~150 ft", "Restoration, topsoil and seed"]);
  });
  it("uses the saved price when no line has one, and refuses when nothing is priced", () => {
    expect(proposalLines([], 3000)).toEqual([{ description: "Directional drilling, per scope", kind: "work", qty: 1, unitPrice: 3000 }]);
    expect(() => proposalLines([{ description: "Included", kind: "work", qty: 1, unitPrice: 0 }], null)).toThrow(/price/);
  });
});

describe("customerContentKey", () => {
  const ann = {
    center: { lat: 44, lng: -85 },
    zoom: 18,
    markers: [],
    paths: [{ type: "bore-path", color: "#f00", points: [{ lat: 44, lng: -85 }, { lat: 44.001, lng: -85 }] }],
    polygons: [],
  } as MapAnnotation;
  const q = { quotedPrice: 4000, quoteLines: null, mapAnnotation: ann, scopeText: "Bore it." };
  it("ignores map panning and zoom", () => {
    expect(customerContentKey({ ...q, mapAnnotation: { ...ann, center: { lat: 45, lng: -86 }, zoom: 12 } })).toBe(customerContentKey(q));
  });
  it("changes with the price, the scope or the drawing", () => {
    expect(customerContentKey({ ...q, quotedPrice: 4100 })).not.toBe(customerContentKey(q));
    expect(customerContentKey({ ...q, scopeText: "Bore it twice." })).not.toBe(customerContentKey(q));
    expect(customerContentKey({ ...q, mapAnnotation: { ...ann, paths: [] } })).not.toBe(customerContentKey(q));
  });
});

describe("acceptedSaleTotal", () => {
  it("adds up every accepted proposal on the lead and skips the rest", () => {
    const t = (total: number) => ({ work: total, materials: 0, tax: 0, total });
    expect(
      acceptedSaleTotal([
        { status: "accepted", totals: t(4000) },
        { status: "accepted", totals: t(2500.5) },
        { status: "superseded", totals: t(9999) },
        { status: "sent", totals: t(1234) },
      ])
    ).toBe(6500.5);
    expect(acceptedSaleTotal([])).toBe(0);
  });
});

describe("proposalSubject", () => {
  it("names the job, the place and the amount", () => {
    expect(proposalSubject({ version: 1, address: "123 Main St, Lake Ann", total: 7072 })).toBe(
      "Your directional drilling quote, 123 Main St, Lake Ann: $7,072.00"
    );
  });
  it("says it is a revision, and which one", () => {
    expect(proposalSubject({ version: 2, address: "123 Main St", total: 7072 })).toBe("Revised quote (v2), 123 Main St: $7,072.00");
  });
  it("falls back to the customer's name, then to nothing", () => {
    expect(proposalSubject({ version: 1, name: "Pat Example", total: 3000 })).toBe("Your directional drilling quote, Pat Example: $3,000.00");
    expect(proposalSubject({ version: 1, total: 3000 })).toBe("Your directional drilling quote: $3,000.00");
  });
});

describe("expiry: end of the last valid day, Detroit time", () => {
  it("a quote sent at 9:30pm Detroit on Sept 26 for 30 days is good through Oct 26, all day", () => {
    const sent = new Date("2026-09-27T01:30:00Z"); // Sept 26, 9:30pm EDT (already Sept 27 in UTC)
    const exp = expiresAtFor(sent, 30);
    expect(exp).toBe("2026-10-27T03:59:59.999Z"); // Oct 26 23:59:59.999 EDT
    expect(quoteLastValidDay({ expiresAt: exp })).toBe("2026-10-26");
    expect(quoteFirstExpiredDay({ expiresAt: exp })).toBe("2026-10-27");
    expect(goodThroughText({ expiresAt: exp })).toBe("October 26, 2026");
  });
  it("uses standard time after the November clock change, including on the change day", () => {
    expect(endOfDetroitDay("2026-11-05")).toBe("2026-11-06T04:59:59.999Z");
    expect(endOfDetroitDay("2026-11-01")).toBe("2026-11-02T04:59:59.999Z");
    expect(endOfDetroitDay("2026-03-08")).toBe("2026-03-09T03:59:59.999Z");
  });
  it("older quotes that expired at the minute of the send: their expiry day is already expired", () => {
    expect(quoteFirstExpiredDay({ expiresAt: "2026-10-01T16:00:00.000Z" })).toBe("2026-10-01");
    expect(quoteLastValidDay({ expiresAt: "2026-10-01T16:00:00.000Z" })).toBe("2026-09-30");
    // A badge with no expiresAt: sentAt + 30 days.
    expect(quoteFirstExpiredDay({ sentAt: "2026-09-01T16:00:00.000Z" })).toBe("2026-10-01");
    expect(quoteFirstExpiredDay({})).toBeNull();
  });
  it("one expired rule for quote docs and lead badges; decided quotes never read as expired", () => {
    const exp = endOfDetroitDay("2026-10-26");
    expect(isQuoteExpiredOn({ estimateStatus: "sent", expiresAt: exp }, "2026-10-26")).toBe(false);
    expect(isQuoteExpiredOn({ estimateStatus: "viewed", expiresAt: exp }, "2026-10-27")).toBe(true);
    expect(isQuoteExpiredOn({ status: "sent", expiresAt: exp }, "2026-10-27")).toBe(true);
    expect(isQuoteExpiredOn({ estimateStatus: "accepted", expiresAt: exp }, "2027-01-01")).toBe(false);
    expect(isQuoteExpiredOn({ estimateStatus: "draft" }, "2027-01-01")).toBe(false);
    expect(statusOn({ status: "viewed", expiresAt: exp }, "2026-10-27")).toBe("expired");
    expect(statusOn({ status: "viewed", expiresAt: exp }, "2026-10-26")).toBe("viewed");
  });
  it("the instant check the customer routes use agrees with the day rule", () => {
    const exp = endOfDetroitDay("2026-10-26");
    expect(isPastExpiry(exp, Date.parse("2026-10-27T03:59:00Z"))).toBe(false);
    expect(isPastExpiry(exp, Date.parse("2026-10-27T04:00:00Z"))).toBe(true);
  });
  it("customer dates are Detroit dates, not the server's UTC date", () => {
    expect(formatCustomerDate("2026-09-27T01:30:00Z")).toBe("September 26, 2026");
  });
  it("office preview links are marked so they don't count as a customer view", () => {
    expect(proposalPreviewUrl("https://fibernorth.com/proposal/abc")).toBe("https://fibernorth.com/proposal/abc?preview=1");
  });
});

describe("sent total vs the draft", () => {
  it("shows what the customer was sent, and the saved draft's price only when it changed after the send", () => {
    const q = { version: 2, sentAt: "2026-09-20T12:00:00Z", sentTotal: 4250, quotedPrice: 5100, contentChangedAt: "2026-09-21T12:00:00Z" };
    expect(sentTotalOf(q)).toBe(4250);
    expect(unsentChanges(q)).toEqual({ changed: true, total: 5100 });
    expect(unsentChanges({ ...q, contentChangedAt: "2026-09-19T12:00:00Z" })).toEqual({ changed: false, total: null });
    // Quotes sent before sentTotal was kept fall back to the saved price.
    expect(sentTotalOf({ version: 1, quotedPrice: 3000 })).toBe(3000);
    expect(sentTotalOf({ version: 0, quotedPrice: 3000 })).toBeNull();
  });
});

describe("leadQuoteRollup: the lead badge from all of its quotes", () => {
  const today = "2026-09-26";
  const good = endOfDetroitDay("2026-10-20");
  const sentA = {
    id: "QA",
    estimateStatus: "sent" as const,
    version: 1,
    proposalId: "TA",
    sentAt: "2026-09-10T12:00:00Z",
    expiresAt: good,
    sentTotal: 3000,
    createdAt: "2026-09-01T12:00:00Z",
  };
  const draftB = { id: "QB", estimateStatus: "draft" as const, version: 0, createdAt: "2026-09-20T12:00:00Z", quotedPrice: 9000 };

  it("a new draft doesn't hide a quote that's out with the customer", () => {
    const r = leadQuoteRollup([sentA, draftB], today);
    expect(r.quoteId).toBe("QA");
    expect(r.quote).toMatchObject({ quoteId: "QA", proposalId: "TA", status: "sent", total: 3000, version: 1 });
    expect(r.quoteCount).toBe(2);
  });
  it("the newest open quote wins over an accepted one; accepted wins over a draft", () => {
    const accA = { ...sentA, estimateStatus: "accepted" as const, acceptedAt: "2026-09-15T12:00:00Z" };
    const sentB = { ...draftB, estimateStatus: "sent" as const, version: 1, proposalId: "TB", sentAt: "2026-09-21T12:00:00Z", expiresAt: good, sentTotal: 9000 };
    expect(leadQuoteRollup([accA, sentB], today).quote).toMatchObject({ quoteId: "QB", status: "sent", total: 9000 });
    expect(leadQuoteRollup([accA, draftB], today).quote).toMatchObject({ quoteId: "QA", status: "accepted", total: 3000 });
  });
  it("an expired quote isn't open: a draft or accepted quote takes the badge, else the expired one shows", () => {
    const expired = { ...sentA, expiresAt: endOfDetroitDay("2026-09-20") };
    expect(leadQuoteRollup([expired, draftB], today).quoteId).toBe("QB");
    expect(leadQuoteRollup([expired], today).quote).toMatchObject({ quoteId: "QA", status: "sent" });
  });
  it("no quotes: no badge; a draft badge carries no undefined fields", () => {
    expect(leadQuoteRollup([], today)).toEqual({ quoteId: "", quote: null, quoteCount: 0 });
    expect(leadQuoteRollup([draftB], today).quote).toEqual({ quoteId: "QB", status: "draft", total: null, version: 0 });
  });
});
