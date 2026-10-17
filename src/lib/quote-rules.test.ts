import { describe, it, expect } from "vitest";
import {
  approvalReasonFor,
  belowRules,
  cleanPricing,
  DEFAULT_PRICE_LIST,
  DEFAULT_PRICING_RULES,
  linePrice,
  mergeRuleLines,
  quoteRules,
} from "./quote-rules";

const run = (people: number, days: number, ...feet: number[]) =>
  quoteRules({ people, days, lines: feet.map((f) => ({ feet: f })) });

describe("quoteRules: Bill's examples", () => {
  it("2 people, 1 day, one line ≤150 ft = $3,000", () => {
    const r = run(2, 1, 120);
    expect(r.labor).toBe(3000);
    expect(r.method).toBe("crew");
    expect(r.items).toEqual([{ key: "rules:crew", description: "Crew: 2 people × 1 day × $1,500", amount: 3000 }]);
    expect(r.laborPerManDay).toBe(1500);
  });

  it("2 lines ≤150 ft = $4,000 (extra line +$1,000)", () => {
    const r = run(2, 1, 120, 90);
    expect(r.labor).toBe(4000);
    expect(r.items.map((i) => [i.key, i.description, i.amount])).toEqual([
      ["rules:crew", "Crew: 2 people × 1 day × $1,500", 3000],
      ["rules:line:1", "Extra line ≤150 ft (90 ft)", 1000],
    ]);
  });

  it("one 250 ft line = max($3,000, $4,000) = $4,000", () => {
    const r = run(2, 1, 250);
    expect(r.byCrew.total).toBe(3000);
    expect(r.byFootage.total).toBe(4000);
    expect(r.labor).toBe(4000);
    expect(r.method).toBe("footage");
    expect(r.items).toEqual([{ key: "rules:line:0", description: "Line 250 ft (200–300 ft)", amount: 4000 }]);
  });

  it("3 people, 2 days, one short line = $9,000", () => {
    const r = run(3, 2, 100);
    expect(r.labor).toBe(9000);
    expect(r.items[0].description).toBe("Crew: 3 people × 2 days × $1,500");
    expect(r.manDays).toBe(6);
  });

  it("a long line plus a short line: the short one is an extra line on top", () => {
    expect(run(2, 1, 250, 100).labor).toBe(5000);
    // A big crew covers it all.
    expect(run(3, 2, 250, 100).labor).toBe(9000);
  });

  it("prices the tiers at their edges and per foot over 300", () => {
    const r = DEFAULT_PRICING_RULES;
    expect(linePrice(150, r).amount).toBe(1000);
    expect(linePrice(151, r).amount).toBe(3500);
    expect(linePrice(200, r).amount).toBe(3500);
    expect(linePrice(201, r).amount).toBe(4000);
    expect(linePrice(300, r).amount).toBe(4000);
    expect(linePrice(420, r)).toEqual({ amount: 5460, description: "Line 420 ft × $13/ft", short: false });
    expect(run(2, 1, 180).labor).toBe(3500);
    expect(run(2, 1, 420, 420).labor).toBe(10920);
  });

  it("no lines: the crew alone; no crew: footage alone", () => {
    expect(run(2, 1).labor).toBe(3000);
    const none = run(0, 0, 250);
    expect(none.labor).toBe(4000);
    expect(none.laborPerManDay).toBeNull();
  });

  it("follows the owner's edited numbers", () => {
    const r = quoteRules({ people: 1, days: 1, lines: [{ feet: 400 }] }, { ...DEFAULT_PRICING_RULES, perPersonDay: 2000, perFootOver: 10 });
    expect(r.byCrew.total).toBe(2000);
    expect(r.labor).toBe(4000);
  });
});

