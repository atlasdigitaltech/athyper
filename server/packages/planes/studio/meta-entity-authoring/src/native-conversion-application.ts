import {
  loadNativeCompilationOperations,
  verifyNativeCompiledOperationControls,
  type NativeCompiledOperation,
} from "./native-operation-compilation.js";
import { prepareCanonicalNativeConversionPlans } from "./native-conversion-plans.js";
import { sql, type Transaction } from "kysely";
import {
  AuthoringConflictError,
  AuthoringPolicyError,
  referenceUuid,
  validateFoundationNode,
  type MetaEntityGraph,
  type ExpandedNativeMetaEntityGraph,
  type CompiledMetaEntityArtifact,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  parseIdempotencyKey,
  fingerprintCommand,
} from "@athyper/server-contract-events";
import { canonicalJson, sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
import { validateNativeEntityLabelOwner } from "./native-localized-labels.js";
import { validateNativeSupplementalReferences } from "./native-supplemental-storage.js";
import {
  assertNativeAuthoringContract,
  type NativeAuthoringPolicy,
  type NativeDraftRoot,
} from "./native-core-layout-persistence.js";
import { writeReconciliationPlans } from "./scoped-graph-writer.js";
import type { NormalizedSaveCoordinate } from "./normalized-core-layout-storage.js";
import type { prepareExpandedNativeGraphConversion } from "./native-expanded-conversion.js";

type Tx = Transaction<Record<string, never>>;
export type NativeExpandedConversionProof = ReturnType<
  typeof prepareExpandedNativeGraphConversion
>;
export interface NativeConversionApplicationInput extends NormalizedSaveCoordinate {
  readonly actorId: string;
  readonly idempotencyKey: string;
  readonly expectedRevision: number;
  readonly expectedSourceHash: string;
}
/** Installed host ports only. Requests cannot submit a candidate, plan, compiler,
 * schema receipt or policy. Qualification must attest the canonical conversion
 * schema (including retired legacy coupling), storage authority and reader.
 * This interface does not supply those attestations or grant product writes. */
export interface NativeConversionApplicationPolicy {
  readonly host: NativeAuthoringPolicy;
  readonly maximumBytes: number;
  qualify(tx: Tx, input: NativeConversionApplicationInput): Promise<void>;
  prepare(
    tx: Tx,
    input: NativeConversionApplicationInput,
    source: MetaEntityGraph,
  ): Promise<NativeExpandedConversionProof>;
  compile(
    tx: Tx,
    graph: ExpandedNativeMetaEntityGraph,
    operations: readonly NativeCompiledOperation[],
  ): Promise<CompiledMetaEntityArtifact>;
  verifyReader(
    tx: Tx,
    artifact: CompiledMetaEntityArtifact,
    graph: ExpandedNativeMetaEntityGraph,
  ): Promise<void>;
}
export interface NativeConversionApplicationLoaders {
  source(): Promise<MetaEntityGraph>;
  native(root: NativeDraftRoot): Promise<ExpandedNativeMetaEntityGraph>;
}
const fail = (code: string): never => {
  throw new AuthoringPolicyError(
    code,
    "Canonical native conversion qualification failed.",
  );
};
async function capture(
  tx: Tx,
  input: NativeConversionApplicationInput,
  revision: number,
  kind: "previous" | "saved",
  graph: MetaEntityGraph | ExpandedNativeMetaEntityGraph,
) {
  const hash = sha256(graph);
  await sql`INSERT INTO snapshot.entity_draft_save(change_set_id,lock_version,tenant_id,graph,graph_hash,captured_by,capture_kind) VALUES(${input.changeSetId}::uuid,${revision},${input.tenantId}::uuid,${canonicalJson(graph)}::jsonb,${hash},${input.actorId}::uuid,${kind}) ON CONFLICT(change_set_id,lock_version) DO NOTHING`.execute(
    tx,
  );
  const row = (
    await sql<{
      graph: unknown;
      graph_hash: string;
    }>`SELECT graph,graph_hash FROM snapshot.entity_draft_save WHERE change_set_id=${input.changeSetId}::uuid AND lock_version=${revision} AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid`.execute(
      tx,
    )
  ).rows[0];
  if (!row || row.graph_hash !== hash || sha256(row.graph) !== hash)
    throw new AuthoringConflictError(
      "Immutable conversion history conflicts with the exact source revision.",
    );
}
/** Caller supplies the existing repository transaction/savepoint. No external
 * dispatch/publication occurs here. Receipt, both history versions, scoped rows,
 * marker/revision and compiler/reader checks commit or roll back together. */
export async function applyNativeGraphConversion(
  tx: Tx,
  input: NativeConversionApplicationInput,
  policy: NativeConversionApplicationPolicy,
  loaders: NativeConversionApplicationLoaders,
): Promise<{
  changeSetId: string;
  revision: number;
  changed: boolean;
  sourceHash: string;
  targetHash: string;
}> {
  if (!tx.isTransaction) fail("NORMALIZED_SAVE_TRANSACTION_REQUIRED");
  validateConversionJsonData(input, "/conversion");
  input = structuredClone(input);
  const schemaHash = policy.host.commands.authoringSchemaHash;
  const maximumMembers = policy.host.commands.maxMembers;
  const maximumBytes = policy.maximumBytes;
  const snapshotVersions = [...(policy.host.snapshotVersions ?? [])];
  if (
    Object.keys(input).sort().join() !==
    "actorId,changeSetId,entityId,expectedRevision,expectedSourceHash,idempotencyKey,tenantId"
  )
    fail("NATIVE_CONVERSION_REQUEST_INVALID");
  for (const id of [
    input.entityId,
    input.changeSetId,
    input.actorId,
    ...(input.tenantId === null ? [] : [input.tenantId]),
  ])
    validateFoundationNode(referenceUuid, id, "/conversion/id");
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    !Number.isSafeInteger(input.expectedRevision + 1) ||
    !/^[a-f0-9]{64}$/.test(input.expectedSourceHash) ||
    !parseIdempotencyKey(input.idempotencyKey).ok ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    !Number.isSafeInteger(maximumMembers) ||
    maximumMembers < 1 ||
    !/^[a-f0-9]{64}$/.test(schemaHash) ||
    !snapshotVersions.includes(2)
  )
    fail("NATIVE_CONVERSION_REQUEST_INVALID");
  await policy.host.admit(tx, { ...input, batch: null }, "write");
  const root = (
    await sql<{
      source: Record<string, unknown>;
    }>`SELECT to_jsonb(cs) AS source FROM metadata.entity_change_set cs WHERE id=${input.changeSetId}::uuid AND entity_id=${input.entityId}::uuid AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid FOR UPDATE`.execute(
      tx,
    )
  ).rows[0]?.source;
  if (!root) fail("AUTHORING_DRAFT_NOT_FOUND");
  await policy.qualify(tx, input); // Replays recheck current schema/host/storage authority too.
  const requestHash = fingerprintCommand({
    kind: "native-format-conversion",
    ...input,
    authoringSchemaHash: schemaHash,
  });
  const receipt = (
    await sql<{
      request_hash: string;
      actor_id: string;
      revision: string;
      identities: {
        sourceHash?: string;
        targetHash?: string;
        compiledHash?: string;
        descriptorHash?: string;
        compilerName?: string;
        compilerVersion?: string;
      };
      changed: boolean;
    }>`SELECT request_hash,actor_id,revision,identities,changed FROM metadata.entity_authoring_command_receipt WHERE change_set_id=${input.changeSetId}::uuid AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid AND idempotency_key=${input.idempotencyKey}`.execute(
      tx,
    )
  ).rows[0];
  if (receipt) {
    if (
      root!.native_core_layout_version !== 2 ||
      root!.authoring_schema_hash !== schemaHash
    )
      fail("NATIVE_CONVERSION_REPLAY_SOURCE_INVALID");
    await assertNativeAuthoringContract(tx, input, schemaHash, 2);
    if (
      receipt.request_hash !== requestHash ||
      receipt.actor_id !== input.actorId ||
      receipt.identities?.sourceHash !== input.expectedSourceHash ||
      !/^[a-f0-9]{64}$/.test(receipt.identities?.compiledHash ?? "") ||
      !/^[a-f0-9]{64}$/.test(receipt.identities?.descriptorHash ?? "") ||
      receipt.identities?.compilerName !== "@athyper/meta-entity-compiler" ||
      !receipt.identities?.compilerVersion ||
      !/^[a-f0-9]{64}$/.test(receipt.identities.targetHash ?? "") ||
      Number(receipt.revision) !== input.expectedRevision + 1 ||
      receipt.changed !== true
    )
      fail("AUTHORING_IDEMPOTENCY_CONFLICT");
    // Verify immutable receipts/history rather than compare against the current
    // graph: subsequent legitimate edits must not invalidate a conversion replay.
    for (const [revision, hash] of [
      [input.expectedRevision, receipt.identities.sourceHash],
      [Number(receipt.revision), receipt.identities.targetHash],
    ] as const) {
      const saved = (
        await sql<{
          graph: unknown;
          graph_hash: string;
        }>`SELECT graph,graph_hash FROM snapshot.entity_draft_save WHERE change_set_id=${input.changeSetId}::uuid AND lock_version=${revision} AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid`.execute(
          tx,
        )
      ).rows[0];
      if (!saved || saved.graph_hash !== hash || sha256(saved.graph) !== hash)
        fail("NATIVE_CONVERSION_REPLAY_HISTORY_INVALID");
    }
    return {
      changeSetId: input.changeSetId,
      revision: Number(receipt.revision),
      changed: true,
      sourceHash: receipt.identities.sourceHash!,
      targetHash: receipt.identities.targetHash!,
    };
  }
  if (!root || Number(root.lock_version) !== input.expectedRevision)
    throw new AuthoringConflictError("Stale format-conversion revision.");
  if (root.status !== "draft" && root.status !== "rejected")
    fail("AUTHORING_DRAFT_NOT_EDITABLE");
  if (
    root.native_core_layout_version != null ||
    root.reference_contract_version !== 1 ||
    !root.default_locale ||
    !["product", "tenant_entity"].includes(String(root.source_kind)) ||
    (root.source_kind === "product") !== (input.tenantId === null)
  )
    fail("NATIVE_CONVERSION_SOURCE_INVALID");
  const source = await loaders.source();
  validateConversionJsonData(source, "/source");
  if (
    source.contractSchema !== "athyper.meta-entity-contract/2.3" ||
    sha256(source) !== input.expectedSourceHash ||
    Buffer.byteLength(canonicalJson(source)) > maximumBytes
  )
    fail("NATIVE_CONVERSION_SOURCE_HASH_MISMATCH");
  const prepared = await policy.prepare(tx, input, structuredClone(source));
  validateConversionJsonData(prepared, "/proof");
  const proof = structuredClone(prepared);
  const graph = proof.candidate;
  if (
    proof.schema !== "entity.native-expanded-conversion-proof/1" ||
    proof.source.graphHash !== input.expectedSourceHash ||
    proof.source.entityId !== input.entityId ||
    proof.source.changeSetId !== input.changeSetId ||
    proof.source.tenantId !== input.tenantId ||
    proof.source.revision !== input.expectedRevision ||
    proof.targetHash !== sha256(graph) ||
    graph.contractSchema !== "athyper.meta-entity-contract/2.5" ||
    graph.authoringSource.entityId !== input.entityId ||
    graph.authoringSource.tenantId !== input.tenantId ||
    graph.authoringSource.sourceKind !== root.source_kind ||
    graph.authoringSource.authoringSchemaHash !== schemaHash ||
    Buffer.byteLength(canonicalJson(graph)) > maximumBytes
  )
    fail("NATIVE_CONVERSION_PROOF_INVALID");
  validateNativeEntityLabelOwner(graph, input);
  validateNativeSupplementalReferences(graph, maximumMembers);
  const plans = await prepareCanonicalNativeConversionPlans(
    tx,
    input,
    structuredClone(source),
    structuredClone(proof),
    maximumMembers,
  );
  await capture(tx, input, input.expectedRevision, "previous", source);
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
      "Format conversion failed to advance exactly one revision.",
    );
  await writeReconciliationPlans(tx, plans, {
    change_set_id: input.changeSetId,
    entity_id: input.entityId,
    tenant_id: input.tenantId,
    created_by: input.actorId,
  });
  const marked =
    await sql`UPDATE metadata.entity_change_set SET native_core_layout_version=2,authoring_schema_hash=${graph.authoringSource.authoringSchemaHash},entity_label_id=${graph.entity.entityLabelId ?? null}::uuid WHERE id=${input.changeSetId}::uuid AND entity_id=${input.entityId}::uuid AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid AND lock_version=${revision} RETURNING id`.execute(
      tx,
    );
  if (marked.rows.length !== 1) fail("AUTHORING_MEMBER_WRITE_DENIED");
  await assertNativeAuthoringContract(
    tx,
    input,
    graph.authoringSource.authoringSchemaHash,
    2,
  );
  const stored = await loaders.native({
    nativeVersion: 2,
    status: String(root.status),
    lockVersion: revision,
    sourceKind: root.source_kind as "product" | "tenant_entity",
    authoringSchemaHash: graph.authoringSource.authoringSchemaHash,
  });
  if (canonicalJson(stored) !== canonicalJson(graph))
    fail("NATIVE_AUTHORING_PERSISTENCE_MISMATCH");
  const compilationOperations = await loadNativeCompilationOperations(
    tx,
    { ...input, revision, graphHash: sha256(stored) },
    stored,
    maximumMembers,
  );
  const result = await policy.compile(
    tx,
    structuredClone(stored),
    structuredClone(compilationOperations),
  );
  validateConversionJsonData(result, "/compiled");
  const compiled = structuredClone(result);
  if (
    compiled.compiler?.name !== "@athyper/meta-entity-compiler" ||
    typeof compiled.compiler?.version !== "string" ||
    !compiled.compiler.version ||
    compiled.contractHash !== sha256(stored) ||
    compiled.descriptorHash !== sha256(compiled.descriptor) ||
    compiled.schema !== "athyper.entity-runtime-descriptor/1.0"
  )
    fail("NATIVE_CONVERSION_COMPILER_EVIDENCE_INVALID");
  verifyNativeCompiledOperationControls(
    compilationOperations,
    compiled.descriptor,
  );
  await policy.verifyReader(
    tx,
    structuredClone(compiled),
    structuredClone(stored),
  );
  await capture(tx, input, revision, "saved", stored);
  await sql`INSERT INTO metadata.entity_authoring_command_receipt(change_set_id,tenant_id,actor_id,idempotency_key,request_hash,expected_revision,revision,changed,identities) VALUES(${input.changeSetId}::uuid,${input.tenantId}::uuid,${input.actorId}::uuid,${input.idempotencyKey},${requestHash},${input.expectedRevision},${revision},true,${JSON.stringify({ sourceHash: input.expectedSourceHash, targetHash: proof.targetHash, compiledHash: sha256(compiled), descriptorHash: compiled.descriptorHash, compilerName: compiled.compiler.name, compilerVersion: compiled.compiler.version })}::jsonb)`.execute(
    tx,
  );
  return {
    changeSetId: input.changeSetId,
    revision,
    changed: true,
    sourceHash: input.expectedSourceHash,
    targetHash: proof.targetHash,
  };
}
