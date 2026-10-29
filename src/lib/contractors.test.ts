import { describe, it, expect } from "vitest";
import { contractorGroups, contractorTotals, isContractorAccount, jobQuoteText, jobValue, parentIdsOf } from "./contractors";
import type { Lead } from "./leads";

const L = (id: string, extra: Partial<Lead> = {}): Lead =>
  ({ id, name: id, phone: "", email: "", address: "", serviceType: "", source: "phone", stage: "new", ...extra }) as Lead;

describe("contractor accounts", () => {
  it("an account is checked as one or has jobs under it", () => {
    const leads = [L("a", { isAccount: true }), L("b"), L("j1", { parentLeadId: "b" }), L("c")];
    const parents = parentIdsOf(leads);
    expect(isContractorAccount(leads[0], parents)).toBe(true);
    expect(isContractorAccount(leads[1], parents)).toBe(true);
    expect(isContractorAccount(leads[3], parents)).toBe(false);
  });

  it("groups jobs under their account, newest first, most open jobs first", () => {
    const leads = [
      L("popp", { name: "Popp Excavating", isAccount: true }),
      L("zed", { name: "Zed Builders" }),
      L("j1", { parentLeadId: "popp", createdAt: "2026-10-01", stage: "won" }),
      L("j2", { parentLeadId: "popp", createdAt: "2026-10-05", stage: "quoted" }),
      L("j3", { parentLeadId: "zed", stage: "new" }),
      L("j4", { parentLeadId: "zed", stage: "contacted" }),
      L("solo"),
    ];
    const g = contractorGroups(leads);
    expect(g.map((x) => x.account.id)).toEqual(["zed", "popp"]);
    expect(g[1].jobs.map((j) => j.id)).toEqual(["j2", "j1"]);
    expect(g.some((x) => x.account.id === "solo")).toBe(false);
  });

  it("an account with no jobs yet is still listed", () => {
    expect(contractorGroups([L("a", { isAccount: true })])[0].totals.jobs).toBe(0);
  });

  it("a private job left out by visibleLeads isn't counted", () => {
    const g = contractorGroups([L("a", { isAccount: true }), L("j", { parentLeadId: "a" })].filter((l) => l.id !== "j"));
    expect(g[0].totals.jobs).toBe(0);
  });
});

describe("contractorTotals", () => {
  it("open, won dollars, done and scheduled", () => {
    const t = contractorTotals([
      L("1", { stage: "new" }),
      L("2", { stage: "quoted" }),
      L("3", { stage: "won", saleAmount: "$4,250" }),
      L("4", { stage: "won", quote: { status: "accepted", total: 1800.5, version: 1 } }),
      L("5", { stage: "won", jobScheduledAt: "2026-11-02" }),
      L("6", { stage: "won", saleAmountNum: 1000, jobScheduledAt: "2026-10-01", jobDoneAt: "2026-10-02" }),
      L("7", { stage: "lost" }),
      L("8", { stage: "not_a_lead" }),
      L("9", { stage: "nurture" }),
    ]);
    expect(t).toEqual({ jobs: 9, open: 3, won: 4, wonDollars: 7050.5, wonUnpriced: 1, done: 1, scheduled: 1 });
  });

  it("a sent (not accepted) quote is not money won", () => {
    expect(jobValue(L("x", { stage: "won", quote: { status: "sent", total: 900, version: 1 } }))).toBeNull();
  });
});

describe("jobQuoteText", () => {
  it("status, total and count; expired once past its day", () => {
    const j = L("x", { quoteCount: 2, quote: { status: "sent", total: 500, version: 1, sentAt: "2026-09-01T14:00:00.000Z", expiresAt: "2026-10-01T03:59:59.999Z" } });
    expect(jobQuoteText(j, "2026-09-15")).toEqual({ status: "sent", total: 500, count: 2 });
    expect(jobQuoteText(j, "2026-10-20").status).toBe("expired");
    expect(jobQuoteText(L("y"), "2026-10-20")).toEqual({ status: "", total: null, count: 0 });
  });
});
