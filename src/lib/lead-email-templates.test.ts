import { describe, it, expect } from "vitest";
import { fillTemplate, fillText, LEAD_EMAIL_TEMPLATES, LEAD_TEXT_TEMPLATES, LEAD_VM_SCRIPTS, toTextTemplate, utilityWords } from "./lead-email-templates";

describe("lead email templates", () => {
  it("fills first name, utility and street", () => {
    const f = fillTemplate(LEAD_EMAIL_TEMPLATES[0], {
      name: "Don Kelly",
      serviceType: "Water",
      address: "4900 N Eagle Hwy, Lake Leelanau, MI",
    });
    expect(f.subject).toBe("Your water line");
    expect(f.body).toContain("Hi Don,");
    expect(f.body).toContain("running a water line at 4900 N Eagle Hwy,");
    expect(f.body).not.toMatch(/\{\w+\}/);
  });

  it("falls back cleanly with nothing on file", () => {
    const f = fillTemplate(LEAD_EMAIL_TEMPLATES[1], {});
    expect(f.body).toContain("Hi there,");
    expect(f.body).toContain("the utility line you asked us about, but");
  });

  it("fills the quote link, expiry and review link, or leaves them out cleanly", () => {
    const qf = LEAD_EMAIL_TEMPLATES.find((t) => t.key === "quote-followup")!;
    const withLink = fillTemplate(qf, { name: "Don" }, { quoteUrl: "https://fibernorth.com/proposal/abc" });
    expect(withLink.body).toContain("Here's the link again: https://fibernorth.com/proposal/abc");
    expect(fillTemplate(qf, { name: "Don" }).body).not.toContain("link again");
    const exp = LEAD_EMAIL_TEMPLATES.find((t) => t.key === "quote-expiring")!;
    expect(fillTemplate(exp, {}, { expires: "October 1" }).subject).toBe("Your quote is good through October 1");
    expect(fillText("review", { name: "Don" }, { reviewUrl: "https://g.page/r/x/review" })).toContain("https://g.page/r/x/review");
    expect(fillText("review", { name: "Don" })).toContain("Search FiberNorth Underground on Google.");
    expect(fillText("nope", {})).toBe("");
  });

  it("every starter is in Bill's voice: no em-dashes, no exclamation points, no leftovers", () => {
    const all = [
      ...LEAD_EMAIL_TEMPLATES.flatMap((t) => [fillTemplate(t, { name: "Don" }).subject, fillTemplate(t, { name: "Don" }).body]),
      ...LEAD_TEXT_TEMPLATES.map((t) => fillText(t.key, { name: "Don" })),
    ];
    for (const s of all) {
      expect(s).not.toMatch(/[—–!]/);
      expect(s).not.toMatch(/\{\w+\}/);
    }
    for (const t of LEAD_TEXT_TEMPLATES) {
      // Says who it's from, every time.
      expect(fillText(t.key, { name: "Don" })).toContain("Bill with FiberNorth Underground");
      expect(fillText(t.key, { name: "Don" }).length).toBeLessThan(420);
    }
    for (const k of ["quote-followup", "quote-expiring", "review"]) {
      expect(LEAD_EMAIL_TEMPLATES.find((t) => t.key === k)!.body).toContain("{myFirst}, FiberNorth");
    }
  });

  it("the couldn't-get-through email fits any lead and never mentions a wrong number", () => {
    const t = LEAD_EMAIL_TEMPLATES.find((x) => x.key === "tried-email")!;
    const ad = fillTemplate(t, { name: "Sarah Jones", serviceType: "Power", source: "meta-ads" });
    expect(ad.body).toContain("Hi Sarah,");
    expect(ad.body).toContain("You reached out on Facebook or Instagram about running a power line");
    expect(fillTemplate(t, { name: "Tom", source: "website" }).body).toContain("through our website");
    expect(fillTemplate(t, { name: "Tom" }).body).toContain("You reached out to us about");
    expect(ad.body.toLowerCase()).not.toContain("wrong number");
  });

  it("ad leads get Bill's cell, everyone else the office line", () => {
    for (const t of LEAD_EMAIL_TEMPLATES) {
      const ad = fillTemplate(t, { name: "Sarah", source: "meta-ads" }).body;
      const office = fillTemplate(t, { name: "Tom", source: "campground-letter" }).body;
      if (t.body.includes("{phone}")) {
        expect(ad).toContain("(231) 384-0105");
        expect(ad).not.toContain("944-6471");
        expect(office).toContain("(231) 944-6471");
      }
    }
  });

  it("the first text is Bill's own script, with the right number", () => {
    const t = fillText("new-first", { name: "Sarah Lee", serviceType: "Power", source: "meta-ads" });
    expect(t).toBe(
      "Hi Sarah, this is Bill with FiberNorth Underground in Williamsburg. You reached out on Facebook or Instagram about running a power line on your property. I'd love to hear what you've got going on. We bore it underground, so there's no trench and no torn-up yard or trees. Give me a call or text me back at this number. Best time to reach me is Monday through Friday, 8 am to 3 pm. Talk soon."
    );
    // Sent from Bill's phone: no number in the texts.
    for (const k of ["new-first", "missed", "walk", "quote-followup", "quote-expiring", "review"]) {
      expect(fillText(k, { name: "Tom" })).not.toMatch(/\(231\)/);
    }
  });

  it("every schedule step has a starter to open", () => {
    for (const k of ["new-first", "missed", "quote-followup", "quote-expiring", "review"]) {
      expect(fillText(k, {})).not.toBe("");
    }
  });

  it("puts common lead types in plain words", () => {
    expect(utilityWords("Internet")).toBe("fiber / internet");
    expect(utilityWords("Other / Not sure")).toBe("utility");
    expect(utilityWords("Power")).toBe("power");
  });
});

