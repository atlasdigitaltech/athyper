/**
 * isEntityFieldWritable status-lock tests.
 *
 * Verifies the editable_in_status enforcement added in Patch Set 1.1.
 * Other writability dimensions (is_read_only, is_computed, is_write_once,
 * system origin, SYSTEM_WRITE_COLUMNS) are covered indirectly via integration
 * tests; here we focus on the new status gate.
 */

import { describe, it, expect } from "vitest";
import { isEntityFieldWritable, type EntityWriteFieldRule } from "../routes/entity-mutation-guard.js";

function makeRule(overrides: Partial<EntityWriteFieldRule> = {}): EntityWriteFieldRule {
  return {
    name:           "supplier_id",
    column_name:    "supplier_id",
    origin:         "standard",
    is_read_only:   false,
    is_computed:    false,
    is_write_once:  false,
    editability:    {},
    ...overrides,
  };
}

describe("isEntityFieldWritable — status lock (editable_in_status)", () => {

  it("CREATE ignores editable_in_status (no record yet)", () => {
    const rule = makeRule({ editability: { editable_in_status: ["draft"] } });
    expect(isEntityFieldWritable(rule, "create")).toEqual({ writable: true });
    // Even if a status hint is passed in error, CREATE never gates on it
    expect(isEntityFieldWritable(rule, "create", "posted")).toEqual({ writable: true });
  });

  it("UPDATE in allowed status → writable", () => {
    const rule = makeRule({ editability: { editable_in_status: ["draft"] } });
    expect(isEntityFieldWritable(rule, "update", "draft")).toEqual({ writable: true });
  });

  it("UPDATE outside allowed status → FIELD_LOCKED_BY_STATUS", () => {
    const rule = makeRule({ editability: { editable_in_status: ["draft"] } });
    expect(isEntityFieldWritable(rule, "update", "posted")).toEqual({
      writable: false,
      reason:   "FIELD_LOCKED_BY_STATUS",
    });
  });

  it("UPDATE with multi-status allowlist", () => {
    const rule = makeRule({ editability: { editable_in_status: ["draft", "rejected"] } });
    expect(isEntityFieldWritable(rule, "update", "rejected")).toEqual({ writable: true });
    expect(isEntityFieldWritable(rule, "update", "approved")).toEqual({
      writable: false,
      reason:   "FIELD_LOCKED_BY_STATUS",
    });
  });

  it("Comparison is case-insensitive", () => {
    const rule = makeRule({ editability: { editable_in_status: ["draft"] } });
    expect(isEntityFieldWritable(rule, "update", "DRAFT")).toEqual({ writable: true });
    expect(isEntityFieldWritable(rule, "update", "Draft")).toEqual({ writable: true });
  });

  it("No editable_in_status → writable in any status (back-compat)", () => {
    const rule = makeRule({ editability: {} });
    expect(isEntityFieldWritable(rule, "update", "draft")).toEqual({ writable: true });
    expect(isEntityFieldWritable(rule, "update", "posted")).toEqual({ writable: true });
  });

  it("Missing recordStatus + non-empty rule → writable (cannot gate without status)", () => {
    const rule = makeRule({ editability: { editable_in_status: ["draft"] } });
    expect(isEntityFieldWritable(rule, "update")).toEqual({ writable: true });
    expect(isEntityFieldWritable(rule, "update", null)).toEqual({ writable: true });
    expect(isEntityFieldWritable(rule, "update", "")).toEqual({ writable: true });
  });

  it("Alias keys are equivalent (camelCase, snake_case, editable_in)", () => {
    const aliases: Array<Record<string, unknown>> = [
      { editable_in_status:  ["draft"] },
      { editableInStatus:    ["draft"] },
      { editable_in:         ["draft"] },
      { editableInStatuses:  ["draft"] },
    ];
    for (const e of aliases) {
      const rule = makeRule({ editability: e });
      expect(isEntityFieldWritable(rule, "update", "draft")).toEqual({ writable: true });
      expect(isEntityFieldWritable(rule, "update", "posted")).toEqual({
        writable: false,
        reason:   "FIELD_LOCKED_BY_STATUS",
      });
    }
  });

  it("Structural denials still win over status gate", () => {
    // is_read_only beats any status allowlist
    expect(
      isEntityFieldWritable(
        makeRule({ is_read_only: true, editability: { editable_in_status: ["draft"] } }),
        "update",
        "draft",
      ),
    ).toEqual({ writable: false, reason: "FIELD_READ_ONLY" });

    // is_computed beats any status allowlist
    expect(
      isEntityFieldWritable(
        makeRule({ is_computed: true, editability: { editable_in_status: ["draft"] } }),
        "update",
        "draft",
      ),
    ).toEqual({ writable: false, reason: "FIELD_COMPUTED" });

    // is_write_once on update beats any status allowlist
    expect(
      isEntityFieldWritable(
        makeRule({ is_write_once: true, editability: { editable_in_status: ["draft"] } }),
        "update",
        "draft",
      ),
    ).toEqual({ writable: false, reason: "FIELD_WRITE_ONCE" });
  });

  it("Undefined rule (field not registered) → FIELD_NOT_REGISTERED", () => {
    expect(isEntityFieldWritable(undefined, "create")).toEqual({ writable: false, reason: "FIELD_NOT_REGISTERED" });
    expect(isEntityFieldWritable(undefined, "update", "draft")).toEqual({ writable: false, reason: "FIELD_NOT_REGISTERED" });
  });

  it("Empty editable_in array still denies (existing back-compat)", () => {
    const rule = makeRule({ editability: { editable_in: [] } });
    expect(isEntityFieldWritable(rule, "update", "draft")).toEqual({
      writable: false,
      reason:   "FIELD_NOT_EDITABLE",
    });
  });

  it("hold_reason use case — only editable while on_hold", () => {
    const rule = makeRule({
      name:        "hold_reason",
      column_name: "hold_reason",
      editability: { editable_in_status: ["on_hold"] },
    });
    expect(isEntityFieldWritable(rule, "update", "on_hold")).toEqual({ writable: true });
    expect(isEntityFieldWritable(rule, "update", "draft")).toEqual({
      writable: false,
      reason:   "FIELD_LOCKED_BY_STATUS",
    });
    expect(isEntityFieldWritable(rule, "update", "posted")).toEqual({
      writable: false,
      reason:   "FIELD_LOCKED_BY_STATUS",
    });
  });
});
