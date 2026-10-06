import { sql, type Transaction } from "kysely";
import {
  AuthoringPolicyError,
  nativeAiMembers,
  type ExpandedNativeMetaEntityGraph,
  type NativeAiKind,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  lockNativeDraft,
  assertNativeAuthoringContract,
} from "./native-core-layout-persistence.js";
import {
  planNativeAiGraph,
  type BranchPlan,
  type StoredRow,
} from "./graph-reconciliation.js";
import { validateNativeSupplementalReferences } from "./native-supplemental-storage.js";
import type { NormalizedSaveCoordinate } from "./normalized-core-layout-storage.js";
/** Prepare AI plans inside the existing admitted native authoring transaction.
 * This is not a command endpoint: the caller owns authorization, revision,
 * idempotency, whole-graph snapshots, application and exact readback. Missing
 * native schema qualification rejects before even reading member tables. */
export async function prepareNativeAiSaveState(
  tx: Transaction<Record<string, never>>,
  c: NormalizedSaveCoordinate,
  proposed: ExpandedNativeMetaEntityGraph,
  maximumMembers: number,
): Promise<{
  readonly plans: readonly BranchPlan[];
  readonly storedMembers: number;
}> {
  if (
    !Number.isSafeInteger(maximumMembers) ||
    maximumMembers < 1 ||
    maximumMembers >= 2147483647
  )
    throw new AuthoringPolicyError(
      "NATIVE_SNAPSHOT_LIMIT",
      "Use a bounded native member budget.",
    );
  const source = proposed.authoringSource;
  if (
    proposed.contractSchema !== "athyper.meta-entity-contract/2.5" ||
    source.entityId !== c.entityId ||
    source.tenantId !== c.tenantId ||
    proposed.ownedLabels?.changeSetId !== c.changeSetId ||
    proposed.ownedLabels.entityId !== c.entityId ||
    proposed.ownedLabels.tenantId !== c.tenantId
  )
    throw new AuthoringPolicyError(
      "NORMALIZED_SAVE_CONTEXT_MISMATCH",
      "Use the exact scoped native source.",
    );
  const root = await lockNativeDraft(tx, c, source.authoringSchemaHash, [2]);
  if (
    root.sourceKind !== source.sourceKind ||
    !["draft", "rejected"].includes(root.status)
  )
    throw new AuthoringPolicyError(
      "AUTHORING_DRAFT_NOT_EDITABLE",
      "Sealed or mismatched sources cannot be reconciled.",
    );
  await assertNativeAuthoringContract(tx, c, root.authoringSchemaHash, 2);
  validateNativeSupplementalReferences(proposed, maximumMembers);
  const stored = {} as Record<NativeAiKind, readonly StoredRow[]>;
  for (const kind of Object.keys(nativeAiMembers) as NativeAiKind[]) {
    const d = nativeAiMembers[kind];
    const rows = (
      await sql<{
        value: StoredRow;
      }>`SELECT to_jsonb(t) AS value FROM ${sql.table("metadata." + d.table)} t WHERE change_set_id=${c.changeSetId}::uuid AND entity_id=${c.entityId}::uuid AND tenant_id IS NOT DISTINCT FROM ${c.tenantId}::uuid ORDER BY id LIMIT ${maximumMembers + 1}`.execute(
        tx,
      )
    ).rows;
    if (rows.length > maximumMembers)
      throw new AuthoringPolicyError(
        "NATIVE_SNAPSHOT_LIMIT",
        "Stored AI branch exceeds the admitted budget.",
      );
    stored[kind] = rows.map((r) => r.value);
  }
  if (
    Object.values(stored).reduce((n, rows) => n + rows.length, 0) >
    maximumMembers
  )
    throw new AuthoringPolicyError(
      "NATIVE_SNAPSHOT_LIMIT",
      "Stored AI graph exceeds the admitted budget.",
    );
  return {
    plans: planNativeAiGraph(proposed.ai, stored, maximumMembers),
    storedMembers: Object.values(stored).reduce(
      (n, rows) => n + rows.length,
      0,
    ),
  };
}

/** Compatibility entry for existing native AI preparation callers. */
export async function prepareNativeAiSave(
  tx: Transaction<Record<string, never>>,
  c: NormalizedSaveCoordinate,
  proposed: ExpandedNativeMetaEntityGraph,
  maximumMembers: number,
): Promise<readonly BranchPlan[]> {
  return (await prepareNativeAiSaveState(tx, c, proposed, maximumMembers))
    .plans;
}
