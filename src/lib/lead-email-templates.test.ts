import { describe, it, expect } from "vitest";
import { fillTemplate, LEAD_EMAIL_TEMPLATES, utilityWords } from "./lead-email-templates";

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

  it("puts common lead types in plain words", () => {
    expect(utilityWords("Internet")).toBe("fiber / internet");
    expect(utilityWords("Other / Not sure")).toBe("utility");
    expect(utilityWords("Power")).toBe("power");
  });
});
