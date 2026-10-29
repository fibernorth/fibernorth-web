import { describe, it, expect } from "vitest";
import { buildHaystack, matchesSearch, normalizeForSearch, quoteHaystack, searchTokens } from "./quote-search";

const quote = {
  id: "q8Hx2",
  name: "Jane O'Brien",
  phone: "(231) 675-6258",
  email: "Jane.OBrien@Example.com",
  address: "1420 N. Lakeshore Dr, Traverse City, MI 49684",
  description: "Water line under the driveway to the pole barn",
  version: 2,
  qboDocNumber: "1042",
};
const lead = { name: "O'Brien Residence", contactName: "Jane" };
const parent = { name: "Popp Excavating, LLC", contactName: "Dave Popp", phone: "231-555-0100" };
const h = quoteHaystack(quote, lead, parent);

describe("normalizeForSearch", () => {
  it("lowercases, drops apostrophes, turns punctuation into spaces", () => {
    expect(normalizeForSearch("Jane O'Brien, LLC.")).toBe("jane obrien llc");
    expect(searchTokens("  Popp   excavating!! ")).toEqual(["popp", "excavating"]);
    expect(normalizeForSearch("Café")).toBe("cafe");
  });
});

describe("matchesSearch on a quote", () => {
  const yes = (q: string) => expect(matchesSearch(q, h), q).toBe(true);
  const no = (q: string) => expect(matchesSearch(q, h), q).toBe(false);

  it("blank matches everything", () => yes("   "));
  it("customer and contact names, any case or punctuation", () => {
    yes("jane");
    yes("OBRIEN");
    yes("o'brien");
    yes("o brien");
  });
  it("every word must match somewhere (across fields)", () => {
    yes("jane traverse");
    yes("popp barn");
    no("jane petoskey");
  });
  it("phone however it's typed", () => {
    yes("2316756258");
    yes("231-675-6258");
    yes("(231) 675 6258");
    yes("6258");
    yes("+1 231 675 6258");
    no("2316756259");
  });
  it("contractor's phone too", () => yes("5550100"));
  it("email and its parts", () => {
    yes("jane.obrien@example.com");
    yes("example.com");
  });
  it("street, city, zip", () => {
    yes("lakeshore");
    yes("1420 lakeshore");
    yes("traverse city");
    yes("49684");
  });
  it("quote number and version", () => {
    yes("#1042");
    yes("estimate 1042");
    yes("v2");
    no("v3");
    yes("q8hx2");
  });
  it("lead and contractor names", () => {
    yes("residence");
    yes("popp excavating llc");
    yes("dave");
  });
  it("description", () => yes("driveway pole barn"));
  it("no lead, no parent: still searchable on the quote", () => {
    expect(matchesSearch("traverse", quoteHaystack(quote))).toBe(true);
    expect(matchesSearch("popp", quoteHaystack(quote))).toBe(false);
  });
});

describe("buildHaystack", () => {
  it("skips blank fields; squashed text matches words typed together", () => {
    const x = buildHaystack(["PO Box 12", null, undefined, ""], []);
    expect(matchesSearch("pobox", x)).toBe(true);
    expect(matchesSearch("box 12", x)).toBe(true);
  });
});
