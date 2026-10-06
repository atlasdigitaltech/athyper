import { sql, type Transaction } from "kysely";
import {
  AuthoringPolicyError,
  referenceUuid,
  validateFoundationNode,
  type MetaEntityGraph,
  type ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { sha256, canonicalJson } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
import {
  lockNativeDraft,
  assertNativeAuthoringContract,
} from "./native-core-layout-persistence.js";
import type { NativeConversionApplicationPolicy } from "./native-conversion-application.js";
import type { NormalizedSaveCoordinate } from "./normalized-core-layout-storage.js";
const fail = (): never => {
  throw new AuthoringPolicyError(
    "NATIVE_CONVERSION_HISTORY_INVALID",
    "An exact admitted conversion receipt and immutable source/target pair are required.",
  );
};
/** Read the original 2.3 checkpoint without rewriting or restoring it. Admission
 * is current history access, not the original converter's write authority.
 * Only the exact original revision enrolled by canonical conversion is admitted;
 * arbitrary older 2.3 snapshots and descriptor drift remain unsupported. */
export async function readNativeConversionHistory(
  tx: Transaction<Record<string, never>>,
  input: NormalizedSaveCoordinate & {
    readonly actorId: string;
    readonly revision: number;
  },
  policy: NativeConversionApplicationPolicy,
): Promise<MetaEntityGraph | null> {
  validateConversionJsonData(input, "/history");
  input = structuredClone(input);
  if (
    !tx.isTransaction ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0 ||
    !Number.isSafeInteger(input.revision + 1) ||
    Object.keys(input).sort().join() !==
      "actorId,changeSetId,entityId,revision,tenantId"
  )
    fail();
  for (const id of [
    input.entityId,
    input.changeSetId,
    input.actorId,
    ...(input.tenantId === null ? [] : [input.tenantId]),
  ])
    validateFoundationNode(referenceUuid, id, "/history/id");
  const schemaHash = policy.host.commands.authoringSchemaHash;
  const maximumBytes = policy.maximumBytes;
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    !policy.host.snapshotVersions?.includes(2)
  )
    fail();
  await policy.host.admit(tx, { ...input, batch: null }, "history");
  const root = await lockNativeDraft(
    tx,
    input,
    schemaHash,
    policy.host.snapshotVersions,
  );
  if (root.nativeVersion !== 2) fail();
  await assertNativeAuthoringContract(
    tx,
    input,
    schemaHash,
    root.nativeVersion,
  );
  const saved = (
    await sql<{
      graph: MetaEntityGraph;
      graph_hash: string;
    }>`SELECT graph,graph_hash FROM snapshot.entity_draft_save WHERE change_set_id=${input.changeSetId}::uuid AND lock_version=${input.revision} AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid`.execute(
      tx,
    )
  ).rows[0];
  if (!saved) return null;
  validateConversionJsonData(saved.graph, "/history/source");
  if (
    saved.graph.contractSchema !== "athyper.meta-entity-contract/2.3" ||
    saved.graph_hash !== sha256(saved.graph) ||
    Buffer.byteLength(canonicalJson(saved.graph)) > maximumBytes ||
    saved.graph.ownedLabels?.entityId !== input.entityId ||
    saved.graph.ownedLabels?.changeSetId !== input.changeSetId ||
    saved.graph.ownedLabels?.tenantId !== input.tenantId
  )
    fail();
  const receipts = (
    await sql<{
      actor_id: string;
      idempotency_key: string;
      revision: string;
      identities: { sourceHash?: string; targetHash?: string };
    }>`SELECT actor_id,idempotency_key,revision,identities FROM metadata.entity_authoring_command_receipt WHERE change_set_id=${input.changeSetId}::uuid AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid AND expected_revision=${input.revision} AND changed=true`.execute(
      tx,
    )
  ).rows.filter((r) => r.identities?.sourceHash === saved.graph_hash);
  if (receipts.length !== 1) fail();
  const receipt = receipts[0]!;
  if (
    Number(receipt.revision) !== input.revision + 1 ||
    !/^[a-f0-9]{64}$/.test(receipt.identities.targetHash ?? "")
  )
    fail();
  const target = (
    await sql<{
      graph: ExpandedNativeMetaEntityGraph;
      graph_hash: string;
    }>`SELECT graph,graph_hash FROM snapshot.entity_draft_save WHERE change_set_id=${input.changeSetId}::uuid AND lock_version=${Number(receipt.revision)} AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid`.execute(
      tx,
    )
  ).rows[0];
  if (
    !target ||
    target.graph_hash !== receipt.identities.targetHash ||
    sha256(target.graph) !== target.graph_hash ||
    target.graph.contractSchema !== "athyper.meta-entity-contract/2.5" ||
    target.graph.authoringSource?.entityId !== input.entityId ||
    target.graph.authoringSource.tenantId !== input.tenantId ||
    target.graph.authoringSource.sourceKind !== root.sourceKind ||
    target.graph.authoringSource.authoringSchemaHash !== schemaHash ||
    Buffer.byteLength(canonicalJson(target.graph)) > maximumBytes
  )
    fail();
  // Installed adapters revalidate exact source semantics and dependencies. This
  // pure proof does not call the writer, compiler or publisher and cannot restore
  // captured platform controls or confer live-record authorization.
  const proof = await policy.prepare(
    tx,
    {
      entityId: input.entityId,
      changeSetId: input.changeSetId,
      tenantId: input.tenantId,
      actorId: receipt.actor_id,
      idempotencyKey: receipt.idempotency_key,
      expectedRevision: input.revision,
      expectedSourceHash: saved.graph_hash,
    },
    structuredClone(saved.graph),
  );
  if (
    proof.source.entityId !== input.entityId ||
    proof.source.changeSetId !== input.changeSetId ||
    proof.source.tenantId !== input.tenantId ||
    proof.source.revision !== input.revision ||
    proof.source.graphHash !== saved.graph_hash ||
    proof.targetHash !== target!.graph_hash ||
    canonicalJson(proof.candidate) !== canonicalJson(target!.graph)
  )
    fail();
  return structuredClone(saved.graph);
}
