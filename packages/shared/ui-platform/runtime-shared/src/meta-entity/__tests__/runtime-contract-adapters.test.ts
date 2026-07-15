import { describe, expect, it } from "vitest";
import type { MetaEntityField, MetaEntityOperation } from "@athyper/runtime-contracts";
import {
  adaptField,
  adaptOperation,
  assertUuidOrNil,
  NIL_UUID,
  normalizeCardinality,
  normalizeDataType,
  normalizeOrigin,
} from "../runtime-contract-adapters";

const VALID_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

function makeField(overrides: Partial<MetaEntityField> = {}): MetaEntityField {
  return {
    key: VALID_UUID,
    name: "supplier_id",
    columnName: "supplier_id",
    label: "Supplier",
    dataType: "uuid",
    order: 10,
    isRequired: true,
    isUnique: false,
    isSearchable: true,
    isFilterable: true,
    isSortable: true,
    isGroupable: false,
    isAggregatable: false,
    isReadOnly: false,
    isComputed: false,
    isWriteOnce: false,
    ...overrides,
  };
}

function makeOperation(overrides: Partial<MetaEntityOperation> = {}): MetaEntityOperation {
  return {
    key: VALID_UUID,
    permissionCode: "supplier.activate",
    surface: "DETAIL",
    placement: "OVERFLOW",
    handlerType: "API",
    handlerTarget: null,
    isRecordRequired: true,
    order: 20,
    label: "Activate",
    icon: null,
    enabled: true,
    actionGroup: "lifecycle",
    intent: "success",
    ...overrides,
  };
}

describe("runtime contract adapters", () => {
  it("normalizes ids, data types, cardinality, and origin", () => {
    expect(assertUuidOrNil(VALID_UUID)).toBe(VALID_UUID);
    expect(assertUuidOrNil("not-a-uuid")).toBe(NIL_UUID);
    expect(normalizeDataType("money")).toBe("money");
    expect(normalizeDataType("custom_type")).toBe("string");
    expect(normalizeCardinality("many")).toBe("many");
    expect(normalizeCardinality("zero_or_one")).toBe("zero_or_one");
    expect(normalizeCardinality("scalar")).toBe("one");
    expect(normalizeOrigin("system")).toBe("system");
    expect(normalizeOrigin("standard")).toBe("standard");
    expect(normalizeOrigin("business")).toBe("business");
    expect(normalizeOrigin("user")).toBe("business");
  });

  it("adapts runtime descriptor fields into legacy entity fields", () => {
    const field = adaptField(makeField({
      key: "synthetic_key",
      columnName: "supplier_id",
      cardinality: "scalar",
      dataType: "exotic_type",
      enumDomainCode: "entity_status",
      filterConfig: { quick_filter: true } as unknown as MetaEntityField["filterConfig"],
      groupKey: "general",
      isReadOnly: true,
      isPii: true,
      origin: "user",
      referenceConfig: { ref_entity: "supplier", label_field: "name" } as unknown as MetaEntityField["referenceConfig"],
      validation: { max_length: 80 } as unknown as MetaEntityField["validation"],
    }));

    expect(field.id).toBe(NIL_UUID);
    expect(field.column_name).toBe("supplier_id");
    expect(field.cardinality).toBe("one");
    expect(field.data_type).toBe("string");
    expect(field.enum_domain_code).toBe("entity_status");
    expect(field.filter_config).toEqual({ quick_filter: true });
    expect(field.group_key).toBe("general");
    expect(field.is_readonly).toBe(true);
    expect(field.is_pii).toBe(true);
    expect(field.origin).toBe("business");
    expect(field.reference_config).toEqual({ ref_entity: "supplier", label_field: "name" });
    expect(field.validation_rules).toEqual({ max_length: 80 });
    expect((field as Record<string, unknown>)["is_read_only"]).toBeUndefined();
  });

  it("adapts runtime descriptor operations into legacy entity operations", () => {
    const operation = adaptOperation(makeOperation({
      key: "operation_key",
      disabledReason: "No permission",
      handlerTarget: null,
      icon: null,
      lifecycleTransitions: [{
        transitionId: VALID_UUID,
        lifecycleId: VALID_UUID,
        fromState: "draft",
        toState: "active",
        requiresReason: true,
        requiresConfirmation: false,
      }],
    }));

    expect(operation.id).toBe(NIL_UUID);
    expect(operation.entity_name).toBe("");
    expect(operation.permission_code).toBe("supplier.activate");
    expect(operation.handler_target).toBeNull();
    expect(operation.icon_override).toBeNull();
    expect(operation.disabled_reason).toBe("No permission");
    expect(operation.action_group).toBe("lifecycle");
    expect(operation.lifecycle_transitions?.[0]?.from_state).toBe("draft");
    expect(operation.lifecycle_transitions?.[0]?.to_state).toBe("active");
    expect((operation.lifecycle_transitions?.[0] as Record<string, unknown>)["fromState"]).toBeUndefined();
  });
});
