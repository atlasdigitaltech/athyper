import { describe, expect, it } from "vitest";
import { evaluateSourceChange, valuesEqual } from "../source-change.js";
import type { DefaultsMap, EntityFieldDefaults, OnSourceChangeLayer } from "../types.js";

function rule(over: Partial<EntityFieldDefaults["on_source_change"] extends (infer R)[] | undefined ? R : never> = {}) {
  return {
    sources: ["supplier_id"],
    action:  "clear" as const,
    layers:  ["client_on_change"] as OnSourceChangeLayer[],
    ...over,
  };
}

function defaultsWith(target: string, rules: ReturnType<typeof rule>[]): DefaultsMap {
  return { [target]: { on_source_change: rules } };
}

describe("evaluateSourceChange — basic firing", () => {
  it("emits clear intent when source changed (default when)", () => {
    const defaults = defaultsWith("remitto_address_id", [rule()]);
    const intents = evaluateSourceChange({
      changedFields: ["supplier_id"],
      oldValues:     { supplier_id: "A", remitto_address_id: "addr-1" },
      newValues:     { supplier_id: "B", remitto_address_id: "addr-1" },
      defaultsByField: defaults,
      layer: "client_on_change",
    });
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      target: "remitto_address_id",
      action: "clear",
      sources: ["supplier_id"],
      reason: "source_changed",
    });
  });

  it("does not fire when source value is unchanged", () => {
    const defaults = defaultsWith("remitto_address_id", [rule()]);
    const intents = evaluateSourceChange({
      changedFields: ["supplier_id"],
      oldValues:     { supplier_id: "A" },
      newValues:     { supplier_id: "A" },
      defaultsByField: defaults,
      layer: "client_on_change",
    });
    expect(intents).toEqual([]);
  });

  it("does not fire when the changed field is not a source", () => {
    const defaults = defaultsWith("remitto_address_id", [rule()]);
    const intents = evaluateSourceChange({
      changedFields: ["description"],
      oldValues:     { supplier_id: "A", description: "x" },
      newValues:     { supplier_id: "A", description: "y" },
      defaultsByField: defaults,
      layer: "client_on_change",
    });
    expect(intents).toEqual([]);
  });

  it("returns empty when changedFields is empty", () => {
    const defaults = defaultsWith("remitto_address_id", [rule()]);
    const intents = evaluateSourceChange({
      changedFields: [],
      oldValues:     {},
      newValues:     {},
      defaultsByField: defaults,
      layer: "client_on_change",
    });
    expect(intents).toEqual([]);
  });
});

describe("evaluateSourceChange — layer filtering", () => {
  it("skips rules whose layers do not include the active layer", () => {
    const defaults = defaultsWith("remitto_address_id", [
      rule({ layers: ["server_on_save"] }),
    ]);
    const intents = evaluateSourceChange({
      changedFields: ["supplier_id"],
      oldValues:     { supplier_id: "A" },
      newValues:     { supplier_id: "B" },
      defaultsByField: defaults,
      layer: "client_on_change",
    });
    expect(intents).toEqual([]);
  });

  it("includes rules covering the active layer (one of many)", () => {
    const defaults = defaultsWith("remitto_address_id", [
      rule({ layers: ["client_on_change", "server_on_save"] }),
    ]);
    const intents = evaluateSourceChange({
      changedFields: ["supplier_id"],
      oldValues:     { supplier_id: "A" },
      newValues:     { supplier_id: "B" },
      defaultsByField: defaults,
      layer: "server_on_save",
    });
    expect(intents).toHaveLength(1);
  });
});

