import { describe, it, expect } from "vitest";
import { fillTemplate, fillText, LEAD_EMAIL_TEMPLATES, LEAD_TEXT_TEMPLATES, utilityWords } from "./lead-email-templates";

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
      expect(LEAD_EMAIL_TEMPLATES.find((t) => t.key === k)!.body).toContain("Bill, FiberNorth");
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
