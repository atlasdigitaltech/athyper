import { randomUUID } from "node:crypto";
import {
  nativeOperationMember,
  validateNativeOperation,
  type NativeOperationRow,
  nativeAiMembers,
  nativeAiRowNode,
  validateFoundationNode,
  validateNativeAiSemantics,
  type NativeAiGraph,
  type NativeAiKind,
  normalizedCoreMembers,
  normalizedLayoutMembers,
  validateNormalizedCoreRow,
  validateNormalizedLayoutRow,
  type NormalizedCoreKind,
  type NormalizedLayoutKind,
  AuthoringPolicyError,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson } from "./deterministic.js";
import { BRANCH_COLUMNS } from "./graph-storage-columns.js";

export type GraphTable = Exclude<
  keyof typeof BRANCH_COLUMNS,
  "entity_class_profile"
>;
export type NativeAiTable =
  | "entity_ai_profile"
  | "entity_ai_field"
  | "entity_ai_binding"
  | "entity_ai_reference"
  | "entity_ai_term";
export type GraphWriteTable = GraphTable | NativeAiTable;
export type StoredRow = Readonly<Record<string, unknown>>;
export interface RowChange {
  readonly id: string;
  readonly before?: StoredRow;
  readonly values: StoredRow;
}
export interface BranchPlan {
  readonly table: GraphWriteTable;
  readonly insert: readonly RowChange[];
  readonly update: readonly RowChange[];
  readonly remove: readonly StoredRow[];
}
// These are current physical logical coordinates, not inferred entity behavior.
// Renames/reparenting of these coordinates require a separately qualified remap.
const keys: Record<GraphTable, readonly string[]> = {
  entity_runtime_profile: ["profile_key"],
  entity_field: ["field_key"],
  entity_key: ["key_key"],
  entity_key_field: ["entity_key_id", "entity_field_id"],
  entity_search_profile: ["search_key"],
  entity_search_field: ["entity_search_profile_id", "entity_field_id"],
  entity_relation: ["relation_key"],
  entity_relation_target: ["entity_relation_id", "relation_target_key"],
  entity_relation_field: [
    "entity_relation_target_id",
    "source_field_id",
    "target_field_key",
  ],
  entity_surface: ["surface_key"],
  entity_surface_section: ["entity_surface_id", "section_key"],
  entity_surface_field_binding: ["entity_surface_id", "binding_key"],
  entity_operation: ["operation_key"],
  entity_operation_permission: ["entity_operation_id", "target_plane"],
  entity_surface_operation: ["entity_surface_id", "placement_key"],
  entity_operation_rule: ["entity_operation_id", "rule_key"],
  entity_flow: ["flow_key"],
  entity_flow_step: ["entity_flow_id", "step_key"],
  entity_policy_binding: ["binding_key"],
  entity_field_policy_binding: ["binding_key"],
  entity_contract_test_case: ["test_key"],
  entity_lifecycle_binding: ["binding_key"],
  entity_lifecycle_operation_binding: [
    "entity_lifecycle_binding_id",
    "entity_operation_id",
    "mapping_key",
  ],
  entity_numbering_binding: [
    "entity_field_id",
    "entity_operation_id",
    "binding_key",
  ],
  entity_operation_scope_binding: ["entity_operation_id", "binding_key"],
  entity_capability: ["capability_key"],
  entity_change_case_binding: ["entity_operation_id", "binding_key"],
  entity_operation_context_requirement: [
    "entity_operation_id",
    "coordinate_key",
  ],
  entity_field_reference_binding: ["binding_key"],
  entity_materialization_binding: ["binding_key"],
  entity_materialization_field_mapping: [
    "entity_materialization_binding_id",
    "source_field_key",
  ],
};
export const positionConstraints: Partial<Record<GraphWriteTable, string>> = {
  entity_ai_field: "entity_ai_field_logical_1_uq",
  entity_ai_binding: "entity_ai_binding_logical_1_uq",
  entity_ai_reference: "entity_ai_reference_logical_0_uq",
  entity_key_field: "entity_key_field_position_uq",
  entity_search_field: "entity_search_field_position_uq",
  entity_relation_field: "entity_relation_field_position_uq",
  entity_surface_section: "entity_surface_section_position_uq",
  entity_surface_field_binding: "entity_surface_field_binding_position_uq",
  entity_surface_operation: "entity_surface_operation_position_uq",
  entity_flow_step: "entity_flow_step_position_uq",
  entity_materialization_field_mapping:
    "entity_materialization_field_mapping_position_uq",
};
export function snakeKey(key: string) {
  return key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}
