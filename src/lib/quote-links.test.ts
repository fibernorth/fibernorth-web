import { describe, it, expect } from "vitest";
import { indexLeads, leadOfQuote, matchLeadForWebsiteQuote, suggestLeadsForQuote } from "./quote-links";

describe("matchLeadForWebsiteQuote", () => {
  const leads = [
    { id: "a", name: "Ann", phone: "(231) 555-1234", email: "ann@x.com", stage: "contacted" },
    { id: "b", name: "Bob", phone: "", email: "Bob@Y.com", stage: "lost" },
    { id: "acct", name: "Popp", phone: "231-555-9999", email: "office@popp.com", isAccount: true },
    { id: "job", name: "Popp: 12 Elm", phone: "231-555-8888", email: "", parentLeadId: "acct" },
    { id: "d1", name: "Dee", phone: "989-555-0000", email: "" },
    { id: "d2", name: "Dee again", phone: "", email: "dee@z.com" },
  ];
  it("same phone (any format, leading 1)", () => {
    expect(matchLeadForWebsiteQuote(leads, { phone: "1-231-555-1234", email: "new@x.com" })).toEqual({ id: "a", stage: "contacted", by: "phone" });
  });
  it("same email, any case", () => {
    expect(matchLeadForWebsiteQuote(leads, { phone: "000", email: " bob@y.COM " })).toEqual({ id: "b", stage: "lost", by: "email" });
  });
  it("no match: null (a new lead is made)", () => {
    expect(matchLeadForWebsiteQuote(leads, { phone: "616-555-0000", email: "nobody@x.com" })).toBeNull();
  });
  it("a contractor account or a job under one is never matched", () => {
    expect(matchLeadForWebsiteQuote(leads, { phone: "2315559999", email: "" })).toBeNull();
    expect(matchLeadForWebsiteQuote(leads, { phone: "2315558888", email: "" })).toBeNull();
  });
  it("two different leads match (phone one, email the other): null", () => {
    expect(matchLeadForWebsiteQuote(leads, { phone: "9895550000", email: "dee@z.com" })).toBeNull();
  });
  it("phone and email both on the same lead: one match", () => {
    expect(matchLeadForWebsiteQuote(leads, { phone: "2315551234", email: "ann@x.com" })?.id).toBe("a");
  });
  it("a blank stage reads as new", () => {
    expect(matchLeadForWebsiteQuote([{ id: "z", phone: "2315550000" }], { phone: "2315550000" })?.stage).toBe("new");
  });
});

describe("leadOfQuote", () => {
  const index = indexLeads([
    { id: "l1", quoteId: "q1" },
    { id: "l2", externalId: "quote:q2" },
    { id: "l3" },
  ]);
  it("by quote.leadId", () => expect(leadOfQuote({ id: "qx", leadId: "l3" }, index)?.id).toBe("l3"));
  it("old one-way link: lead.quoteId or externalId quote:<id>", () => {
    expect(leadOfQuote({ id: "q1" }, index)?.id).toBe("l1");
    expect(leadOfQuote({ id: "q2" }, index)?.id).toBe("l2");
  });
  it("leadId of a lead that's gone, and nothing pointing at it: no lead", () => {
    expect(leadOfQuote({ id: "q9", leadId: "deleted" }, index)).toBeNull();
    expect(leadOfQuote({ id: "q9" }, index)).toBeNull();
  });
});

describe("suggestLeadsForQuote", () => {
  const leads = [
    { id: "n", name: "Jane Smith", phone: "", email: "", address: "" },
    { id: "e", name: "J S", phone: "", email: "jane@x.com", address: "" },
    { id: "p", name: "Someone", phone: "231 555 1234", email: "", address: "" },
    { id: "a", name: "Other", phone: "", email: "", address: "12 Elm Street, Cadillac, MI" },
    { id: "x", name: "Unrelated", phone: "", email: "", address: "" },
  ];
  it("phone, then email, then name, then street", () => {
    const s = suggestLeadsForQuote({ phone: "2315551234", email: "JANE@x.com", name: "jane  smith", address: "12 Elm Street, Cadillac" }, leads);
    expect(s.map((x) => [x.lead.id, x.why])).toEqual([
      ["p", "same phone"],
      ["e", "same email"],
      ["n", "same name"],
      ["a", "same address"],
    ]);
  });
  it("nothing alike: none", () => {
    expect(suggestLeadsForQuote({ phone: "", email: "", name: "Bo", address: "" }, leads)).toEqual([]);
  });
});
