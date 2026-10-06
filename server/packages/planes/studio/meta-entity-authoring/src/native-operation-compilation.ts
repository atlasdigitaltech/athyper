import { sql, type Transaction } from "kysely";
import {
  AuthoringPolicyError,
  validateNativeOperation,
  type ExpandedNativeMetaEntityGraph,
  type NativeOperationRow,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256 } from "./deterministic.js";
import { nativeOperationFromStorage } from "./native-operation-storage.js";
import type { NormalizedSaveCoordinate } from "./normalized-core-layout-storage.js";
const fail = (): never => {
  throw new AuthoringPolicyError(
    "NATIVE_COMPILATION_PROTECTED_SOURCE_REQUIRED",
    "Compile existing operation controls only from the exact locked governed source.",
  );
};
export type NativeCompiledOperation = NativeOperationRow & {
  readonly requiresMfa: boolean;
};
/** Owner-approved compiler preservation only. The caller holds the qualified
 * native root lock and owns current authoring/publication admission. This reader
 * grants no access, accepts no client control, initializes nothing and writes
 * nothing. The authoring DTO remains free of protected-state inputs. */
export async function loadNativeCompilationOperations(
  tx: Transaction<Record<string, never>>,
  coordinate: NormalizedSaveCoordinate & {
    readonly revision: number;
    readonly graphHash: string;
  },
  graph: ExpandedNativeMetaEntityGraph,
  maximumMembers: number,
): Promise<readonly NativeCompiledOperation[]> {
  if (
    !tx.isTransaction ||
    !Number.isSafeInteger(maximumMembers) ||
    maximumMembers < 1 ||
    maximumMembers >= 2147483647 ||
    !Number.isSafeInteger(coordinate.revision) ||
    coordinate.revision < 0 ||
    coordinate.graphHash !== sha256(graph) ||
    graph.authoringSource.entityId !== coordinate.entityId ||
    graph.authoringSource.tenantId !== coordinate.tenantId ||
    graph.ownedLabels?.changeSetId !== coordinate.changeSetId
  )
    fail();
  for (const row of graph.operations) validateNativeOperation(row);
  const root = (
    await sql<{
      lock_version: string;
      authoring_schema_hash: string;
      native_core_layout_version: number;
    }>`SELECT lock_version,authoring_schema_hash,native_core_layout_version FROM metadata.entity_change_set WHERE id=${coordinate.changeSetId}::uuid AND entity_id=${coordinate.entityId}::uuid AND tenant_id IS NOT DISTINCT FROM ${coordinate.tenantId}::uuid FOR UPDATE`.execute(
      tx,
    )
  ).rows[0];
  if (
    !root ||
    Number(root.lock_version) !== coordinate.revision ||
    root.authoring_schema_hash !== graph.authoringSource.authoringSchemaHash ||
    root.native_core_layout_version !== 2
  )
    fail();
  const rows = (
    await sql<{
      value: Record<string, unknown>;
    }>`SELECT to_jsonb(t) || jsonb_build_object('export_max_records',t.export_max_records::text) AS value FROM metadata.entity_operation t WHERE change_set_id=${coordinate.changeSetId}::uuid AND entity_id=${coordinate.entityId}::uuid AND tenant_id IS NOT DISTINCT FROM ${coordinate.tenantId}::uuid ORDER BY id LIMIT ${maximumMembers + 1}`.execute(
      tx,
    )
  ).rows.map((r) => r.value);
  if (
    rows.length > maximumMembers ||
    rows.length !== graph.operations.length ||
    new Set(rows.map((r) => r.id)).size !== rows.length
  )
    fail();
  return graph.operations.map((operation) => {
    const stored = rows.find((r) => r.id === operation.id);
    if (
      !stored ||
      typeof stored.requires_mfa !== "boolean" ||
      canonicalJson(nativeOperationFromStorage(stored)) !==
        canonicalJson(operation)
    )
      fail();
    return {
      ...structuredClone(operation),
      requiresMfa: stored!.requires_mfa as boolean,
    };
  });
}
/** Require preservation at the artifact boundary too. A compiler cannot silently
 * drop a control, change it, introduce a new operation or echo a client value. */
export function verifyNativeCompiledOperationControls(
  operations: readonly NativeCompiledOperation[],
  descriptor: Readonly<Record<string, unknown>>,
): void {
  const output = descriptor.operations;
  if (!Array.isArray(output)) return fail();
  if (
    output.length !== operations.length ||
    new Set(output.map((row) => row?.id)).size !== output.length
  )
    fail();
  for (const operation of operations) {
    const row = output.find((row) => row?.id === operation.id);
    if (
      !row ||
      row.operationKey !== operation.operationKey ||
      row.requiresMfa !== operation.requiresMfa
    )
      fail();
  }
}
