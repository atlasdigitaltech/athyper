import { describe, expect, it } from "vitest";
import { detectCycles } from "../source-change-graph.js";
import type { DefaultsMap } from "../types.js";

const baseRule = (sources: string[], action: "clear" | "rederive" | "refilter" | "lock" | "warn" | "validate" = "clear") => ({
  sources,
  action,
  layers: ["client_on_change" as const],
});

describe("detectCycles", () => {
  it("returns empty when there are no rules", () => {
    expect(detectCycles({}, "purchase_invoice")).toEqual([]);
  });

  it("returns empty for a simple non-cyclic graph", () => {
    const defaults: DefaultsMap = {
      remitto_address_id:  { on_source_change: [baseRule(["supplier_id"])] },
      billfrom_address_id: { on_source_change: [baseRule(["supplier_id"])] },
      billto_address_id:   { on_source_change: [baseRule(["company_code_id"], "refilter")] },
    };
    expect(detectCycles(defaults, "purchase_invoice")).toEqual([]);
  });

  it("detects a direct two-node cycle A↔B (both mutating)", () => {
    const defaults: DefaultsMap = {
      A: { on_source_change: [baseRule(["B"])] },
      B: { on_source_change: [baseRule(["A"])] },
    };
    const cycles = detectCycles(defaults, "x");
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.cycle.join("→")).toMatch(/^A→B→A$|^B→A→B$/);
  });

  it("detects an indirect cycle A→B→C→A", () => {
    const defaults: DefaultsMap = {
      A: { on_source_change: [baseRule(["C"])] },
      B: { on_source_change: [baseRule(["A"])] },
      C: { on_source_change: [baseRule(["B"])] },
    };
    const cycles = detectCycles(defaults, "x");
    expect(cycles).toHaveLength(1);
  });

  it("detects a self-loop A→A", () => {
    const defaults: DefaultsMap = {
      A: { on_source_change: [baseRule(["A"])] },
    };
    const cycles = detectCycles(defaults, "x");
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.cycle).toEqual(["A", "A"]);
  });

  it("ignores cycles formed only by warn/validate rules (read-only)", () => {
    const defaults: DefaultsMap = {
      A: { on_source_change: [baseRule(["B"], "warn")] },
      B: { on_source_change: [baseRule(["A"], "validate")] },
    };
    expect(detectCycles(defaults, "x")).toEqual([]);
  });

  it("does not flag a cycle when only one direction is mutating", () => {
    // Spec §8: warn/validate edges are exempt from cycle detection.
    // Removing the warn edge leaves a single B→A mutator — no cycle.
    const defaults: DefaultsMap = {
      A: { on_source_change: [baseRule(["B"], "warn")] },
      B: { on_source_change: [baseRule(["A"], "clear")] },
    };
    expect(detectCycles(defaults, "x")).toEqual([]);
  });

  it("dedupes the same cycle reported from different start nodes", () => {
    const defaults: DefaultsMap = {
      A: { on_source_change: [baseRule(["B"])] },
      B: { on_source_change: [baseRule(["C"])] },
      C: { on_source_change: [baseRule(["A"])] },
    };
    const cycles = detectCycles(defaults, "x");
    expect(cycles).toHaveLength(1);
  });

  it("reports multiple distinct cycles", () => {
    const defaults: DefaultsMap = {
      A: { on_source_change: [baseRule(["B"])] },
      B: { on_source_change: [baseRule(["A"])] },
      C: { on_source_change: [baseRule(["D"])] },
      D: { on_source_change: [baseRule(["C"])] },
    };
    const cycles = detectCycles(defaults, "x");
    expect(cycles).toHaveLength(2);
  });

  it("ignores rules whose action is not a mutator (lock counts as mutating)", () => {
    const defaults: DefaultsMap = {
      A: { on_source_change: [baseRule(["B"], "lock")] },
      B: { on_source_change: [baseRule(["A"], "rederive")] },
    };
    expect(detectCycles(defaults, "x")).toHaveLength(1);
  });
});
