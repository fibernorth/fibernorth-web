import { describe, it, expect } from "vitest";
import contractors from "@/data/contractor-recipients.json";
import campgrounds from "@/data/campground-recipients.json";
import contractorsLetter1 from "../../marketing/contractors/recipients-contractors.json";
import contractorsCore from "../../marketing/contractors/recipients-master-core.json";
import campgroundsCurrent from "../../marketing/campgrounds/recipients.json";
import { chunk, letterExternalId, letterLogPatch, mailingListIds, quoteNeedsLead, type MailingRow } from "./lead-import";

describe("mailing lists match the imported leads", () => {
  const crmContractorIds = new Set(
    (contractors as Array<{ name: string; address: string }>).map((c) => letterExternalId("contractor", c.name, c.address))
  );
  it("letter 1 = the 94, all of them the ones flagged mailedLetter1", () => {
    const ids = mailingListIds("contractor", contractorsLetter1 as MailingRow[]);
    expect(ids.size).toBe(94);
    const flagged = (contractors as Array<{ name: string; address: string; mailedLetter1: boolean }>)
      .filter((c) => c.mailedLetter1)
      .map((c) => letterExternalId("contractor", c.name, c.address));
    expect(new Set(flagged)).toEqual(ids);
  });
  // 217 mailed letter 2; 12 removed or held after returned mail (Oct 21). Moved
  // addresses still match their lead through Lead_Address.
  it("letter 2 = the core list (205 after removals), every one an imported contractor", () => {
    const ids = mailingListIds("contractor", contractorsCore as MailingRow[]);
    expect(ids.size).toBe(205);
    for (const id of ids) expect(crmContractorIds.has(id)).toBe(true);
  });
  it("campground list keys match the imported campgrounds", () => {
    const ids = mailingListIds("campground", campgroundsCurrent as MailingRow[]);
    const crm = (campgrounds as Array<{ name: string; address: string }>).map((c) => letterExternalId("campground", c.name, c.address));
    for (const id of ids) expect(crm).toContain(id);
  });
});

describe("letterLogPatch", () => {
  const entry = { ts: "2026-10-02T12:00:00.000Z", type: "letter" as const, text: "Letter 2 mailed" };
  it("keeps the next action Bill set", () => {
    const p = letterLogPatch({ nextAction: "Call about the Elk Rapids job", lastContactAt: "2026-09-04" }, entry, "2026-10-02");
    expect(p).toEqual({ lastContactAt: "2026-10-02" });
  });
  it("clears a 'Mail letter N' reminder", () => {
    expect(letterLogPatch({ nextAction: "Mail letter 1" }, entry, "2026-10-02")).toEqual({
      lastContactAt: "2026-10-02",
      nextAction: "",
      nextActionAt: "",
    });
  });
  it("doesn't move last contact backwards, and skips a letter already logged", () => {
    expect(letterLogPatch({ lastContactAt: "2026-10-05" }, entry, "2026-10-02")).toEqual({});
    expect(letterLogPatch({ activity: [entry] }, entry, "2026-10-02")).toBeNull();
  });
});

describe("quoteNeedsLead", () => {
  const known = {
    externalIds: new Set(["quote:q1"]),
    leadIds: new Set(["lead-a"]),
    quoteIds: new Set(["q3"]),
  };
  it("skips quotes that already have a lead", () => {
    expect(quoteNeedsLead({ id: "q1" }, known)).toBe(false); // imported before
    expect(quoteNeedsLead({ id: "q2", leadId: "lead-a" }, known)).toBe(false); // made from a lead
    expect(quoteNeedsLead({ id: "q3" }, known)).toBe(false); // a lead points at it
  });
  it("imports a quote whose lead is missing", () => {
    expect(quoteNeedsLead({ id: "q4", leadId: "gone" }, known)).toBe(true);
    expect(quoteNeedsLead({ id: "q5" }, known)).toBe(true);
  });
});

describe("chunk", () => {
  it("splits into batches of at most 400", () => {
    const parts = chunk(Array.from({ length: 1001 }, (_, i) => i));
    expect(parts.map((p) => p.length)).toEqual([400, 400, 201]);
  });
});

describe("mailingListIds after an address change", () => {
  it("keeps matching the lead made with the old address", () => {
    const old = mailingListIds("contractor", [{ Company_Name: "Socks Construction", Address: "607 Randolph St Ste 101", City: "Traverse City", State: "MI", Zip: "49684" }]);
    const moved = mailingListIds("contractor", [
      { Company_Name: "Socks Construction", Address: "225 E Fourteenth St", City: "Traverse City", State: "MI", Zip: "49684", Lead_Address: "607 Randolph St Ste 101, Traverse City, MI 49684" },
    ]);
    expect([...moved]).toEqual([...old]);
  });
});
