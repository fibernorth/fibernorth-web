import { describe, it, expect } from "vitest";
import { quoteTrack, trackLine } from "./quote-track";

const base = { version: 1, estimateStatus: "sent" as const, sentAt: "2026-09-24T14:00:00.000Z", createdAt: "2026-09-22T14:00:00.000Z" };

describe("quoteTrack", () => {
  it("sent and never opened, 3 business days on: nudge", () => {
    const t = quoteTrack(base, "2026-09-29");
    expect(t).toMatchObject({ bucket: "waiting", sentDay: "2026-09-24", sentAgo: 3, opens: 0, unopenedNudge: true });
    expect(trackLine(t)).toContain("Not opened yet");
  });
  it("opened: first and last open and how many", () => {
    const t = quoteTrack(
      { ...base, estimateStatus: "viewed", viewedAt: "2026-09-26T07:04:00.000Z", lastViewedAt: "2026-09-27T20:00:00.000Z", viewCount: 3 },
      "2026-09-29"
    );
    expect(t.bucket).toBe("opened");
    expect(trackLine(t)).toMatch(/Opened Sep 26.*3 opens, last Sep 27/);
  });
  it("drafts, accepted, expired", () => {
    expect(quoteTrack({ createdAt: base.createdAt, estimateStatus: "draft" }, "2026-09-29").bucket).toBe("draft");
    expect(quoteTrack({ ...base, estimateStatus: "accepted" }, "2026-09-29").bucket).toBe("accepted");
    expect(quoteTrack({ ...base, expiresAt: "2026-09-28T04:00:00.000Z" }, "2026-09-29").bucket).toBe("expired");
  });
});
