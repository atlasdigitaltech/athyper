import {
  establishNativeBootstrapIdentities,
  type NativeIdentityAdoptionSource,
} from "./native-bootstrap-identities.js";
import { sql, type Transaction } from "kysely";
import {
  AuthoringPolicyError,
  AuthoringConflictError,
  referenceUuid,
  validateFoundationNode,
  type ExpandedNativeMetaEntityGraph,
  type MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  parseIdempotencyKey,
  fingerprintCommand,
} from "@athyper/server-contract-events";
import { canonicalJson, sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
import {
  nativeBootstrapPlans,
  assertBootstrapPlansEmpty,
} from "./native-bootstrap-plans.js";
import { writeReconciliationPlans } from "./scoped-graph-writer.js";
import {
  assertNativeAuthoringContract,
  type NativeAuthoringPolicy,
  type NativeDraftRoot,
} from "./native-core-layout-persistence.js";
import {
  loadNativeCompilationOperations,
  verifyNativeCompiledOperationControls,
} from "./native-operation-compilation.js";
import {
  compileNativeRelease,
  type NativeReleaseCompilationContext,
} from "./native-release-compilation.js";
import {
  compileNativeRuntimeProjection,
  type NativeProjectionRegistration,
} from "@athyper/server-platform-metadata";
import type { ApprovedOperationBootstrap } from "./native-operation-bootstrap.js";
import type { NormalizedSaveCoordinate } from "./normalized-core-layout-storage.js";
type Tx = Transaction<Record<string, never>>;
export interface NativeBootstrapInput extends NormalizedSaveCoordinate {
  readonly actorId: string;
  readonly idempotencyKey: string;
  readonly proposalHash: string;
}
/** Installed composition, never a request-supplied graph, initializer or grant.
 * Qualification runs even on replay; prepare resolves the exact author proposal.
 * This command does not publish or attest independent release review. */
export interface NativeBootstrapPolicy {
  readonly host: NativeAuthoringPolicy;
  readonly maximumBytes: number;
  qualify(tx: Tx, input: NativeBootstrapInput): Promise<void>;
  prepare(
    tx: Tx,
    input: NativeBootstrapInput,
  ): Promise<{
    graph: ExpandedNativeMetaEntityGraph;
    title: string;
    branchCode: string;
    baseReleaseId: string | null;
    operations: ApprovedOperationBootstrap;
    identitySources?: readonly NativeIdentityAdoptionSource[];
    compiler: NativeReleaseCompilationContext;
    reader: {
      registration: NativeProjectionRegistration;
      storagePlane: "studio" | "neon" | "mesh";
      permissions: readonly { code: string; scopeKinds: readonly string[] }[];
    };
  }>;
  audit(
    tx: Tx,
    input: NativeBootstrapInput,
    result: NativeBootstrapResult,
  ): Promise<void>;
}
export interface NativeBootstrapResult {
  readonly changeSetId: string;
  readonly revision: 1;
  readonly graphHash: string;
  readonly compiledHash: string;
  readonly replay: boolean;
}
function fail(code: string): never {
  throw new AuthoringPolicyError(
    code,
    "Fresh native bootstrap failed; no partial draft may commit.",
  );
}
async function snapshot(
  tx: Tx,
  input: NativeBootstrapInput,
  revision: number,
  graph: MetaEntityGraph | ExpandedNativeMetaEntityGraph,
  kind: "previous" | "saved",
) {
  await sql`INSERT INTO snapshot.entity_draft_save(change_set_id,lock_version,tenant_id,graph,graph_hash,captured_by,capture_kind)
    VALUES(${input.changeSetId}::uuid,${revision},${input.tenantId}::uuid,${canonicalJson(graph)}::jsonb,${sha256(graph)},${input.actorId}::uuid,${kind})`.execute(
    tx,
  );
}
/** The repository owns the transaction/savepoint and supplies its real readers.
 * The same native compiler and runtime parser qualify exact SQL readback before
 * snapshot, receipt and transactional audit commit. No legacy conversion proof is
 * required for a newly authored graph and no prior history is rewritten. */
export async function applyNativeBootstrap(
  tx: Tx,
  input: NativeBootstrapInput,
  policy: NativeBootstrapPolicy,
  readers: {
    empty(): Promise<MetaEntityGraph>;
    native(root: NativeDraftRoot): Promise<ExpandedNativeMetaEntityGraph>;
  },
): Promise<NativeBootstrapResult> {
  if (!tx.isTransaction) fail("NORMALIZED_SAVE_TRANSACTION_REQUIRED");
  validateConversionJsonData(input, "/bootstrap");
  input = structuredClone(input);
  if (
    Object.keys(input).sort().join() !==
      "actorId,changeSetId,entityId,idempotencyKey,proposalHash,tenantId" ||
    input.tenantId !== null ||
    !parseIdempotencyKey(input.idempotencyKey).ok ||
    !/^[a-f0-9]{64}$/.test(input.proposalHash)
  )
    fail("NATIVE_BOOTSTRAP_INPUT_INVALID");
  for (const id of [input.changeSetId, input.entityId, input.actorId])
    validateFoundationNode(referenceUuid, id, "/bootstrap/id");
  if (
    !Number.isSafeInteger(policy.maximumBytes) ||
    policy.maximumBytes < 1 ||
    !policy.host.snapshotVersions?.includes(2)
  )
    fail("NATIVE_BOOTSTRAP_HOST_REQUIRED");
  const schemaHash = policy.host.commands.authoringSchemaHash;
  if (!/^[a-f0-9]{64}$/.test(schemaHash))
    fail("NATIVE_BOOTSTRAP_HOST_REQUIRED");
  await policy.host.admit(
    tx,
    { ...input, batch: { contract: "entity.authoring-native-bootstrap/1" } },
    "write",
  );
  await policy.qualify(tx, input);
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${"entity-native-bootstrap:" + input.changeSetId},0))`.execute(
    tx,
  );
  const requestHash = fingerprintCommand({
    kind: "native-bootstrap",
    ...input,
    authoringSchemaHash: schemaHash,
  });
  const receipt = (
    await sql<{
      request_hash: string;
      actor_id: string;
      revision: string;
      identities: { graphHash: string; compiledHash: string };
    }>`
    SELECT request_hash,actor_id,revision,identities FROM metadata.entity_authoring_command_receipt
    WHERE change_set_id=${input.changeSetId}::uuid AND tenant_id IS NULL AND idempotency_key=${input.idempotencyKey}`.execute(
      tx,
    )
  ).rows[0];
  if (receipt) {
    if (
      receipt.request_hash !== requestHash ||
      receipt.actor_id !== input.actorId ||
      Number(receipt.revision) !== 1 ||
      !/^[a-f0-9]{64}$/.test(receipt.identities?.compiledHash ?? "")
    )
      fail("AUTHORING_IDEMPOTENCY_CONFLICT");
    const saved = (
      await sql<{
        graph: ExpandedNativeMetaEntityGraph;
        graph_hash: string;
      }>`SELECT graph,graph_hash FROM snapshot.entity_draft_save
      WHERE change_set_id=${input.changeSetId}::uuid AND tenant_id IS NULL AND lock_version=1`.execute(
        tx,
      )
    ).rows[0];
    if (
      !saved ||
      saved.graph_hash !== input.proposalHash ||
      saved.graph_hash !== receipt.identities.graphHash ||
      sha256(saved.graph) !== saved.graph_hash ||
      saved.graph.authoringSource?.entityId !== input.entityId ||
      saved.graph.authoringSource.authoringSchemaHash !== schemaHash
    )
      fail("NATIVE_BOOTSTRAP_REPLAY_HISTORY_INVALID");
    const result: NativeBootstrapResult = {
      changeSetId: input.changeSetId,
      revision: 1,
      graphHash: saved.graph_hash,
      compiledHash: receipt.identities.compiledHash,
      replay: true,
    };
    await policy.audit(tx, input, result);
    return result;
  }
  const existing =
    await sql`SELECT id FROM metadata.entity_change_set WHERE id=${input.changeSetId}::uuid`.execute(
      tx,
    );
  if (existing.rows.length)
    throw new AuthoringConflictError(
      "Bootstrap target already exists without this command receipt.",
    );
  const resolved = await policy.prepare(tx, structuredClone(input));
  const prepared = {
    ...structuredClone({
      graph: resolved.graph,
      title: resolved.title,
      branchCode: resolved.branchCode,
      baseReleaseId: resolved.baseReleaseId,
      compiler: resolved.compiler,
      reader: resolved.reader,
      identitySources: resolved.identitySources ?? [],
    }),
    operations: resolved.operations,
  };
  if (!prepared.title.trim() || !prepared.branchCode.trim())
    fail("NATIVE_BOOTSTRAP_ROOT_INVALID");
  const graph = structuredClone(prepared.graph);
  validateConversionJsonData(graph, "/bootstrap/graph");
  if (
    graph.contractSchema !== "athyper.meta-entity-contract/2.5" ||
    sha256(graph) !== input.proposalHash ||
    graph.authoringSource.authoringSchemaHash !== schemaHash ||
    graph.authoringSource.entityId !== input.entityId ||
    graph.authoringSource.tenantId !== null ||
    graph.authoringSource.sourceKind !== "product" ||
    graph.ownedLabels?.changeSetId !== input.changeSetId ||
    Buffer.byteLength(canonicalJson(graph)) > policy.maximumBytes
  )
    fail("NATIVE_BOOTSTRAP_PROPOSAL_MISMATCH");
  if (prepared.baseReleaseId !== null) {
    validateFoundationNode(
      referenceUuid,
      prepared.baseReleaseId,
      "/bootstrap/baseReleaseId",
    );
    const base =
      await sql`SELECT id FROM metadata.entity_release WHERE id=${prepared.baseReleaseId}::uuid
      AND entity_id=${input.entityId}::uuid AND tenant_id IS NULL FOR SHARE`.execute(
        tx,
      );
    if (base.rows.length !== 1) fail("NATIVE_BOOTSTRAP_BASE_RELEASE_MISMATCH");
  }
  const plans = [
    ...nativeBootstrapPlans(graph, input, policy.host.commands.maxMembers),
  ];
  // Creation uses canonical rows. Root ownership is initialized by the existing
  // revision/snapshot protocol, never by disabling its guards or inserting pins.
  await sql`INSERT INTO metadata.entity_change_set(id,tenant_id,entity_id,change_set_code,branch_code,title,created_by,base_release_id)
    VALUES(${input.changeSetId}::uuid,NULL,${input.entityId}::uuid,${prepared.branchCode + "." + input.changeSetId},${prepared.branchCode},${prepared.title},${input.actorId}::uuid,${prepared.baseReleaseId}::uuid)`.execute(
    tx,
  );
  const empty = await readers.empty();
  if (empty.fields.length || empty.operations.length)
    fail("NATIVE_BOOTSTRAP_TARGET_NOT_EMPTY");
  await snapshot(tx, input, 0, empty, "previous");
  const advanced = (
    await sql<{
      revision: string;
    }>`SELECT metadata.fn_advance_entity_change_set(${input.changeSetId}::uuid,0,${input.actorId}::uuid) AS revision`.execute(
      tx,
    )
  ).rows[0];
  if (Number(advanced?.revision) !== 1)
    fail("NATIVE_BOOTSTRAP_REVISION_CONFLICT");
  const initialized =
    await sql`UPDATE metadata.entity_change_set SET source_kind='product',publication_owner='platform',schema_version=1,
    source_hash=${sha256(empty)},authoring_schema_hash=${schemaHash},native_core_layout_version=2,reference_contract_version=1,
    entity_label_id=${graph.entity.entityLabelId}::uuid,default_locale=${graph.ownedLabels!.defaultLocale},required_locales=${graph.ownedLabels!.requiredLocales}::text[]
    WHERE id=${input.changeSetId}::uuid AND entity_id=${input.entityId}::uuid AND tenant_id IS NULL AND lock_version=1 RETURNING id`.execute(
      tx,
    );
  if (initialized.rows.length !== 1) fail("NATIVE_BOOTSTRAP_REVISION_CONFLICT");
  await establishNativeBootstrapIdentities(
    tx,
    input,
    graph,
    prepared.compiler.core,
    prepared.identitySources,
  );
  // Emptiness includes every mapped family, not just fields/operations.
  for (const plan of plans) {
    const stored = (
      await sql<
        Record<string, unknown>
      >`SELECT id FROM ${sql.table("metadata." + plan.table)} WHERE change_set_id=${input.changeSetId}::uuid LIMIT 1`.execute(
        tx,
      )
    ).rows;
    assertBootstrapPlansEmpty(stored);
  }
  const operations = await prepared.operations.prepare(
    tx,
    input,
    graph.operations,
    [],
  );
  plans.splice(5, 0, operations); // owned labels and core precede operation references
  await writeReconciliationPlans(tx, plans, {
    change_set_id: input.changeSetId,
    entity_id: input.entityId,
    tenant_id: null,
    created_by: input.actorId,
  });
  await assertNativeAuthoringContract(tx, input, schemaHash, 2);
  const stored = await readers.native({
    nativeVersion: 2,
    status: "draft",
    lockVersion: 1,
    sourceKind: "product",
    authoringSchemaHash: schemaHash,
  });
  if (canonicalJson(stored) !== canonicalJson(graph))
    fail("NATIVE_AUTHORING_PERSISTENCE_MISMATCH");
  const controls = await loadNativeCompilationOperations(
    tx,
    { ...input, revision: 1, graphHash: sha256(stored) },
    stored,
    policy.host.commands.maxMembers,
  );
  const compiled = compileNativeRelease(stored, prepared.compiler, controls);
  verifyNativeCompiledOperationControls(controls, compiled.descriptor);
  const runtime = stored.runtimeProfiles[0];
  const identity = stored.fields.find((f) => f.id === runtime?.idFieldId);
  const key = prepared.compiler.core.identities.find(
    (i) =>
      i.id === identity?.fieldIdentityId &&
      i.entityId === input.entityId &&
      i.tenantId === input.tenantId,
  );
  if (
    !runtime ||
    !key ||
    key.fieldKey !== prepared.reader.registration.storage.idField ||
    prepared.reader.registration.plane !==
      prepared.compiler.authorization.plane ||
    runtime.storagePlane !== prepared.reader.storagePlane ||
    runtime.storageSchema !== prepared.reader.registration.storage.schema ||
    runtime.storageObject !== prepared.reader.registration.storage.object ||
    prepared.reader.registration.presentationDefaults !== undefined ||
    prepared.reader.registration.fieldPresentationDefaults !== undefined
  )
    fail("NATIVE_BOOTSTRAP_READER_MISMATCH");
  compileNativeRuntimeProjection({
    native: compiled.descriptor,
    registration: prepared.reader.registration,
    permissions: prepared.reader.permissions,
  });
  await snapshot(tx, input, 1, stored, "saved");
  const result: NativeBootstrapResult = {
    changeSetId: input.changeSetId,
    revision: 1,
    graphHash: sha256(stored),
    compiledHash: sha256(compiled),
    replay: false,
  };
  await sql`INSERT INTO metadata.entity_authoring_command_receipt(change_set_id,tenant_id,actor_id,idempotency_key,request_hash,expected_revision,revision,changed,identities)
    VALUES(${input.changeSetId}::uuid,NULL,${input.actorId}::uuid,${input.idempotencyKey},${requestHash},0,1,true,${JSON.stringify({ graphHash: result.graphHash, compiledHash: result.compiledHash })}::jsonb)`.execute(
    tx,
  );
  await policy.audit(tx, input, result);
  return result;
}