describe("evaluateSourceChange — when predicates", () => {
  it("source_value_in: passes only when new value is in the list", () => {
    const defaults = defaultsWith("target", [
      rule({ when: { source_value_in: ["X", "Y"] } }),
    ]);
    const yes = evaluateSourceChange({
      changedFields: ["supplier_id"],
      oldValues: { supplier_id: "A" },
      newValues: { supplier_id: "X" },
      defaultsByField: defaults,
      layer: "client_on_change",
    });
    const no = evaluateSourceChange({
      changedFields: ["supplier_id"],
      oldValues: { supplier_id: "A" },
      newValues: { supplier_id: "Z" },
      defaultsByField: defaults,
      layer: "client_on_change",
    });
    expect(yes).toHaveLength(1);
    expect(no).toEqual([]);
  });

  it("source_value_in: null matches blank values", () => {
    const defaults = defaultsWith("target", [
      rule({ when: { source_value_in: null } }),
    ]);
    const yes = evaluateSourceChange({
      changedFields: ["supplier_id"],
      oldValues: { supplier_id: "A" },
      newValues: { supplier_id: null },
      defaultsByField: defaults,
      layer: "client_on_change",
    });
    expect(yes).toHaveLength(1);
    expect(yes[0]!.reason).toBe("source_value_blank");
  });

  it("source_value_not_in: blocks listed values", () => {
    const defaults = defaultsWith("target", [
      rule({ when: { source_value_not_in: ["X"] } }),
    ]);
    const intents = evaluateSourceChange({
      changedFields: ["supplier_id"],
      oldValues: { supplier_id: "A" },
      newValues: { supplier_id: "X" },
      defaultsByField: defaults,
      layer: "client_on_change",
    });
    expect(intents).toEqual([]);
  });

  it("status_in: requires rowStatus in set", () => {
    const defaults = defaultsWith("target", [
      rule({ when: { status_in: ["draft"] } }),
    ]);
    const inDraft = evaluateSourceChange({
      changedFields: ["supplier_id"],
      oldValues: { supplier_id: "A" },
      newValues: { supplier_id: "B" },
      defaultsByField: defaults,
      layer: "client_on_change",
      rowStatus: "draft",
    });
    const inPosted = evaluateSourceChange({
      changedFields: ["supplier_id"],
      oldValues: { supplier_id: "A" },
      newValues: { supplier_id: "B" },
      defaultsByField: defaults,
      layer: "client_on_change",
      rowStatus: "posted",
    });
    expect(inDraft).toHaveLength(1);
    expect(inPosted).toEqual([]);
  });

  it("target_was_user_overridden: fires only when provenance is user_input", () => {
    const defaults = defaultsWith("payment_term_id", [
      rule({
        action: "warn",
        when: { target_was_user_overridden: true },
      }),
    ]);
    const overridden = evaluateSourceChange({
      changedFields: ["supplier_id"],
      oldValues: { supplier_id: "A" },
      newValues: { supplier_id: "B" },
      defaultsByField: defaults,
      provenance: { payment_term_id: "user_input" },
      layer: "client_on_change",
    });
    const derived = evaluateSourceChange({
      changedFields: ["supplier_id"],
      oldValues: { supplier_id: "A" },
      newValues: { supplier_id: "B" },
      defaultsByField: defaults,
      provenance: { payment_term_id: "derived" },
      layer: "client_on_change",
    });
    expect(overridden).toHaveLength(1);
    expect(derived).toEqual([]);
  });

  it("target_was_user_overridden: silently ignored on server layer", () => {
    const defaults = defaultsWith("payment_term_id", [
      rule({
        action: "warn",
        layers: ["server_on_save"],
        when: { target_was_user_overridden: true },
      }),
    ]);
    // Server has no provenance — rule fires anyway because predicate is skipped.
    const intents = evaluateSourceChange({
      changedFields: ["supplier_id"],
      oldValues: { supplier_id: "A" },
      newValues: { supplier_id: "B" },
      defaultsByField: defaults,
      provenance: {},
      layer: "server_on_save",
    });
    // warn is server-ignored at runtime but the evaluator still emits it;
    // the server validator filters them out.
    expect(intents).toHaveLength(1);
  });

  it("source_changed=false predicate gate disables the trigger", () => {
    const defaults = defaultsWith("target", [
      rule({ when: { source_changed: false } }),
    ]);
    const intents = evaluateSourceChange({
      changedFields: ["supplier_id"],
      oldValues: { supplier_id: "A" },
      newValues: { supplier_id: "B" },
      defaultsByField: defaults,
      layer: "client_on_change",
    });
    // With source_changed:false we skip the source-changed precheck, so the
    // rule emits even though the value did change. Useful for "always run on
    // any touch of source" patterns.
    expect(intents).toHaveLength(1);
  });
});

