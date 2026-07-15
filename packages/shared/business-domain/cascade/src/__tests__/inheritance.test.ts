import { describe, expect, it } from "vitest";
import { computeInheritance } from "../inheritance.js";

describe("computeInheritance", () => {
  it("returns 'unset' when both child and parent are null", () => {
    expect(computeInheritance(null, null)).toBe("unset");
    expect(computeInheritance(undefined, undefined)).toBe("unset");
    expect(computeInheritance(null, undefined)).toBe("unset");
  });

  it("returns 'inherited_null' when child is null but parent has a value", () => {
    expect(computeInheritance(null, "abc")).toBe("inherited_null");
    expect(computeInheritance(undefined, 42)).toBe("inherited_null");
  });

  it("returns 'inherited_match' when child === parent", () => {
    expect(computeInheritance("CC-101", "CC-101")).toBe("inherited_match");
    expect(computeInheritance(42, 42)).toBe("inherited_match");
  });

  it("returns 'overridden' when child differs from parent", () => {
    expect(computeInheritance("CC-101", "CC-202")).toBe("overridden");
    expect(computeInheritance("CC-101", null)).toBe("overridden");
    expect(computeInheritance("CC-101", undefined)).toBe("overridden");
  });
});
