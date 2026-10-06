import { sql, type Transaction } from "kysely";
import {
  FoundationContractError,
  nativeAiMembers,
  validateNativeAiSemantics,
  validateNativeOperation,
  type NativeAiGraph,
  type ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { nativeOperationFromStorage } from "./native-operation-storage.js";
import type { NormalizedSaveCoordinate } from "./normalized-core-layout-storage.js";
/** Exact scoped SQL reader shared by repository snapshots and conversion readback.
 * No table/key may be supplied by an author and no missing branch becomes empty. */
export async function loadNativeSupplementalMembers(
  tx: Transaction<Record<string, never>>,
  c: NormalizedSaveCoordinate,
  maximumMembers: number,
): Promise<Pick<ExpandedNativeMetaEntityGraph, "operations" | "ai">> {
  if (!tx.isTransaction)
    throw new FoundationContractError(
      "NORMALIZED_SAVE_TRANSACTION_REQUIRED",
      "/snapshot",
    );
  if (
    !Number.isSafeInteger(maximumMembers) ||
    maximumMembers < 1 ||
    maximumMembers >= 2147483647
  )
    throw new FoundationContractError("NATIVE_SNAPSHOT_LIMIT", "/snapshot");
  const rows = async (table: string) => {
    // jsonb numeric decoding would round bigint export limits in JavaScript.
    // Select that typed SQL value as text before it crosses the JSON boundary.
    const result =
      table === "entity_operation"
        ? await sql<{
            value: Record<string, unknown>;
          }>`SELECT to_jsonb(t) || jsonb_build_object('export_max_records',t.export_max_records::text) AS value FROM ${sql.table("metadata." + table)} t WHERE change_set_id=${c.changeSetId}::uuid AND entity_id=${c.entityId}::uuid AND tenant_id IS NOT DISTINCT FROM ${c.tenantId}::uuid ORDER BY id LIMIT ${maximumMembers + 1}`.execute(
            tx,
          )
        : await sql<{
            value: Record<string, unknown>;
          }>`SELECT to_jsonb(t) AS value FROM ${sql.table("metadata." + table)} t WHERE change_set_id=${c.changeSetId}::uuid AND entity_id=${c.entityId}::uuid AND tenant_id IS NOT DISTINCT FROM ${c.tenantId}::uuid ORDER BY id LIMIT ${maximumMembers + 1}`.execute(
            tx,
          );
    if (result.rows.length > maximumMembers)
      throw new FoundationContractError(
        "NATIVE_SNAPSHOT_LIMIT",
        "/snapshot/" + table,
      );
    return result.rows.map((r) => r.value);
  };
  const operations = (await rows("entity_operation")).map(
    nativeOperationFromStorage,
  );
  const branches = await Promise.all(
    Object.entries(nativeAiMembers).map(
      async ([kind, d]) =>
        [
          kind,
          (await rows(d.table)).map((r) => ({
            id: r.id,
            ...Object.fromEntries(
              Object.entries(d.columns).map(([p, col]) => [p, r[col.column]]),
            ),
          })),
        ] as const,
    ),
  );
  const ai = Object.fromEntries(branches) as unknown as NativeAiGraph;
  validateNativeAiSemantics(ai, maximumMembers);
  if (
    operations.length + Object.values(ai).reduce((n, r) => n + r.length, 0) >
    maximumMembers
  )
    throw new FoundationContractError("NATIVE_SNAPSHOT_LIMIT", "/snapshot");
  if (
    new Set(operations.map((r) => r.id)).size !== operations.length ||
    new Set(operations.map((r) => r.operationKey)).size !== operations.length
  )
    throw new FoundationContractError(
      "NATIVE_SNAPSHOT_OPERATION_INVENTORY_INVALID",
      "/snapshot/operations",
    );
  return { operations, ai };
}
/** Validate local references after the core/layout/retained branches are read.
 * Installed handler/security/provenance evidence remains a separate host gate. */
export function validateNativeSupplementalReferences(
  graph: ExpandedNativeMetaEntityGraph,
  maximumMembers: number,
): void {
  validateNativeAiSemantics(graph.ai, maximumMembers);
  if (
    !Array.isArray(graph.operations) ||
    graph.operations.length > maximumMembers
  )
    throw new FoundationContractError("NATIVE_SNAPSHOT_LIMIT", "/operations");
  for (const op of graph.operations) validateNativeOperation(op);
  const ids = [...graph.operations, ...Object.values(graph.ai).flat()].map(
    (r) => r.id,
  );
  if (
    ids.length > maximumMembers ||
    new Set(ids).size !== ids.length ||
    new Set(graph.operations.map((o) => o.operationKey)).size !==
      graph.operations.length
  )
    throw new FoundationContractError(
      "NATIVE_SNAPSHOT_OPERATION_INVENTORY_INVALID",
      "/operations",
    );
  const fields = new Set(graph.fields.map((f) => f.id));
  const surfaces = new Set(graph.surfaces.map((s) => s.id));
  const operations = new Set(graph.operations.map((o) => o.id));
  const labels = new Set(graph.ownedLabels?.labels.map((l) => l.id) ?? []);
  const searches = new Set(graph.searchProfiles?.map((s) => s.id) ?? []);
  const relations = new Set(graph.relations?.map((r) => r.id) ?? []);
  const ref = (
    value: string | null,
    ids: Set<string | undefined>,
    path: string,
  ) => {
    if (value !== null && !ids.has(value))
      throw new FoundationContractError(
        "NATIVE_SNAPSHOT_REFERENCE_INVALID",
        path,
      );
  };
  for (const o of graph.operations) {
    ref(o.labelId, labels, "/operations/labelId");
    ref(o.inputSurfaceId, surfaces, "/operations/inputSurfaceId");
    ref(o.resultSurfaceId, surfaces, "/operations/resultSurfaceId");
    ref(
      o.replacementOperationId,
      operations,
      "/operations/replacementOperationId",
    );
  }
  for (const branch of [
    "operationPermissions",
    "operationRules",
    "operationScopeBindings",
    "changeCaseBindings",
    "operationContextRequirements",
    "surfaceOperations",
    "lifecycleOperationBindings",
    "policyBindings",
    "fieldPolicyBindings",
    "numberingBindings",
  ] as const)
    for (const row of graph[branch] ?? [])
      if (row.entityOperationId !== undefined)
        ref(
          row.entityOperationId,
          operations,
          "/" + branch + "/entityOperationId",
        );
  for (const enrollment of graph.referenceMembers?.members.operationField ??
    []) {
    ref(
      enrollment.entityFieldId,
      fields,
      "/referenceMembers/operationField/entityFieldId",
    );
    ref(
      enrollment.entityOperationId,
      operations,
      "/referenceMembers/operationField/entityOperationId",
    );
    if (enrollment.operationChangeSetId !== graph.ownedLabels?.changeSetId)
      throw new FoundationContractError(
        "NATIVE_SNAPSHOT_REFERENCE_INVALID",
        "/referenceMembers/operationField/operationChangeSetId",
      );
  }
  for (const access of graph.referenceMembers?.members.fieldAccess ?? []) {
    ref(
      access.entityFieldId,
      fields,
      "/referenceMembers/fieldAccess/entityFieldId",
    );
    ref(
      access.readOperationId,
      operations,
      "/referenceMembers/fieldAccess/readOperationId",
    );
    if (
      access.readOperationId !== null &&
      access.readOperationChangeSetId !== graph.ownedLabels?.changeSetId
    )
      throw new FoundationContractError(
        "NATIVE_SNAPSHOT_REFERENCE_INVALID",
        "/referenceMembers/fieldAccess/readOperationChangeSetId",
      );
  }
  for (const p of graph.ai.profile)
    ref(p.searchProfileId, searches, "/ai/profile/searchProfileId");
  for (const f of graph.ai.field)
    ref(f.entityFieldId, fields, "/ai/field/fieldId");
  for (const b of graph.ai.binding)
    ref(b.operationId, operations, "/ai/binding/operationId");
  for (const r of graph.ai.reference) {
    ref(r.relationId, relations, "/ai/reference/relationId");
    ref(r.sourceFieldId, fields, "/ai/reference/sourceFieldId");
  }
}