describe("belowRules", () => {
  it("is empty when the labor meets the rules", () => {
    expect(belowRules(3000, run(2, 1, 120))).toBe("");
    expect(belowRules(3500, run(2, 1, 120))).toBe("");
  });

  it("says how far under the rules a quote is", () => {
    expect(belowRules(3500, run(2, 1, 250))).toBe("Below the price rules: $500 less than $4,000");
  });

  it("flags labor under $1,250 per man-day", () => {
    expect(belowRules(2000, run(2, 1, 120))).toBe(
      "Below the price rules: $1,000 less than $3,000; Under $1,250 per man-day ($1,000)"
    );
    // Rules lowered by the owner, floor still applies.
    const cheap = { ...DEFAULT_PRICING_RULES, perPersonDay: 1000 };
    expect(belowRules(2000, quoteRules({ people: 2, days: 1, lines: [] }, cheap), cheap)).toBe("Under $1,250 per man-day ($1,000)");
  });

  it("checks a saved quote's work lines, never its materials", () => {
    const crew = { people: 2, days: 1, lines: [{ feet: 120 }] };
    const lines = [
      { kind: "work", qty: 1, unitPrice: 2500 },
      { kind: "material", qty: 120, unitPrice: 5 },
    ];
    expect(approvalReasonFor({ quoteLines: lines }, crew)).toContain("$500 less than $3,000");
    expect(approvalReasonFor({ quoteLines: null, quotedPrice: 3000 }, crew)).toBe("");
    expect(approvalReasonFor({ quoteLines: null, quotedPrice: null }, crew)).toBe("");
  });
});

describe("mergeRuleLines", () => {
  type L = { description: string; key?: string; source?: "auto" | "manual" };
  const fresh: L[] = [
    { description: "Crew", key: "rules:crew", source: "auto" },
    { description: "Extra", key: "rules:line:1", source: "auto" },
  ];

  it("puts rule lines first on a quote without them", () => {
    const cur: L[] = [{ description: "Conduit" }];
    expect(mergeRuleLines(cur, fresh).map((l) => l.description)).toEqual(["Crew", "Extra", "Conduit"]);
  });

  it("replaces old auto rule lines in place and keeps everything else", () => {
    const cur: L[] = [
      { description: "Hydrovac" },
      { description: "Old crew", key: "rules:crew", source: "auto" },
      { description: "Conduit" },
    ];
    expect(mergeRuleLines(cur, fresh).map((l) => l.description)).toEqual(["Hydrovac", "Crew", "Extra", "Conduit"]);
  });

  it("keeps a rule line the estimator edited, and leaves its auto twin out", () => {
    const cur: L[] = [{ description: "My crew", key: "rules:crew", source: "manual" }];
    expect(mergeRuleLines(cur, fresh).map((l) => l.description)).toEqual(["Extra", "My crew"]);
  });

  it("reset replaces edited rule lines and the old rate-sheet bore line", () => {
    const cur: L[] = [
      { description: "Directional bore, ~120 ft", key: "drawing:bore" },
      { description: "My crew", key: "rules:crew", source: "manual" },
      { description: "Conduit" },
    ];
    expect(mergeRuleLines(cur, fresh, { reset: true }).map((l) => l.description)).toEqual(["Crew", "Extra", "Conduit"]);
  });
});

describe("cleanPricing", () => {
  it("fills defaults for a missing doc", () => {
    const p = cleanPricing(undefined);
    expect(p.rules).toEqual(DEFAULT_PRICING_RULES);
    expect(p.items).toEqual(DEFAULT_PRICE_LIST);
    expect(p.items.find((i) => i.qboItem === "Labor:Fusion")?.price).toBe(75);
  });

  it("keeps good numbers, drops bad ones, and tidies items", () => {
    const p = cleanPricing({
      rules: { perPersonDay: "1600", perFootOver: -3, minPerManDay: "abc" },
      items: [
        { id: "a", name: " Pit ", kind: "work", unit: "each", price: "" },
        { id: "a", name: "Conduit", kind: "material", unit: "yards", price: 2.5, qboItem: "Conduit:2in", active: false },
        { name: "" },
      ],
    });
    expect(p.rules.perPersonDay).toBe(1600);
    expect(p.rules.perFootOver).toBe(13);
    expect(p.rules.minPerManDay).toBe(1250);
    expect(p.items).toEqual([
      { id: "a", name: "Pit", kind: "work", unit: "each", price: null, active: true },
      { id: "a-1", name: "Conduit", kind: "material", unit: "each", price: 2.5, qboItem: "Conduit:2in", active: false },
    ]);
  });
});

describe("over 300 ft", () => {
  it("never prices below the 200–300 ft line", () => {
    expect(linePrice(301, DEFAULT_PRICING_RULES).amount).toBe(4000);
    expect(linePrice(400, DEFAULT_PRICING_RULES).amount).toBe(5200);
  });
});
