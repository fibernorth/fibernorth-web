import { describe, it, expect } from "vitest";
import { isLetterProspect, leadDateOf, parseLeadAtDate, wonDateOf } from "./lead-dates";
import { costPerWonBySource } from "./sales-metrics";
import type { Lead, LeadActivity } from "./leads";

const at = (d: string) => `${d}T16:00:00.000Z`;
const lead = (p: Partial<Lead>): Lead =>
  ({ id: Math.random().toString(36), name: "", phone: "", email: "", address: "", serviceType: "", source: "website", stage: "new", ...p }) as Lead;
const imported = at("2026-09-20");

describe("parseLeadAtDate", () => {
  it("reads ISO as a Detroit day", () => {
    expect(parseLeadAtDate("2026-09-14T16:00:00.000Z")).toBe("2026-09-14");
    // 11:30pm Detroit on the 14th is the 15th in UTC.
    expect(parseLeadAtDate("2026-09-15T03:30:00.000Z")).toBe("2026-09-14");
    expect(parseLeadAtDate("2026-09-14")).toBe("2026-09-14");
  });
  it("reads the sheet's display text", () => {
    expect(parseLeadAtDate("9/14/2026 3:45 PM")).toBe("2026-09-14");
    expect(parseLeadAtDate("9/14/2026")).toBe("2026-09-14");
    expect(parseLeadAtDate("09/04/26 15:10")).toBe("2026-09-04");
    expect(parseLeadAtDate("Sep 14, 2026 3:45 PM")).toBe("2026-09-14");
    expect(parseLeadAtDate("Monday, September 14, 2026")).toBe("2026-09-14");
  });
  it("takes a missing year from the import day", () => {
    expect(parseLeadAtDate("9/14 3:45 PM", "2026-09-20")).toBe("2026-09-14");
    expect(parseLeadAtDate("12/30", "2027-01-05")).toBe("2026-12-30");
    expect(parseLeadAtDate("9/14")).toBeNull();
  });
  it("gives up on junk", () => {
    expect(parseLeadAtDate("")).toBeNull();
    expect(parseLeadAtDate("yesterday")).toBeNull();
    expect(parseLeadAtDate("2/30/2026")).toBeNull();
    expect(parseLeadAtDate("13/01/2026")).toBeNull();
  });
});

describe("leadDateOf", () => {
  it("uses the sheet date over the import time", () => {
    expect(leadDateOf(lead({ source: "meta-ads", leadAt: "6/2/2026 10:15 AM", createdAt: imported }))).toBe("2026-06-02");
  });
  it("falls back to createdAt when leadAt can't be read", () => {
    expect(leadDateOf(lead({ source: "meta-ads", leadAt: "sometime", createdAt: imported }))).toBe("2026-09-20");
    expect(leadDateOf(lead({ createdAt: imported }))).toBe("2026-09-20");
    expect(leadDateOf(lead({}))).toBeNull();
  });
  it("a letter lead comes in when it first talked or got a quote", () => {
    const call: LeadActivity = { ts: at("2026-10-03"), type: "call", text: "Called about the letter" };
    expect(leadDateOf(lead({ source: "campground-letter", createdAt: imported, activity: [call] }))).toBe("2026-10-03");
  });
});

describe("isLetterProspect", () => {
  const letter: LeadActivity = { ts: at("2026-09-21"), type: "letter", text: "Mailed letter 1" };
  it("mailing-list leads without contact are prospects", () => {
    expect(isLetterProspect(lead({ source: "contractor-letter", activity: [letter] }))).toBe(true);
    expect(isLetterProspect(lead({ source: "campground-letter", stage: "contacted", activity: [letter] }))).toBe(true);
  });
  it("a talk, a quote or a later stage makes them real", () => {
    expect(isLetterProspect(lead({ source: "contractor-letter", activity: [letter, { ts: at("2026-09-22"), type: "call", text: "Talked" }] }))).toBe(false);
    expect(isLetterProspect(lead({ source: "contractor-letter", quoteId: "q1" }))).toBe(false);
    expect(isLetterProspect(lead({ source: "campground-letter", stage: "walk_scheduled" }))).toBe(false);
    expect(isLetterProspect(lead({ source: "campground-letter", stage: "won" }))).toBe(false);
  });
  it("other sources never are", () => {
    expect(isLetterProspect(lead({ source: "meta-ads" }))).toBe(false);
  });
});

describe("wonDateOf", () => {
  it("history line first", () => {
    expect(
      wonDateOf(lead({ stage: "won", createdAt: imported, activity: [{ ts: at("2026-09-22"), type: "stage", text: "Moved to Won" }] }))
    ).toBe("2026-09-22");
  });
  it("then acceptedAt on the lead or an accepted badge", () => {
    expect(wonDateOf({ ...lead({ stage: "won", createdAt: imported }), acceptedAt: at("2026-09-21") })).toBe("2026-09-21");
    const badge = { status: "accepted", total: 1, version: 1, acceptedAt: at("2026-09-23") } as Lead["quote"];
    expect(wonDateOf(lead({ stage: "won", createdAt: imported, quote: badge }))).toBe("2026-09-23");
  });
  it("a sheet row imported as won counts on its sheet date, not the import day", () => {
    expect(wonDateOf(lead({ stage: "won", source: "meta-ads", leadAt: "5/10/2026 9:00 AM", createdAt: imported, lastContactAt: "2026-09-24" }))).toBe(
      "2026-05-10"
    );
  });
  it("then last contact, then createdAt", () => {
    expect(wonDateOf(lead({ stage: "won", lastContactAt: "2026-08-01", createdAt: imported }))).toBe("2026-08-01");
    expect(wonDateOf(lead({ stage: "won", leadAt: imported, createdAt: imported }))).toBe("2026-09-20");
  });
});

describe("costPerWonBySource with real dates", () => {
  it("counts sheet leads by sheet date and leaves out letter prospects", () => {
    const leads = [
      // Imported in September but came in in June.
      lead({ source: "meta-ads", leadAt: "6/2/2026", createdAt: imported }),
      lead({ source: "meta-ads", leadAt: "9/5/2026 1:00 PM", createdAt: imported }),
      // 3 campground prospects mailed in September; one called back.
      lead({ source: "campground-letter", createdAt: imported }),
      lead({ source: "campground-letter", createdAt: imported }),
      lead({ source: "campground-letter", createdAt: imported, activity: [{ ts: at("2026-09-25"), type: "call", text: "Called in" }] }),
    ];
    const rows = costPerWonBySource(leads, { "2026-09": { "campground-letter": 900 } }, ["2026-09"]);
    expect(rows.find((r) => r.source === "meta-ads")).toMatchObject({ leads: 1 });
    expect(rows.find((r) => r.source === "campground-letter")).toMatchObject({ leads: 1, spend: 900, won: 0 });
    const june = costPerWonBySource(leads, {}, ["2026-06"]);
    expect(june.find((r) => r.source === "meta-ads")).toMatchObject({ leads: 1 });
  });
});
