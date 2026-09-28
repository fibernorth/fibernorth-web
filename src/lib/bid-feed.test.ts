import { describe, it, expect } from "vitest";
import { feedDocId, planFeedBid, type FeedBid } from "./bid-feed";

const now = "2026-09-28T12:00:00.000Z";
const bid: FeedBid = {
  key: "City of Gaylord | East M-32 water main",
  role: "prime",
  title: "East M-32 water main",
  agency: "City of Gaylord",
  county: "Otsego",
  dueDate: "2026-10-21",
  docsUrl: "https://cityofgaylord.com/ad.pdf",
  notes: "About 1,300 ft of 8 inch main",
  source: "Bid scan",
};

describe("bid feed", () => {
  it("doc id is stable for the key, ignoring case and spaces", () => {
    expect(feedDocId(bid.key)).toBe(feedDocId("  city of gaylord |  east m-32 water main "));
  });

  it("creates new bids as tracking", () => {
    const p = planFeedBid(bid, null, false, now);
    expect(p.kind).toBe("create");
    if (p.kind === "create") expect(p.doc).toMatchObject({ status: "tracking", title: bid.title, dueDate: "2026-10-21", origin: "bid-scan" });
  });

  it("doesn't bring back a bid Bill deleted", () => {
    expect(planFeedBid(bid, null, true, now)).toEqual({ kind: "skip", reason: "deleted" });
  });

  it("updates a moved due date, but not a field Bill edited, and never his status or number", () => {
    const created = planFeedBid(bid, null, false, now);
    if (created.kind !== "create") throw new Error();
    const doc = { ...created.doc, status: "bidding", amount: "48,000", notes: "Talked to Amanda" };
    const p = planFeedBid({ ...bid, dueDate: "2026-10-28", notes: "Addendum 1" }, doc, true, now);
    expect(p.kind).toBe("update");
    if (p.kind === "update") {
      expect(p.changed).toEqual(["dueDate"]);
      expect(p.patch).not.toHaveProperty("status");
      expect(p.patch).not.toHaveProperty("amount");
      expect(p.patch).not.toHaveProperty("notes");
    }
    expect(planFeedBid(bid, created.doc, true, now)).toEqual({ kind: "skip", reason: "unchanged" });
  });
});
