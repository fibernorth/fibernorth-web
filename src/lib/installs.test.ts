import { describe, it, expect } from "vitest";
import { installBoard, installStepOf } from "@/lib/installs";
import type { Lead } from "@/lib/leads";

const L = (id: string, extra: Partial<Lead> = {}): Lead => ({ id, name: id, stage: "won", ...extra }) as Lead;

describe("installBoard", () => {
  const today = "2026-11-25";
  const leads = [
    L("sold", { saleAmount: "$4,000" }),
    L("ticket", { saleAmountNum: 3000 }),
    L("sched", { saleAmountNum: 2000, jobScheduledAt: "2026-12-02" }),
    L("late", { saleAmountNum: 1000, jobScheduledAt: "2026-10-20" }),
    L("done", { saleAmountNum: 43000, jobDoneAt: "2026-11-01", cashCollected: "43000" }),
    L("owes", { saleAmountNum: 5000, jobDoneAt: "2026-11-02", cashCollected: "2500" }),
    L("paid", { saleAmountNum: 800, jobDoneAt: "2026-11-10", paidAt: "2026-11-12" }),
    L("oldpaid", { saleAmountNum: 800, jobDoneAt: "2026-05-10", paidAt: "2026-05-12" }),
    L("acct", { isAccount: true }),
    L("lost", { stage: "lost" }),
  ];
  const quotes = [
    { id: "q1", leadId: "sold", estimateStatus: "accepted" as const, missDigStatus: "needed" as const },
    { id: "q2", leadId: "ticket", estimateStatus: "accepted" as const, missDigStatus: "entered" as const },
    { id: "q3", leadId: "ticket", estimateStatus: "sent" as const, missDigStatus: "needed" as const },
  ];
  const b = installBoard(leads, quotes, today);

  it("puts each sold job on the furthest step it reached", () => {
    const ids = (s: keyof typeof b.rows) => b.rows[s].map((r) => r.lead.id);
    expect(ids("sold")).toEqual(["sold"]);
    expect(ids("ticket")).toEqual(["ticket"]);
    expect(ids("scheduled")).toEqual(["late", "sched"]);
    expect(ids("done")).toEqual(["done", "owes"]);
    expect(ids("paid")).toEqual(["paid"]);
  });

  it("counts and adds up each step; flags late jobs and ones that look paid", () => {
    expect(b.totals.sold).toEqual({ count: 1, dollars: 4000 });
    expect(b.totals.done).toEqual({ count: 2, dollars: 48000 });
    expect(b.rows.scheduled.find((r) => r.lead.id === "late")!.overdue).toBe(true);
    expect(b.rows.scheduled.find((r) => r.lead.id === "sched")!.overdue).toBe(false);
    expect(b.rows.done.find((r) => r.lead.id === "done")!.looksPaid).toBe(true);
    expect(b.rows.done.find((r) => r.lead.id === "owes")!.looksPaid).toBe(false);
    expect(b.attention).toBe(2);
  });

  it("ticket state comes from the accepted quote", () => {
    expect(b.rows.sold[0]).toMatchObject({ ticket: "needed", ticketQuoteId: "q1" });
    expect(b.rows.ticket[0]).toMatchObject({ ticket: "in", ticketQuoteId: "q2" });
    expect(b.rows.scheduled[0].ticket).toBe("none");
  });

  it("paid beats done beats scheduled", () => {
    expect(installStepOf({ paidAt: "x", jobDoneAt: "x", jobScheduledAt: "x" }, "none")).toBe("paid");
    expect(installStepOf({ jobDoneAt: "x", jobScheduledAt: "x" }, "none")).toBe("done");
    expect(installStepOf({}, "in")).toBe("ticket");
  });
});