describe("evaluateSourceChange — multi-rule ordering", () => {
  it("orders intents by target, then action priority (lock < clear < refilter < rederive < validate < warn)", () => {
    const defaults: DefaultsMap = {
      payment_term_id: {
        on_source_change: [
          rule({ action: "warn" }),
          rule({ action: "rederive", resolver: "supplier.default_payment_term" }),
        ],
      },
      billto_address_id: {
        on_source_change: [
          rule({ action: "clear", sources: ["company_code_id"] }),
        ],
      },
      remitto_address_id: {
        on_source_change: [
          rule({ action: "clear" }),
        ],
      },
    };
    const intents = evaluateSourceChange({
      changedFields: ["supplier_id", "company_code_id"],
      oldValues: { supplier_id: "A", company_code_id: "X" },
      newValues: { supplier_id: "B", company_code_id: "Y" },
      defaultsByField: defaults,
      layer: "client_on_change",
    });
    expect(intents.map((i) => `${i.target}:${i.action}`)).toEqual([
      "billto_address_id:clear",
      "payment_term_id:rederive",
      "payment_term_id:warn",
      "remitto_address_id:clear",
    ]);
  });

  it("includes mode and resolver in intent when present on rule", () => {
    const defaults = defaultsWith("payment_term_id", [
      rule({ action: "rederive", resolver: "supplier.default_payment_term", mode: "if_empty_or_derived" }),
    ]);
    const intents = evaluateSourceChange({
      changedFields: ["supplier_id"],
      oldValues: { supplier_id: "A" },
      newValues: { supplier_id: "B" },
      defaultsByField: defaults,
      layer: "client_on_change",
    });
    expect(intents[0]).toMatchObject({
      action: "rederive",
      resolver: "supplier.default_payment_term",
      mode: "if_empty_or_derived",
    });
  });

  it("passes message through unchanged", () => {
    const defaults = defaultsWith("remitto_address_id", [
      rule({ message: "Cleared because supplier changed" }),
    ]);
    const intents = evaluateSourceChange({
      changedFields: ["supplier_id"],
      oldValues: { supplier_id: "A" },
      newValues: { supplier_id: "B" },
      defaultsByField: defaults,
      layer: "client_on_change",
    });
    expect(intents[0]!.message).toBe("Cleared because supplier changed");
  });
});

describe("evaluateSourceChange — single-pass guarantee", () => {
  it("does not re-trigger from intents (changedFields drives the queue, not outputs)", () => {
    // A → B (clear B), B → C (clear C). Changing A should emit only target=B
    // because the evaluator does not re-feed B as a changed field.
    const defaults: DefaultsMap = {
      B: { on_source_change: [rule({ sources: ["A"] })] },
      C: { on_source_change: [rule({ sources: ["B"] })] },
    };
    const intents = evaluateSourceChange({
      changedFields: ["A"],
      oldValues: { A: 1, B: 2, C: 3 },
      newValues: { A: 9, B: 2, C: 3 },
      defaultsByField: defaults,
      layer: "client_on_change",
    });
    expect(intents.map((i) => i.target)).toEqual(["B"]);
  });
});

describe("valuesEqual", () => {
  it("compares primitives strictly", () => {
    expect(valuesEqual(1, 1)).toBe(true);
    expect(valuesEqual("a", "a")).toBe(true);
    expect(valuesEqual(true, true)).toBe(true);
    expect(valuesEqual(1, "1")).toBe(false);
  });

  it("treats null and undefined as equal to each other", () => {
    expect(valuesEqual(null, undefined)).toBe(true);
    expect(valuesEqual(undefined, undefined)).toBe(true);
    expect(valuesEqual(null, null)).toBe(true);
  });

  it("compares arrays element-wise by length", () => {
    expect(valuesEqual([1, 2], [1, 2])).toBe(true);
    expect(valuesEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(valuesEqual([1, 2], [1, 3])).toBe(false);
  });

  it("compares simple objects shallowly", () => {
    expect(valuesEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(valuesEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(valuesEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});
