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
      expect(fillText(t.key, { name: "Don" }).endsWith("Bill, FiberNorth")).toBe(true);
      expect(fillText(t.key, { name: "Don" }).length).toBeLessThan(320);
    }
    for (const k of ["quote-followup", "quote-expiring", "review"]) {
      expect(LEAD_EMAIL_TEMPLATES.find((t) => t.key === k)!.body).toContain("Bill, FiberNorth");
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
