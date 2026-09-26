import { describe, it, expect } from "vitest";
import { limit, orderBy, where } from "firebase/firestore";
import { constraintsKeyOf } from "@/hooks/use-firestore-collection";

describe("constraintsKeyOf", () => {
  it("changes when a filter's value changes, not only its kind", () => {
    expect(constraintsKeyOf([where("leadId", "==", "a")])).not.toBe(constraintsKeyOf([where("leadId", "==", "b")]));
    expect(constraintsKeyOf([limit(10)])).not.toBe(constraintsKeyOf([limit(20)]));
  });
  it("is stable for the same query built again", () => {
    expect(constraintsKeyOf([orderBy("createdAt", "desc")])).toBe(constraintsKeyOf([orderBy("createdAt", "desc")]));
    expect(constraintsKeyOf(undefined)).toBe("[]");
  });
});
