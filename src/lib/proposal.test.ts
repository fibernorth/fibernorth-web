import { describe, it, expect } from "vitest";
import { proposalSubject } from "./proposal";

describe("proposalSubject", () => {
  it("names the job, the place and the amount", () => {
    expect(proposalSubject({ version: 1, address: "123 Main St, Lake Ann", total: 7072 })).toBe(
      "Your directional drilling quote, 123 Main St, Lake Ann: $7,072.00"
    );
  });
  it("says it is a revision, and which one", () => {
    expect(proposalSubject({ version: 2, address: "123 Main St", total: 7072 })).toBe("Revised quote (v2), 123 Main St: $7,072.00");
  });
  it("falls back to the customer's name, then to nothing", () => {
    expect(proposalSubject({ version: 1, name: "Pat Example", total: 3000 })).toBe("Your directional drilling quote, Pat Example: $3,000.00");
    expect(proposalSubject({ version: 1, total: 3000 })).toBe("Your directional drilling quote: $3,000.00");
  });
});
