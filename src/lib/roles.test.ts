import { describe, it, expect } from "vitest";
import {
  approvalReason,
  assertNotSales,
  can,
  canOpenPage,
  cleanApprovers,
  DEFAULT_APPROVERS,
  isApprover,
  needsApproval,
  quickBooksBlock,
  readApprovalSettings,
  roleOf,
  SALES_DENIED_MESSAGE,
  visibleLeads,
  visibleQuotes,
  type AdminRole,
  type Permission,
} from "@/lib/roles";

describe("roleOf", () => {
  it("owners are owners whatever the claims say", () => {
    expect(roleOf(true, { role: "sales" })).toBe("owner");
  });
  it("the role claim makes a sales account; anything else is office staff", () => {
    expect(roleOf(false, { admin: true, role: "sales" })).toBe("sales");
    expect(roleOf(false, { admin: true })).toBe("staff");
    expect(roleOf(false, { admin: true, role: "owner" })).toBe("staff");
    expect(roleOf(false, null)).toBe("staff");
  });
});

describe("permission map", () => {
  const all: Permission[] = [
    "leads.work",
    "quotes.build",
    "quotes.quickbooks",
    "bids.edit",
    "leads.merge",
    "leads.delete",
    "leads.private",
    "website.edit",
    "applications",
    "settings",
    "users.manage",
    "changelog",
  ];
  const allowed = (role: AdminRole) => all.filter((p) => can(role, p));

  it("owners can do everything", () => {
    expect(allowed("owner")).toEqual(all);
  });
  it("sales: leads, quotes, QuickBooks and the bid board only", () => {
    expect(allowed("sales")).toEqual(["leads.work", "quotes.build", "quotes.quickbooks", "bids.edit"]);
  });
  it("staff keep what they had: no merge, deletes, private leads, users or change log", () => {
    for (const p of ["leads.merge", "leads.delete", "leads.private", "users.manage", "changelog"] as Permission[]) {
      expect(can("staff", p)).toBe(false);
    }
    expect(can("staff", "website.edit")).toBe(true);
    expect(can("staff", "settings")).toBe(true);
  });
  it("assertNotSales throws the plain message for sales only", () => {
    expect(() => assertNotSales({ role: "sales" })).toThrow(SALES_DENIED_MESSAGE);
    expect(() => assertNotSales({ role: "staff" })).not.toThrow();
    expect(() => assertNotSales({})).not.toThrow();
  });
});

describe("canOpenPage", () => {
  it("sales: dashboard, leads, quotes (and a quote), calendar, bid board", () => {
    for (const p of ["/admin", "/admin/", "/admin/leads", "/admin/quotes", "/admin/quotes/abc", "/admin/calendar", "/admin/bids", "/admin/me"]) {
      expect(canOpenPage("sales", p)).toBe(true);
    }
  });
  it("sales: no website or office pages, nor the price list", () => {
    for (const p of [
      "/admin/pages",
      "/admin/projects",
      "/admin/major-projects",
      "/admin/fleet",
      "/admin/team",
      "/admin/blog",
      "/admin/testimonials",
      "/admin/jobs",
      "/admin/applications",
      "/admin/users",
      "/admin/settings",
      "/admin/changes",
      "/admin/trash",
      "/admin/pricing",
      "/admin/leadsX",
    ]) {
      expect(canOpenPage("sales", p)).toBe(false);
    }
  });
  it("owners and staff open everything (owner-only pages check on their own)", () => {
    expect(canOpenPage("staff", "/admin/settings")).toBe(true);
    expect(canOpenPage("owner", "/admin/trash")).toBe(true);
  });
});