const equal = (a: unknown, b: unknown) =>
  canonicalJson(a ?? null) === canonicalJson(b ?? null);
function fail(code: string, table: string) {
  throw new AuthoringPolicyError(
    code,
    `${table}: reload the draft and resolve the member identity or dependency conflict.`,
  );
}

/** Undefined family/property means unchanged on this legacy API; [] explicitly
 * removes a family, and null explicitly clears a nullable property. This adapter
 * is not the future typed command protocol or the complete portable codec. */
export function planBranch(
  table: GraphTable,
  incoming: readonly object[] | undefined,
  stored: readonly StoredRow[],
): BranchPlan {
  return planMappedBranch(
    table,
    BRANCH_COLUMNS[table],
    keys[table],
    incoming,
    stored,
  );
}
/** Shared reconciliation for fixed, typed normalized descriptors. This produces
 * plans only; the existing transaction writer and deployed cutover guards still
 * govern execution. It does not initialize protected operation state. */
export function planNormalizedBranch(
  kind: NormalizedCoreKind | NormalizedLayoutKind,
  incoming: readonly object[] | undefined,
  stored: readonly StoredRow[],
): BranchPlan {
  const descriptor =
    kind === "section" || kind === "binding"
      ? normalizedLayoutMembers[kind]
      : normalizedCoreMembers[kind];
  for (const row of incoming ?? []) {
    if (kind === "section" || kind === "binding")
      validateNormalizedLayoutRow(kind, row);
    else validateNormalizedCoreRow(kind, row);
  }
  const identity = {
    field: ["field_identity_id"],
    runtime: ["profile_key"],
    surface: ["surface_key"],
    section: ["entity_surface_id", "section_key"],
    binding: ["entity_surface_id", "overlay_id", "binding_key"],
  } as const;
  const mapping = Object.fromEntries(
    Object.entries(descriptor.columns).map(([property, c]) => [
      property,
      c.column,
    ]),
  );
  const plan = planMappedBranch(
    descriptor.table as GraphTable,
    ["id", ...Object.keys(descriptor.columns)],
    identity[kind],
    incoming,
    stored,
    mapping,
  );
  // Ordinary scoped reconciliation cannot reinitialize storage/parent identity
  // or service-owned extension anchors. Explicit conversion/remap commands need
  // their own independently resolved source; a typed full-row echo is not one.
  for (const row of plan.update) {
    for (const column of Object.values(descriptor.columns)) {
      if (column.serviceOwned && Object.hasOwn(row.values, column.column))
        throw new AuthoringPolicyError(
          "AUTHORING_SERVICE_PROPERTY_IMMUTABLE",
          `${descriptor.table}.${column.column}: ordinary saves preserve the independently initialized value.`,
        );
    }
  }
  return plan;
}
/** Reconcile existing native operation identities. New protected-state
 * initialization is deliberately unavailable; unselected SQL controls are never
 * mapped, updated or regenerated by this typed plan. */
export function planNativeOperationBranch(
  incoming: readonly NativeOperationRow[],
  stored: readonly StoredRow[],
): BranchPlan {
  for (const row of incoming) validateNativeOperation(row, true);
  const descriptor = nativeOperationMember;
  const plan = planMappedBranch(
    "entity_operation",
    ["id", ...Object.keys(descriptor.columns)],
    ["operation_key"],
    incoming,
    stored,
    Object.fromEntries(
      Object.entries(descriptor.columns).map(([p, c]) => [p, c.column]),
    ),
  );
  if (plan.insert.length)
    fail("OPERATION_PROTECTED_SOURCE_REQUIRED", "entity_operation");
  for (const row of plan.update)
    for (const column of Object.values(descriptor.columns))
      if (column.serviceOwned && Object.hasOwn(row.values, column.column))
        fail("AUTHORING_SERVICE_PROPERTY_IMMUTABLE", "entity_operation");
  return plan;
}
/** Native AI uses the same scoped writer as core/layout and retained members.
 * Planning grants no authority and performs no database writes. Full-graph
 * references and installed provider/provenance evidence must be admitted by the
 * enclosing native transaction before applying these plans. */
