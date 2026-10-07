import { sql, type Transaction } from "kysely";
import {
  AuthoringPolicyError,
  nativeRetiredColumns,
  normalizedCoreMembers,
  normalizedLayoutMembers,
  nativeOperationMember,
  nativeAiMembers,
  nativeStructuralMembers,
  referenceMembers,
  ownedLabelMappings,
  validateNormalizedCoreRow,
  validateNormalizedLayoutRow,
  validateReferenceMember,
  type NormalizedCoreKind,
  type NormalizedLayoutKind,
  type ReferenceMemberKind,
  type MetaEntityGraph,
  type ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  planCanonicalConversionRows,
  planNativeOperationBranch,
  type BranchPlan,
  type GraphWriteTable,
  type StoredRow,
} from "./graph-reconciliation.js";
import { canonicalJson } from "./deterministic.js";
import type { NormalizedSaveCoordinate } from "./normalized-core-layout-storage.js";
import type { NativeExpandedConversionProof } from "./native-conversion-application.js";

const fail = (code: string): never => {
  throw new AuthoringPolicyError(
    code,
    "Canonical conversion rows do not match the admitted source inventory.",
  );
};
const retire = nativeRetiredColumns;
const unchangedRoots = [
  "classProfiles",
  "fieldIdentities",
  "keys",
  "keyFields",
  "searchProfiles",
  "searchFields",
  "changeCaseBindings",
  "operationContextRequirements",
  "fieldReferenceBindings",
  "materializationBindings",
  "materializationFieldMappings",
  "operationPermissions",
  "operationRules",
  "operationScopeBindings",
  "surfaceOperations",
  "flows",
  "flowSteps",
  "lifecycleBindings",
  "lifecycleOperationBindings",
  "policyBindings",
  "fieldPolicyBindings",
  "numberingBindings",
  "capabilities",
] as const;
/** Production SQL plan preparation. Qualified installed policy must already
 * hold the root lock and attest descriptor, retired constraint cluster, new
 * member/protected-state/catalogue provenance and product-write authority.
 * No schema is altered and no identity/protected-state source is initialized. */