describe("custom text starters", () => {
  const lead = { name: "Sarah Lee", serviceType: "Water", source: "meta-ads", address: "12 Elm St, Traverse City" };

  it("an edited text saves as a starter that fills in for other leads", () => {
    const filled = fillText("new-first", lead);
    const edited = filled.replace("I'd love to hear", "I would really like to hear");
    const tpl = toTextTemplate(edited, lead);
    expect(tpl).toContain("Hi {first},");
    expect(tpl).toContain("{reachedOut}");
    expect(tpl).toContain("{utility} line");
    expect(tpl).toContain("{bestTimeSentence}");
    const other = fillText("new-first", { name: "Tom", serviceType: "Power", source: "website" }, {}, { "new-first": tpl });
    expect(other).toContain("Hi Tom,");
    expect(other).toContain("power line");
    expect(other).toContain("through our website");
    expect(other).toContain("I would really like to hear");
  });

  it("only the greeting's name is swapped", () => {
    const tpl = toTextTemplate("Hi Bill, this is Bill with FiberNorth.", { name: "Bill" });
    expect(tpl).toBe("Hi {first}, this is {myFirst} with FiberNorth.");
  });

  it("links and streets go back to tokens", () => {
    const extras = { quoteUrl: "https://fibernorth.com/p/abc" };
    const tpl = toTextTemplate(fillText("quote-followup", lead, extras), lead, extras);
    expect(tpl).toContain("{quoteLinkText}");
    expect(toTextTemplate(fillText("walk", lead), lead)).toContain("{place}");
  });

  it("falls back to the built-in starter when the custom one is blank or unknown", () => {
    expect(fillText("missed", { name: "Don" }, {}, { missed: "  " })).toBe(fillText("missed", { name: "Don" }));
    expect(fillText("nope", {}, {}, { nope: "x" })).toBe("");
  });
});

describe("the sender's own info", () => {
  const lead = { name: "Sarah Lee", serviceType: "Power", source: "meta-ads" };

  it("defaults to Bill and the FiberNorth numbers", () => {
    expect(fillText("new-first", lead)).toContain("this is Bill with");
    const t = LEAD_EMAIL_TEMPLATES.find((x) => x.key === "checkin")!;
    expect(fillTemplate(t, lead).body).toContain("Bill Gaylord");
    expect(fillTemplate(t, lead).body).toContain("(231) 384-0105");
  });

  it("uses the signed-in person's name and number", () => {
    const me = { name: "Sam Jones", phone: "(231) 555-0100" };
    expect(fillText("new-first", lead, { me })).toContain("this is Sam with");
    const body = fillTemplate(LEAD_EMAIL_TEMPLATES.find((x) => x.key === "checkin")!, lead, { me }).body;
    expect(body).toContain("Sam Jones");
    expect(body).toContain("(231) 555-0100");
    expect(body).not.toContain("Bill");
  });

  it("voicemail scripts fill like texts", () => {
    for (const v of LEAD_VM_SCRIPTS) {
      const out = fillText(v.key, lead, { me: { name: "Sam Jones" } });
      expect(out).toContain("Sam");
      expect(out).not.toMatch(/\{\w+\}/);
    }
  });

  it("saving an edit turns the sender's name back into a fill-in", () => {
    const me = { name: "Sam Jones" };
    const tpl = toTextTemplate(fillText("missed", lead, { me }), lead, { me });
    expect(tpl).toContain("it's {myFirst} with");
    expect(fillText("missed", lead, {}, { missed: tpl })).toContain("it's Bill with");
  });
});
