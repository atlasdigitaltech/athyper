import { sql, type Transaction } from "kysely";
import {
  AuthoringConflictError,
  AuthoringPolicyError,
  referenceUuid,
  validateFoundationNode,
  type MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  fingerprintCommand,
  parseIdempotencyKey,
} from "@athyper/server-contract-events";
import { canonicalJson, sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
import { loadNormalizedLabels } from "./normalized-label-storage.js";
import {
  loadFieldIdentities,
  loadReferenceMembers,
} from "./normalized-reference-storage.js";
import {
  prepareHistoricalSourceNormalization,
  type HistoricalSourceNormalizationInput,
} from "./historical-source-normalization.js";
import type { NativeAuthoringPolicy } from "./native-core-layout-persistence.js";
import type { NormalizedSaveCoordinate } from "./normalized-core-layout-storage.js";
type Tx = Transaction<Record<string, never>>;
export interface HistoricalNormalizationApplicationInput extends NormalizedSaveCoordinate {
  readonly actorId: string;
  readonly expectedRevision: number;
  readonly expectedSourceHash: string;
  readonly idempotencyKey: string;
}
/** Independently installed existing-host ports, never request callbacks. This
 * application enrolls existing canonical families only. Allocation of labels,
 * stable identities and source ownership remains with governed typed commands. */
export interface HistoricalNormalizationApplicationPolicy {
  readonly host: NativeAuthoringPolicy;
  qualify(
    tx: Tx,
    input: HistoricalNormalizationApplicationInput,
  ): Promise<void>;
  resolve(
    tx: Tx,
    input: HistoricalNormalizationApplicationInput,
    source: MetaEntityGraph,
  ): Promise<HistoricalSourceNormalizationInput>;
}
const fail = (code: string): never => {
  throw new AuthoringPolicyError(
    code,
    "Canonical legacy enrollment evidence is incomplete or inconsistent.",
  );
};
async function capture(
  tx: Tx,
  input: HistoricalNormalizationApplicationInput,
  revision: number,
  graph: MetaEntityGraph,
  kind: "previous" | "saved",
) {
  const hash = sha256(graph);
  await sql`INSERT INTO snapshot.entity_draft_save(change_set_id,lock_version,tenant_id,graph,graph_hash,captured_by,capture_kind) VALUES(${input.changeSetId}::uuid,${revision},${input.tenantId}::uuid,${canonicalJson(graph)}::jsonb,${hash},${input.actorId}::uuid,${kind}) ON CONFLICT(change_set_id,lock_version) DO NOTHING`.execute(
    tx,
  );
  const stored = (
    await sql<{
      graph: MetaEntityGraph;
      graph_hash: string;
    }>`SELECT graph,graph_hash FROM snapshot.entity_draft_save WHERE change_set_id=${input.changeSetId}::uuid AND lock_version=${revision} AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid`.execute(
      tx,
    )
  ).rows[0];
  if (!stored || stored.graph_hash !== hash || sha256(stored.graph) !== hash)
    throw new AuthoringConflictError(
      "Immutable enrollment history conflicts with the exact source revision.",
    );
}
/** Caller owns the existing transaction/savepoint. History, marker, revision and
 * receipt commit together. No member identity, attribution or operation is
 * rewritten; fresh source allocation and native conversion are separate commands. */
export async function applyHistoricalSourceNormalization(
  tx: Tx,
  input: HistoricalNormalizationApplicationInput,
  policy: HistoricalNormalizationApplicationPolicy,
  load: () => Promise<MetaEntityGraph>,
) {
  if (!tx.isTransaction) fail("NORMALIZED_SAVE_TRANSACTION_REQUIRED");
  validateConversionJsonData(input, "/enrollment");
  input = structuredClone(input);
  if (
    Object.keys(input).sort().join() !==
      "actorId,changeSetId,entityId,expectedRevision,expectedSourceHash,idempotencyKey,tenantId" ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    !Number.isSafeInteger(input.expectedRevision + 1) ||
    !/^[a-f0-9]{64}$/.test(input.expectedSourceHash) ||
    !parseIdempotencyKey(input.idempotencyKey).ok
  )
    fail("LEGACY_ENROLLMENT_REQUEST_INVALID");
  for (const id of [
    input.actorId,
    input.entityId,
    input.changeSetId,
    ...(input.tenantId === null ? [] : [input.tenantId]),
  ])
    validateFoundationNode(referenceUuid, id, "/enrollment/id");
  const schemaHash = policy.host.commands.authoringSchemaHash;
  if (!/^[a-f0-9]{64}$/.test(schemaHash))
    fail("LEGACY_ENROLLMENT_SCHEMA_REQUIRED");
  await policy.host.admit(tx, { ...input, batch: null }, "write");
  const root = (
    await sql<{
      source: Record<string, unknown>;
    }>`SELECT to_jsonb(cs) AS source FROM metadata.entity_change_set cs WHERE id=${input.changeSetId}::uuid AND entity_id=${input.entityId}::uuid AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid FOR UPDATE`.execute(
      tx,
    )
  ).rows[0]?.source;
  if (!root) fail("AUTHORING_DRAFT_NOT_FOUND");
  await policy.qualify(tx, structuredClone(input));
  const requestHash = fingerprintCommand({
    kind: "historical-source-normalization",
    ...input,
    authoringSchemaHash: schemaHash,
  });
  const receipt = (
    await sql<{
      request_hash: string;
      actor_id: string;
      revision: string;
      changed: boolean;
      identities: {
        sourceHash?: string;
        targetHash?: string;
        enrollmentKind?: string;
      };
    }>`SELECT request_hash,actor_id,revision,changed,identities FROM metadata.entity_authoring_command_receipt WHERE change_set_id=${input.changeSetId}::uuid AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid AND idempotency_key=${input.idempotencyKey}`.execute(
      tx,
    )
  ).rows[0];
  if (receipt) {
    if (
      receipt.request_hash !== requestHash ||
      receipt.actor_id !== input.actorId
    )
      throw new AuthoringConflictError(
        "Enrollment idempotency key conflicts with the original request.",
      );
    if (
      receipt.identities.enrollmentKind !== "historical-source-normalization" ||
      receipt.identities.sourceHash !== input.expectedSourceHash ||
      !/^[a-f0-9]{64}$/.test(receipt.identities.targetHash ?? "") ||
      Number(receipt.revision) !== input.expectedRevision + 1 ||
      receipt.changed !== true ||
      root!.reference_contract_version !== 1 ||
      root!.native_core_layout_version != null ||
      root!.authoring_schema_hash !== schemaHash
    )
      fail("LEGACY_ENROLLMENT_REPLAY_INVALID");
    const histories = (
      await sql<{
        lock_version: string;
        graph: MetaEntityGraph;
        graph_hash: string;
      }>`SELECT lock_version,graph,graph_hash FROM snapshot.entity_draft_save WHERE change_set_id=${input.changeSetId}::uuid AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid AND lock_version IN (${input.expectedRevision},${input.expectedRevision + 1}) ORDER BY lock_version`.execute(
        tx,
      )
    ).rows;
    if (
      histories.length !== 2 ||
      Number(histories[0]!.lock_version) !== input.expectedRevision ||
      Number(histories[1]!.lock_version) !== input.expectedRevision + 1 ||
      histories[0]!.graph_hash !== input.expectedSourceHash ||
      histories[1]!.graph_hash !== receipt.identities.targetHash ||
      histories.some((h) => sha256(h.graph) !== h.graph_hash) ||
      ![
        "athyper.meta-entity-contract/2.1",
        "athyper.meta-entity-contract/2.2",
      ].includes(histories[0]!.graph.contractSchema) ||
      histories[1]!.graph.contractSchema !== "athyper.meta-entity-contract/2.3"
    )
      fail("LEGACY_ENROLLMENT_HISTORY_INVALID");
    const resolved = await policy.resolve(
      tx,
      structuredClone(input),
      structuredClone(histories[0]!.graph),
    );
    if (
      resolved.sourceHash !== input.expectedSourceHash ||
      resolved.revision !== input.expectedRevision ||
      resolved.context.entityId !== input.entityId ||
      resolved.context.changeSetId !== input.changeSetId ||
      resolved.context.tenantId !== input.tenantId ||
      resolved.sourceKind !== root!.source_kind
    )
      fail("LEGACY_ENROLLMENT_REPLAY_INVALID");
    const proof = prepareHistoricalSourceNormalization(
      histories[0]!.graph,
      resolved,
    );
    if (
      proof.targetHash !== receipt.identities.targetHash ||
      canonicalJson(proof.candidate) !== canonicalJson(histories[1]!.graph)
    )
      fail("LEGACY_ENROLLMENT_HISTORY_INVALID");
    return {
      changeSetId: input.changeSetId,
      revision: Number(receipt.revision),
      changed: true,
      sourceHash: input.expectedSourceHash,
      targetHash: receipt.identities.targetHash!,
      replay: true,
    };
  }
  if (Number(root!.lock_version) !== input.expectedRevision)
    throw new AuthoringConflictError("Stale enrollment source revision.");
  if (!["draft", "rejected"].includes(String(root!.status)))
    fail("AUTHORING_DRAFT_NOT_EDITABLE");
  if (
    root!.reference_contract_version != null ||
    root!.native_core_layout_version != null ||
    root!.authoring_schema_hash !== schemaHash ||
    !["product", "tenant_entity"].includes(String(root!.source_kind)) ||
    (root!.source_kind === "product") !== (input.tenantId === null)
  )
    fail("LEGACY_ENROLLMENT_SOURCE_AUTHORITY_REQUIRED");
  const source = await load();
  const resolved = await policy.resolve(
    tx,
    structuredClone(input),
    structuredClone(source),
  );
  if (
    resolved.sourceHash !== input.expectedSourceHash ||
    resolved.revision !== input.expectedRevision ||
    resolved.context.entityId !== input.entityId ||
    resolved.context.changeSetId !== input.changeSetId ||
    resolved.context.tenantId !== input.tenantId ||
    resolved.sourceKind !== root!.source_kind
  )
    fail("LEGACY_ENROLLMENT_SOURCE_MISMATCH");
  const proof = prepareHistoricalSourceNormalization(source, resolved);
  const labels = await loadNormalizedLabels(tx, input.changeSetId);
  if (
    !labels ||
    canonicalJson(labels) !== canonicalJson(proof.candidate.ownedLabels)
  )
    fail("LEGACY_ENROLLMENT_LABELS_NOT_INSTALLED");
  const ids = proof.candidate.fieldIdentities!.map((i) => i.id);
  await sql`SELECT id FROM metadata.entity_field_identity WHERE entity_id=${input.entityId}::uuid AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid AND id=ANY(${ids}::uuid[]) FOR SHARE`.execute(
    tx,
  );
  const identities = await loadFieldIdentities(tx, input.changeSetId);
  if (
    canonicalJson(identities) !== canonicalJson(proof.candidate.fieldIdentities)
  )
    fail("LEGACY_ENROLLMENT_IDENTITIES_NOT_INSTALLED");
  const members = await loadReferenceMembers(tx, input.changeSetId);
  if (
    canonicalJson(members) !== canonicalJson(proof.candidate.referenceMembers)
  )
    fail("LEGACY_ENROLLMENT_UNREPRESENTED_MEMBERS");
  await capture(tx, input, input.expectedRevision, source, "previous");
  const revision = input.expectedRevision + 1;
  const advanced = (
    await sql<{
      revision: string;
    }>`SELECT metadata.fn_advance_entity_change_set(${input.changeSetId}::uuid,${input.expectedRevision},${input.actorId}::uuid) AS revision`.execute(
      tx,
    )
  ).rows[0];
  if (Number(advanced?.revision) !== revision)
    throw new AuthoringConflictError(
      "Enrollment must advance exactly one revision.",
    );
  const marked =
    await sql`UPDATE metadata.entity_change_set SET reference_contract_version=1 WHERE id=${input.changeSetId}::uuid AND entity_id=${input.entityId}::uuid AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid AND lock_version=${revision} RETURNING id`.execute(
      tx,
    );
  if (marked.rows.length !== 1) fail("AUTHORING_MEMBER_WRITE_DENIED");
  await sql`SELECT metadata.validate_reference_members(${input.changeSetId}::uuid)`.execute(
    tx,
  );
  const stored = await load();
  if (canonicalJson(stored) !== canonicalJson(proof.candidate))
    fail("LEGACY_ENROLLMENT_READBACK_MISMATCH");
  await capture(tx, input, revision, stored, "saved");
  await sql`INSERT INTO metadata.entity_authoring_command_receipt(change_set_id,tenant_id,idempotency_key,actor_id,request_hash,expected_revision,revision,changed,identities) VALUES(${input.changeSetId}::uuid,${input.tenantId}::uuid,${input.idempotencyKey},${input.actorId}::uuid,${requestHash},${input.expectedRevision},${revision},true,${canonicalJson({ enrollmentKind: "historical-source-normalization", sourceHash: input.expectedSourceHash, targetHash: proof.targetHash })}::jsonb)`.execute(
    tx,
  );
  return {
    changeSetId: input.changeSetId,
    revision,
    changed: true,
    sourceHash: input.expectedSourceHash,
    targetHash: proof.targetHash,
    replay: false,
  };
}
