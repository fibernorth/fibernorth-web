import { describe, it, expect } from "vitest";
import { arrivalKeyOf, isLeadSort, lastTouchDayOf, sortLeads, DEFAULT_LEAD_SORT } from "./lead-sort";
import type { Lead, LeadActivity } from "./leads";

const at = (d: string) => `${d}T16:00:00.000Z`;
const act = (d: string, type: LeadActivity["type"], text = "x"): LeadActivity => ({ ts: at(d), type, text });
const L = (id: string, p: Partial<Lead> = {}): Lead =>
  ({ id, name: id, phone: "", email: "", address: "", serviceType: "", source: "phone", stage: "new", ...p }) as Lead;
const ids = (xs: Lead[]) => xs.map((l) => l.id);
const today = "2026-10-05";

describe("lastTouchDayOf", () => {
  it("is the later of lastContactAt and the latest touch in the history", () => {
    expect(lastTouchDayOf({})).toBe("");
    expect(lastTouchDayOf({ lastContactAt: "2026-09-10" })).toBe("2026-09-10");
    expect(lastTouchDayOf({ lastContactAt: "2026-09-10", activity: [act("2026-09-20", "attempt")] })).toBe("2026-09-20");
    expect(lastTouchDayOf({ lastContactAt: "2026-09-25", activity: [act("2026-09-20", "call")] })).toBe("2026-09-25");
  });
  it("notes, system and stage lines are not touches", () => {
    expect(lastTouchDayOf({ activity: [act("2026-09-20", "note"), act("2026-09-21", "system"), act("2026-09-22", "stage")] })).toBe("");
  });
});

describe("arrivalKeyOf", () => {
  it("reads the sheet's date text, else createdAt", () => {
    expect(arrivalKeyOf({ leadAt: "9/14/2026 3:45 PM", createdAt: "2026-09-30T12:00:00.000Z" }).slice(0, 10)).toBe("2026-09-14");
    expect(arrivalKeyOf({ createdAt: "2026-09-30T12:00:00.000Z" }).slice(0, 10)).toBe("2026-09-30");
    expect(arrivalKeyOf({})).toBe("");
  });
});

describe("sortLeads", () => {
  const neverOld = L("neverOld", { createdAt: at("2026-09-01") });
  const neverNew = L("neverNew", { createdAt: at("2026-09-20") });
  const triedYesterday = L("triedYesterday", { stage: "attempted", createdAt: at("2026-08-01"), activity: [act("2026-10-04", "attempt")] });
  const talkedLastWeek = L("talkedLastWeek", { stage: "contacted", createdAt: at("2026-09-25"), lastContactAt: "2026-09-28" });
  const talkedLongAgo = L("talkedLongAgo", { stage: "quoted", createdAt: at("2026-09-26"), lastContactAt: "2026-09-02" });
  const all = [talkedLastWeek, neverNew, triedYesterday, talkedLongAgo, neverOld];

  it("defaults to oldest contact first", () => {
    expect(DEFAULT_LEAD_SORT).toBe("contact_oldest");
  });

  it("oldest contact first: never touched (oldest lead first), then longest since the last touch", () => {
    expect(ids(sortLeads(all, "contact_oldest", today))).toEqual([
      "neverOld",
      "neverNew",
      "talkedLongAgo",
      "talkedLastWeek",
      "triedYesterday",
    ]);
  });

  it("newest contact first: most recent touch first, never touched last", () => {
    expect(ids(sortLeads(all, "contact_newest", today))).toEqual([
      "triedYesterday",
      "talkedLastWeek",
      "talkedLongAgo",
      "neverOld",
      "neverNew",
    ]);
  });

  it("by when the lead came in", () => {
    expect(ids(sortLeads(all, "lead_oldest", today))).toEqual(["triedYesterday", "neverOld", "neverNew", "talkedLastWeek", "talkedLongAgo"]);
    expect(ids(sortLeads(all, "lead_newest", today))).toEqual(["talkedLongAgo", "talkedLastWeek", "neverNew", "neverOld", "triedYesterday"]);
    // Unknown arrival goes last either way.
    const unknown = L("unknown");
    expect(ids(sortLeads([unknown, neverOld], "lead_oldest", today))).toEqual(["neverOld", "unknown"]);
    expect(ids(sortLeads([unknown, neverOld], "lead_newest", today))).toEqual(["neverOld", "unknown"]);
  });

  it("next follow-up due: earliest first, none last", () => {
    const a = L("a", { stage: "contacted", nextActionAt: "2026-10-09" });
    const b = L("b", { stage: "contacted", nextActionAt: "2026-10-01" });
    const c = L("c", { stage: "contacted" });
    expect(ids(sortLeads([c, a, b], "follow_up", today))).toEqual(["b", "a", "c"]);
  });

  it("name A–Z, case-insensitive, blanks last", () => {
    const xs = [L("1", { name: "bob" }), L("2", { name: "" }), L("3", { name: "Alice" })];
    expect(ids(sortLeads(xs, "name", today))).toEqual(["3", "1", "2"]);
  });

  it("returns a copy", () => {
    const xs = [neverNew, neverOld];
    sortLeads(xs, "contact_oldest", today);
    expect(ids(xs)).toEqual(["neverNew", "neverOld"]);
  });

  it("isLeadSort guards stored values", () => {
    expect(isLeadSort("name")).toBe(true);
    expect(isLeadSort("bogus")).toBe(false);
    expect(isLeadSort(null)).toBe(false);
  });
});
