import { describe, it, expect } from "vitest";
import { nextCadenceStep } from "./cadence";
import { isDue, isPastDue, todayISO, type Lead } from "./leads";

// The lead /api/quote writes for a website quote request, submitted at `iso`.
const websiteLead = (iso: string) =>
  ({
    name: "QA",
    phone: "231-555-0100",
    email: "qa@example.com",
    source: "website",
    stage: "new",
    nextAction: "Call back",
    nextActionAt: todayISO(new Date(iso)),
    leadAt: iso,
    createdAt: iso,
    activity: [{ ts: iso, type: "system", text: "Quote request from the website" }],
  }) as unknown as Lead;

describe("a website quote request that comes in on a weekend", () => {
  const lead = websiteLead("2026-09-26T19:00:00.000Z"); // Saturday 3pm Detroit

  it("shows on the Due list right away", () => {
    expect(isDue(lead, "2026-09-26")).toBe(true);
    expect(isDue(lead, "2026-09-27")).toBe(true);
  });

  it("isn't overdue until Monday is over", () => {
    expect(isPastDue(lead.nextActionAt!, "2026-09-27")).toBe(false);
    expect(isPastDue(lead.nextActionAt!, "2026-09-28")).toBe(false);
    expect(isPastDue(lead.nextActionAt!, "2026-09-29")).toBe(true);
  });

  it("the first call is due Monday", () => {
    expect(nextCadenceStep(lead, "2026-09-26")).toMatchObject({ key: "new:d0", date: "2026-09-28" });
  });

  it("one before a holiday: Friday of Labor Day weekend is due Friday, then Tuesday", () => {
    const fri = websiteLead("2026-09-04T14:00:00.000Z");
    expect(nextCadenceStep(fri, "2026-09-04")).toMatchObject({ key: "new:d0", date: "2026-09-04" });
    const called = { ...fri, activity: [...fri.activity!, { ts: "2026-09-04T15:00:00.000Z", type: "attempt", text: "No answer" }] } as Lead;
    expect(nextCadenceStep(called, "2026-09-04")).toMatchObject({ key: "new:d1", date: "2026-09-08" });
    expect(isPastDue("2026-09-04", "2026-09-08")).toBe(true); // Friday's call really was missed
  });
});
