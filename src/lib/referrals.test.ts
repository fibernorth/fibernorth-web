import { describe, it, expect } from "vitest";
import { feePct, partnerName, partnerStats, referralFee, searchPartners } from "./referrals";
import type { Lead } from "./leads";

const lead = (p: Partial<Lead>): Lead =>
  ({ id: "x", name: "", phone: "", email: "", address: "", serviceType: "", source: "website", stage: "new", ...p }) as Lead;

describe("referralFee", () => {
  it("10% of the sale by default, owed until marked paid", () => {
    expect(referralFee(lead({ stage: "won", referredBy: "p1", saleAmountNum: 4250 }))).toEqual({
      pct: 10,
      sale: 4250,
      amount: 425,
      status: "owed",
    });
  });
  it("uses the typed sale when there's no number, and a custom percent", () => {
    const f = referralFee(lead({ stage: "won", referredBy: "p1", saleAmount: "$3,333", referralFeePct: 7.5 }));
    expect(f).toMatchObject({ sale: 3333, amount: 249.98, pct: 7.5 });
  });
  it("paid once marked", () => {
    const f = referralFee(
      lead({ stage: "won", referredBy: "p1", saleAmountNum: 1000, referralFeeStatus: "paid", referralFeePaidAt: "2026-09-25" })
    );
    expect(f).toMatchObject({ status: "paid", paidAt: "2026-09-25", amount: 100 });
  });
  it("nothing until the job is won with a sale amount", () => {
    expect(referralFee(lead({ stage: "quoted", referredBy: "p1", saleAmountNum: 1000 }))).toBeNull();
    expect(referralFee(lead({ stage: "won", referredBy: "p1" }))).toBeNull();
    expect(referralFee(lead({ stage: "won", saleAmountNum: 1000 }))).toBeNull();
  });
  it("0% is allowed; blank or junk means 10", () => {
    expect(feePct({ referralFeePct: 0 })).toBe(0);
    expect(feePct({})).toBe(10);
    expect(feePct({ referralFeePct: -5 })).toBe(10);
  });
});

describe("partnerStats", () => {
  const leads = [
    lead({ id: "p1", name: "Kalkaska Well Drilling", source: "contractor-letter" }),
    lead({ id: "a", referredBy: "p1", stage: "won", saleAmountNum: 3000, referralFeeStatus: "paid" }),
    lead({ id: "b", referredBy: "p1", stage: "won", saleAmount: "5000" }),
    lead({ id: "c", referredBy: "p1", stage: "quoted" }),
    lead({ id: "d", referredBy: "p1", stage: "not_a_lead" }),
    lead({ id: "e", referredBy: "p2", stage: "won", saleAmountNum: 9000 }),
  ];
  it("counts jobs referred and won work, and fees owed vs paid", () => {
    expect(partnerStats("p1", leads)).toEqual({ referred: 3, won: 2, dollars: 8000, feesOwed: 500, feesPaid: 300 });
  });
  it("zero for someone who hasn't sent anything", () => {
    expect(partnerStats("zzz", leads).referred).toBe(0);
  });
});

describe("searchPartners", () => {
  const leads = [
    lead({ id: "p1", name: "Traverse Excavating", source: "contractor-letter", contactName: "Mike" }),
    lead({ id: "p2", name: "Acme Plumbing", source: "contractor-letter", phone: "231-555-0199" }),
    lead({ id: "h1", name: "Don Kelly", source: "website" }),
    lead({ id: "h2", name: "Sue Excavating Fan", source: "website", referredBy: "h1" }),
    lead({ id: "x1", name: "Spam Co", source: "contractor-letter", stage: "not_a_lead" }),
  ];
  it("lists partners (letter contractors, anyone already credited) with nothing typed", () => {
    expect(searchPartners(leads, "", "h2").map((l) => l.id)).toEqual(["p2", "h1", "p1"]);
  });
  it("searches names, contacts and phone, partners first, never itself", () => {
    expect(searchPartners(leads, "excavat", "h2").map((l) => l.id)).toEqual(["p1"]);
    expect(searchPartners(leads, "excavat", "zz").map((l) => l.id)).toEqual(["p1", "h2"]);
    expect(searchPartners(leads, "mike", "zz").map((l) => l.id)).toEqual(["p1"]);
    expect(searchPartners(leads, "555-0199", "zz").map((l) => l.id)).toEqual(["p2"]);
  });
  it("names show the contact person", () => {
    expect(partnerName(leads[0])).toBe("Traverse Excavating (Mike)");
    expect(partnerName({ name: "" })).toBe("(no name)");
  });
});