export function planNativeAiGraph(
  incoming: NativeAiGraph,
  stored: Readonly<Record<NativeAiKind, readonly StoredRow[]>>,
  maximumMembers: number,
): readonly BranchPlan[] {
  validateNativeAiSemantics(incoming, maximumMembers);
  const identities: Record<NativeAiKind, readonly string[]> = {
    profile: [],
    field: ["ai_profile_id", "entity_field_id"],
    binding: ["ai_profile_id", "binding_kind", "contract_key"],
    reference: ["id"],
    term: ["ai_profile_id", "phrase", "provider_binding_id"],
  };
  return (Object.keys(nativeAiMembers) as NativeAiKind[]).map((kind) => {
    const descriptor = nativeAiMembers[kind];
    for (const row of incoming[kind])
      validateFoundationNode(nativeAiRowNode(kind), row, "/ai/" + kind);
    const plan = planMappedBranch(
      descriptor.table as NativeAiTable,
      ["id", ...Object.keys(descriptor.columns)],
      identities[kind],
      incoming[kind],
      stored[kind],
      Object.fromEntries(
        Object.entries(descriptor.columns).map(([p, c]) => [p, c.column]),
      ),
    );
    // Learning provenance is not initialized by a graph echo, and cannot be
    // changed in-place. A future candidate command needs its own approved source.
    if (kind === "term") {
      for (const row of plan.insert)
        if (row.values.origin_kind !== "authored")
          fail("AUTHORING_SERVICE_PROPERTY_SOURCE_REQUIRED", descriptor.table);
      for (const row of plan.update)
        if (Object.keys(row.values).some((k) => k.startsWith("origin_")))
          fail("AUTHORING_SERVICE_PROPERTY_IMMUTABLE", descriptor.table);
    }
    return plan;
  });
}
function planMappedBranch(
  table: GraphWriteTable,
  columns: readonly string[],
  identityKeys: readonly string[],
  incoming: readonly object[] | undefined,
  stored: readonly StoredRow[],
  mapping?: Readonly<Record<string, string>>,
): BranchPlan {
  const memberCoordinate = (row: StoredRow) =>
    canonicalJson(identityKeys.map((key) => row[key] ?? null));
  const insert: RowChange[] = [],
    update: RowChange[] = [];
  if (incoming === undefined) return { table, insert, update, remove: [] };
  const byId = new Map(stored.map((row) => [row.id, row]));
  const byKey = new Map(stored.map((row) => [memberCoordinate(row), row]));
  const seenIds = new Set<string>(),
    seenKeys = new Set<string>();
  for (const row of incoming) {
    if (
      !row ||
      typeof row !== "object" ||
      Array.isArray(row) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(row))
    )
      fail("AUTHORING_MEMBER_INVALID", table);
    for (const property of Reflect.ownKeys(row)) {
      if (typeof property !== "string" || !columns.includes(property))
        throw new AuthoringPolicyError(
          "AUTHORING_MEMBER_PROPERTY_UNSUPPORTED",
          `${table}.${String(property)}: this native authoring property has no registered save mapping.`,
        );
      const descriptor = Object.getOwnPropertyDescriptor(row, property);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
        fail("AUTHORING_MEMBER_INVALID", table);
    }
    const values: Record<string, unknown> = {};
    for (const key of columns) {
      if (
        key === "id" ||
        (table === "entity_relation_target" && key === "targetEntityCode")
      )
        continue;
      const value = Reflect.get(row, key);
      if (value !== undefined) values[mapping?.[key] ?? snakeKey(key)] = value;
    }
    const suppliedId = Reflect.get(row, "id");
    const matched =
      typeof suppliedId === "string"
        ? byId.get(suppliedId)
        : byKey.get(memberCoordinate(values));
    const id =
      typeof suppliedId === "string"
        ? suppliedId
        : typeof matched?.id === "string"
          ? matched.id
          : randomUUID();
    if (seenIds.has(id)) fail("AUTHORING_MEMBER_IDENTITY_CONFLICT", table);
    seenIds.add(id);
    const final: StoredRow = { ...matched, ...values, id };
    const key = memberCoordinate(final);
    if (seenKeys.has(key)) fail("AUTHORING_MEMBER_COORDINATE_CONFLICT", table);
    seenKeys.add(key);
    const priorKey = byKey.get(key);
    if (priorKey && priorKey.id !== id)
      fail("AUTHORING_MEMBER_IDENTITY_REPLACEMENT", table);
    if (matched && identityKeys.some((key) => !equal(matched[key], final[key])))
      fail("AUTHORING_MEMBER_REMAP_REQUIRED", table);
    if (matched) {
      const changed = Object.fromEntries(
        Object.entries(values).filter(
          ([key, value]) => !equal(matched[key], value),
        ),
      );
      if (Object.keys(changed).length)
        update.push({ id, before: matched, values: changed });
    } else insert.push({ id, values });
  }
  return {
    table,
    insert,
    update,
    remove: stored.filter((row) => !seenIds.has(String(row.id))),
  };
}
export function changed(plan: BranchPlan) {
  return !!(plan.insert.length || plan.update.length || plan.remove.length);
}