describe("private (Just mine) leads", () => {
  const leads = [{ id: "a" }, { id: "b", private: true }, { id: "c", private: false }];
  it("owners see every lead", () => {
    expect(visibleLeads(leads, true).map((l) => l.id)).toEqual(["a", "b", "c"]);
  });
  it("everyone else sees all but the private ones", () => {
    expect(visibleLeads(leads, false).map((l) => l.id)).toEqual(["a", "c"]);
  });
  it("quotes: hidden when marked, or when their lead is known private", () => {
    const quotes = [
      { id: "q1", leadId: "a" },
      { id: "q2", leadId: "b", leadPrivate: true },
      { id: "q3", leadId: "b" },
      { id: "q4" },
    ];
    expect(visibleQuotes(quotes, true)).toHaveLength(4);
    expect(visibleQuotes(quotes, false).map((q) => q.id)).toEqual(["q1", "q3", "q4"]);
    expect(visibleQuotes(quotes, false, new Set(["b"])).map((q) => q.id)).toEqual(["q1", "q4"]);
  });
});

describe("needsApproval", () => {
  const base = { trainingMode: true, needsApprovalReason: undefined, isApprover: false };
  it("sales in training mode: every quote waits", () => {
    expect(needsApproval({ ...base, role: "sales" })).toBe(true);
    expect(approvalReason({ ...base, role: "sales" })).toBe("Training mode");
  });
  it("sales with training off: only when the price rules flag it", () => {
    expect(needsApproval({ ...base, role: "sales", trainingMode: false })).toBe(false);
    expect(needsApproval({ ...base, role: "sales", trainingMode: false, needsApprovalReason: "  " })).toBe(false);
    expect(approvalReason({ ...base, role: "sales", trainingMode: false, needsApprovalReason: "Under $1,250 per man-day" })).toBe(
      "Under $1,250 per man-day"
    );
  });
  it("approvers' own quotes go at once", () => {
    expect(needsApproval({ ...base, role: "sales", isApprover: true, needsApprovalReason: "Below" })).toBe(false);
    expect(needsApproval({ ...base, role: "owner", isApprover: true })).toBe(false);
  });
  it("owners and office staff never wait", () => {
    expect(needsApproval({ ...base, role: "owner", needsApprovalReason: "Below the price rules" })).toBe(false);
    expect(needsApproval({ ...base, role: "staff", needsApprovalReason: "Below the price rules" })).toBe(false);
  });
});

describe("approvers", () => {
  const settings = { approvers: ["chris@fibernorth.com"] };
  it("owners always; listed office staff; never a sales account", () => {
    expect(isApprover({ role: "owner", email: "bill@fibernorth.com" }, { approvers: [] })).toBe(true);
    expect(isApprover({ role: "staff", email: "Chris@FiberNorth.com" }, settings)).toBe(true);
    expect(isApprover({ role: "staff", email: "pat@fibernorth.com" }, settings)).toBe(false);
    expect(isApprover({ role: "sales", email: "chris@fibernorth.com" }, settings)).toBe(false);
    expect(isApprover({ role: "staff", email: "" }, settings)).toBe(false);
  });
  it("defaults: Bill, Chris and admin@, training mode on", () => {
    expect(readApprovalSettings(null)).toEqual({ approvers: [...DEFAULT_APPROVERS], trainingMode: true });
    expect(readApprovalSettings({ approvers: ["X@Y.com", "bad"], trainingMode: false })).toEqual({
      approvers: ["x@y.com"],
      trainingMode: false,
    });
  });
  it("cleanApprovers takes a list or typed text, drops junk and repeats", () => {
    expect(cleanApprovers("bill@fibernorth.com, Chris@fibernorth.com\nchris@fibernorth.com nope")).toEqual([
      "bill@fibernorth.com",
      "chris@fibernorth.com",
    ]);
    expect(cleanApprovers(42)).toEqual([]);
  });
});

describe("quickBooksBlock", () => {
  it("never while waiting for approval, even if accepted", () => {
    expect(quickBooksBlock({ estimateStatus: "accepted", approvalStatus: "pending" })).toMatch(/waiting for approval/);
  });
  it("accepted quotes go; others don't unless already sent before", () => {
    expect(quickBooksBlock({ estimateStatus: "accepted", approvalStatus: "approved" })).toBeNull();
    expect(quickBooksBlock({ estimateStatus: "sent" })).toMatch(/Only accepted/);
    expect(quickBooksBlock({ estimateStatus: "sent", qboEstimateId: "9" })).toBeNull();
  });
});