export async function prepareCanonicalNativeConversionPlans(
  tx: Transaction<Record<string, never>>,
  c: NormalizedSaveCoordinate,
  source: MetaEntityGraph,
  proof: NativeExpandedConversionProof,
  maximumMembers: number,
): Promise<readonly BranchPlan[]> {
  if (
    !tx.isTransaction ||
    !Number.isSafeInteger(maximumMembers) ||
    maximumMembers < 1 ||
    maximumMembers >= 2147483647
  )
    fail("NATIVE_CONVERSION_PLAN_CONTEXT_INVALID");
  const graph: ExpandedNativeMetaEntityGraph = proof.candidate;
  for (const key of unchangedRoots)
    if (canonicalJson(source[key]) !== canonicalJson(graph[key]))
      fail("NATIVE_CONVERSION_RETAINED_BRANCH_CHANGED");
  if (!graph.ownedLabels || !graph.referenceMembers)
    fail("NATIVE_CONVERSION_DEPENDENCIES_REQUIRED");
  type Entry = {
    table: GraphWriteTable;
    rows: readonly StoredRow[];
    originalIds?: readonly string[];
  };
  const entries: Entry[] = [];
  function mapped(
    table: string,
    rows: readonly object[],
    mapping: Readonly<Record<string, { column: string } | string>>,
    originalIds?: readonly string[],
  ) {
    const projected = rows.map((row) => ({
      id: Reflect.get(row, "id"),
      ...Object.fromEntries(
        Object.entries(mapping)
          .filter(([p]) => p !== "id" && Object.hasOwn(row, p))
          .map(([p, column]) => [
            typeof column === "string" ? column : column.column,
            Reflect.get(row, p),
          ]),
      ),
    }));
    entries.push({
      table: table.replace(/^metadata\./, "") as GraphWriteTable,
      rows: projected,
      originalIds,
    });
  }
  // Labels precede their owners; current fields/surfaces/operations already
  // exist, so new cross-references can refer to preserved identities.
  for (const kind of ["labels", "translations"] as const)
    mapped(
      ownedLabelMappings[kind].table,
      graph.ownedLabels![kind],
      ownedLabelMappings[kind].columns,
    );
  const sources = {
    field: "fields",
    runtime: "runtimeProfiles",
    surface: "surfaces",
    section: "surfaceSections",
    binding: "surfaceFieldBindings",
  } as const;
  for (const [kind, descriptor] of Object.entries({
    ...normalizedCoreMembers,
    ...normalizedLayoutMembers,
  })) {
    const key = sources[kind as keyof typeof sources];
    for (const row of graph[key]) {
      if (Object.hasOwn(normalizedCoreMembers, kind))
        validateNormalizedCoreRow(kind as NormalizedCoreKind, row);
      else validateNormalizedLayoutRow(kind as NormalizedLayoutKind, row);
    }
    mapped(
      descriptor.table,
      graph[key],
      descriptor.columns,
      source[key]!.map((r) => r.id!),
    );
  }
  for (const [kind, d] of Object.entries(referenceMembers)) {
    const rows = Reflect.get(graph.referenceMembers!.members, kind);
    for (const row of rows)
      validateReferenceMember(kind as ReferenceMemberKind, row);
    mapped(d.table, rows, d.columns);
  }
  for (const family of [
    "relations",
    "relationTargets",
    "relationFields",
  ] as const) {
    const d = nativeStructuralMembers[family];
    mapped(
      d.table,
      (graph[family] ?? []).map((r) => {
        const row = { ...r };
        if (family === "relationTargets")
          Reflect.deleteProperty(row, "targetEntityCode");
        return row;
      }),
      d.columns,
    );
  }
  mapped(
    "entity_operation",
    graph.operations,
    nativeOperationMember.columns,
    source.operations.map((r) => r.id!),
  );
  for (const [kind, d] of Object.entries(nativeAiMembers))
    mapped(d.table, Reflect.get(graph.ai, kind), d.columns);
  if (
    entries.reduce((n, e) => n + e.rows.length, 0) > maximumMembers ||
    new Set(entries.map((e) => e.table)).size !== entries.length
  )
    fail("NATIVE_SNAPSHOT_LIMIT");
  const plans: BranchPlan[] = [];
  let storedMembers = 0;
  for (const entry of entries) {
    const stored = (
      await sql<{
        value: StoredRow;
      }>`SELECT to_jsonb(t) AS value FROM ${sql.table(`metadata.${entry.table}`)} t WHERE change_set_id=${c.changeSetId}::uuid AND entity_id=${c.entityId}::uuid AND tenant_id IS NOT DISTINCT FROM ${c.tenantId}::uuid ORDER BY id LIMIT ${maximumMembers + 1}`.execute(
        tx,
      )
    ).rows.map((r) => r.value);
    storedMembers += stored.length;
    if (storedMembers > maximumMembers) fail("NATIVE_SNAPSHOT_LIMIT");
    if (
      entry.originalIds &&
      canonicalJson(stored.map((r) => r.id).sort()) !==
        canonicalJson([...entry.originalIds].sort())
    )
      fail("NATIVE_CONVERSION_SOURCE_INVENTORY_MISMATCH");
    // Stable field identities must have been enrolled through the existing
    // governed reference commands. Format conversion neither initializes the
    // catalogue nor remaps a field to another identity.
    if (
      entry.table === "entity_field" &&
      entry.rows.some((row) => {
        const original = stored.find((r) => r.id === row.id);
        return (
          !original?.field_identity_id ||
          original.field_identity_id !== row.field_identity_id
        );
      })
    )
      fail("NATIVE_CONVERSION_FIELD_IDENTITY_SOURCE_REQUIRED");
    // Original operations cannot be replaced/created by a format conversion.
    // Reuse the existing service-owned-property preservation guard.
    if (entry.table === "entity_operation")
      planNativeOperationBranch(graph.operations, stored);
    const legacy = retire[entry.table as keyof typeof retire] ?? [];
    const retired = legacy.length
      ? (
          await sql<{
            attname: string;
            attnotnull: boolean;
          }>`SELECT attname,attnotnull FROM pg_attribute WHERE attrelid=${`metadata.${entry.table}`}::regclass AND NOT attisdropped AND attname IN (${sql.join(legacy.map((name) => sql`${name}`))})`.execute(
            tx,
          )
        ).rows
      : [];
    if (retired.some((c) => c.attnotnull))
      fail("ENTITY_NATIVE_SCHEMA_CUTOVER_REQUIRED");
    // Schema qualification must have made these nullable and removed competing
    // legacy constraints before this path. NULL is not a compatibility authoring blob.
    const rows = entry.rows.map((r) => ({
      ...r,
      ...Object.fromEntries(retired.map((column) => [column.attname, null])),
    }));
    const plan = planCanonicalConversionRows(entry.table, rows, stored);
    const retiredBindings = proof.coreProof?.nested?.bindingRetirements ?? [];
    if (
      plan.remove.some(
        (r) =>
          entry.table !== "entity_surface_field_binding" ||
          !retiredBindings.some((b) => b.id === r.id),
      )
    )
      fail("NATIVE_CONVERSION_IDENTITY_CHANGED");
    if (
      [
        "entity_field",
        "entity_runtime_profile",
        "entity_surface",
        "entity_operation",
      ].includes(entry.table) &&
      plan.insert.length
    )
      fail("NATIVE_CONVERSION_IDENTITY_CHANGED");
    if (
      entry.table.startsWith("entity_ai_") &&
      (plan.update.some((r) =>
        Object.keys(r.values).some((k) => k.startsWith("origin_")),
      ) ||
        plan.insert.some(
          (r) =>
            r.values.origin_kind !== undefined &&
            r.values.origin_kind !== "authored",
        ))
    )
      fail("AUTHORING_SERVICE_PROPERTY_SOURCE_REQUIRED");
    plans.push(plan);
  }
  return plans;
}
