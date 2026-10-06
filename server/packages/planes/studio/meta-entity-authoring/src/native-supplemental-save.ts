import { sql, type Transaction } from "kysely";
import {
  AuthoringPolicyError,
  type ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { prepareNativeAiSaveState } from "./native-ai-storage.js";
import {
  planNativeOperationBranch,
  type BranchPlan,
  type StoredRow,
} from "./graph-reconciliation.js";
import type { NormalizedSaveCoordinate } from "./normalized-core-layout-storage.js";
/** One preparation path for operation and AI plans in the existing transaction.
 * The AI preparation obtains the exact native root lock/schema guard and checks
 * the whole supplemental reference graph before either member family is read.
 * Caller-owned admission, snapshots, revision/idempotency and exact readback
 * remain mandatory; this is not an author-facing command or cutover API. */
export async function prepareNativeSupplementalSave(
  tx: Transaction<Record<string, never>>,
  c: NormalizedSaveCoordinate,
  graph: ExpandedNativeMetaEntityGraph,
  maximumMembers: number,
): Promise<readonly BranchPlan[]> {
  const ai = await prepareNativeAiSaveState(tx, c, graph, maximumMembers);
  // Preserve SQL bigint precision, as in the shared snapshot reader.
  const stored = (
    await sql<{
      value: StoredRow;
    }>`SELECT to_jsonb(t) || jsonb_build_object('export_max_records',t.export_max_records::text) AS value FROM metadata.entity_operation t WHERE change_set_id=${c.changeSetId}::uuid AND entity_id=${c.entityId}::uuid AND tenant_id IS NOT DISTINCT FROM ${c.tenantId}::uuid ORDER BY id LIMIT ${maximumMembers + 1}`.execute(
      tx,
    )
  ).rows;
  if (
    stored.length > maximumMembers ||
    stored.length + ai.storedMembers > maximumMembers
  )
    throw new AuthoringPolicyError(
      "NATIVE_SNAPSHOT_LIMIT",
      "Stored operations exceed the admitted budget.",
    );
  const operations = planNativeOperationBranch(
    graph.operations,
    stored.map((r) => r.value),
  );
  return [operations, ...ai.plans];
}
