import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  validateCompiledWriteFields,
  validateEntityWriteFields,
} from "../mutation/field-validation.js";
import type { EntityWriteFieldRule } from "../routes/entity-mutation-guard.js";

function compiledField(
  name: string,
  overrides: Partial<{
    computed: boolean;
    readOnly: boolean;
    systemManaged: boolean;
    systemOrigin: boolean;
    writeOnce: boolean;
    statusLimited: boolean;
    editableInStatuses: string[];
    create: boolean;
    update: boolean;
  }> = {},
): any {
  return {
    name,
    columnName: name,
    dataType: "text",
    origin: "user",
    writable: { create: overrides.create ?? true, update: overrides.update ?? true },
    required: { create: false, update: false },
    computed: overrides.computed ?? false,
    readOnly: overrides.readOnly ?? false,
    systemManaged: overrides.systemManaged ?? false,
    systemOrigin: overrides.systemOrigin ?? false,
    writeOnce: overrides.writeOnce ?? false,
    statusLimited: overrides.statusLimited ?? false,
    editableInStatuses: overrides.editableInStatuses ?? [],
  };
}

describe("strict explainable field validation", () => {
  const fields = [
    compiledField("name"),
    compiledField("description"),
    compiledField("currency"),
    compiledField("readonly", { readOnly: true, update: false }),
    compiledField("total", { computed: true, readOnly: true, update: false }),
    compiledField("created_by", { systemManaged: true, update: false }),
    compiledField("external_key", { writeOnce: true }),
    compiledField("supplier_id", { statusLimited: true, editableInStatuses: ["draft"] }),
  ];

  it("collects all violations instead of applying a partial payload as success", () => {
    const decision = validateCompiledWriteFields({
      input: {
        name: "PO 1",
        description: "test",
        currency: "MYR",
        readonly: "x",
        total: 100,
        created_by: "someone",
        external_key: "changed",
        supplier_id: "supplier-2",
        unexpected: true,
        another_unknown: true,
      },
      fields,
      action: "update",
      currentStatus: "approved",
      validationMode: "strict",
    });

    expect(decision.metrics).toEqual({ supplied: 10, accepted: 3, rejected: 7 });
    expect(decision.violations).toEqual({
      readonly: "READ_ONLY",
      total: "COMPUTED",
      created_by: "SYSTEM_MANAGED",
      external_key: "WRITE_ONCE",
      supplier_id: "LOCKED_IN_CURRENT_STATUS",
      unexpected: "FIELD_NOT_REGISTERED",
      another_unknown: "FIELD_NOT_REGISTERED",
    });
  });

  it("requires explicit lenient mode and returns warnings plus metrics", () => {
    const decision = validateCompiledWriteFields({
      input: { name: "PO 1", total: 100, unexpected: true },
      fields,
      action: "create",
      validationMode: "lenient",
    });
    expect(decision.accepted).toEqual({ name: "PO 1" });
    expect(decision.violations).toEqual({});
    expect(decision.warnings).toEqual({ total: "COMPUTED", unexpected: "FIELD_NOT_REGISTERED" });
    expect(decision.metrics).toEqual({ supplied: 3, accepted: 1, rejected: 2 });
  });

  it("gives classic and compiled workspace projections the same reason", () => {
    const rule: EntityWriteFieldRule = {
      name: "supplier_id",
      column_name: "supplier_id",
      origin: null,
      is_read_only: false,
      is_computed: false,
      is_write_once: false,
      editability: { editable_in_status: ["draft"] },
    };
    const classic = validateEntityWriteFields({
      input: { supplier_id: "s2" },
      rules: new Map([["supplier_id", rule]]),
      action: "update",
      currentStatus: "approved",
      validationMode: "strict",
    });
    const workspace = validateCompiledWriteFields({
      input: { supplier_id: "s2" },
      fields: [compiledField("supplier_id", { statusLimited: true, editableInStatuses: ["draft"] })],
      action: "update",
      currentStatus: "approved",
      validationMode: "strict",
    });
    expect(classic.violations).toEqual(workspace.violations);
  });

  it("reports lifecycle state and audit columns as system managed", () => {
    const rules = new Map<string, EntityWriteFieldRule>([
      ["status", {
        name: "status", column_name: "status", origin: "system",
        is_read_only: false, is_computed: false, is_write_once: false, editability: {},
      }],
      ["created_by", {
        name: "created_by", column_name: "created_by", origin: null,
        is_read_only: true, is_computed: false, is_write_once: false, editability: {},
      }],
    ]);
    expect(validateEntityWriteFields({
      input: { status: "posted", created_by: "actor" },
      rules,
      action: "update",
      validationMode: "strict",
    }).violations).toEqual({ status: "SYSTEM_MANAGED", created_by: "SYSTEM_MANAGED" });
  });

  it("does not expose lenient validation as a public HTTP route default", () => {
    const route = readFileSync(new URL("../routes/records.route.ts", import.meta.url), "utf8");
    expect(route).not.toContain('validationMode: "lenient"');
    expect(route).toContain('validationMode: "strict"');
  });
});
