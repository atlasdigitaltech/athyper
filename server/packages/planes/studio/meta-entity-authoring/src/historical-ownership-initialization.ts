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
import type { NormalizedSaveCoordinate } from "./normalized-core-layout-storage.js";
type Tx = Transaction<Record<string, never>>;
export interface HistoricalOwnershipInput extends NormalizedSaveCoordinate {
  readonly actorId: string;
  readonly expectedRevision: number;
  readonly expectedSourceHash: string;
  readonly idempotencyKey: string;
}
/** Installed server composition only. Admission must check current authoring
 * authority and installed descriptor trust/revocation on every call, including
 * replay. Neither a request body nor an identity review substitutes for it. */
export interface HistoricalOwnershipPolicy {
  readonly schemaVersion: number;
  readonly authoringSchemaHash: string;
  admit(tx: Tx, input: HistoricalOwnershipInput): Promise<void>;
  audit(
    tx: Tx,
    input: HistoricalOwnershipInput,
    result: HistoricalOwnershipResult,
  ): Promise<void>;
}
export interface HistoricalOwnershipResult {
  readonly changeSetId: string;
  readonly revision: number;
  readonly sourceHash: string;
  readonly sourceKind: "product";
  readonly publicationOwner: "platform";
  readonly schemaVersion: number;
  readonly authoringSchemaHash: string;
  readonly replay: boolean;
}
const fail = (code: string): never => {
  throw new AuthoringPolicyError(
    code,
    "Canonical ownership initialization requirements are not satisfied.",
  );
};
/** Caller owns transaction/savepoint. No operation, protected state, identity,
 * release, target or native format changes. Product scope is verified in SQL. */
export async function applyHistoricalOwnershipInitialization(
  tx: Tx,
  request: HistoricalOwnershipInput,
  policy: HistoricalOwnershipPolicy,
  load: () => Promise<MetaEntityGraph>,
): Promise<HistoricalOwnershipResult> {
  if (!tx.isTransaction) fail("NORMALIZED_SAVE_TRANSACTION_REQUIRED");
  validateConversionJsonData(request, "/ownership");
  const input = structuredClone(request);
  if (
    Object.keys(input).sort().join() !==
      "actorId,changeSetId,entityId,expectedRevision,expectedSourceHash,idempotencyKey,tenantId" ||
    input.tenantId !== null ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    !Number.isSafeInteger(input.expectedRevision + 1) ||
    !/^[a-f0-9]{64}$/.test(input.expectedSourceHash) ||
    !parseIdempotencyKey(input.idempotencyKey).ok
  )
    fail("LEGACY_OWNERSHIP_REQUEST_INVALID");
  for (const id of [input.actorId, input.entityId, input.changeSetId])
    validateFoundationNode(referenceUuid, id, "/ownership/id");
  if (
    !policy?.admit ||
    !policy.audit ||
    !Number.isSafeInteger(policy.schemaVersion) ||
    policy.schemaVersion < 1 ||
    policy.schemaVersion > 2147483647 ||
    !/^[a-f0-9]{64}$/.test(policy.authoringSchemaHash)
  )
    fail("LEGACY_OWNERSHIP_POLICY_REQUIRED");
  const pin = {
    schemaVersion: policy.schemaVersion,
    authoringSchemaHash: policy.authoringSchemaHash,
  };
  await policy.admit(tx, structuredClone(input));
  const root = (
    await sql<{
      source: Record<string, unknown>;
    }>`SELECT to_jsonb(cs) AS source FROM metadata.entity_change_set cs JOIN metadata.entity e ON e.id=cs.entity_id WHERE cs.id=${input.changeSetId}::uuid AND cs.entity_id=${input.entityId}::uuid AND cs.tenant_id IS NULL AND e.tenant_id IS NULL AND e.ownership_model='system' FOR UPDATE OF cs`.execute(
      tx,
    )
  ).rows[0]?.source;
  if (!root) fail("LEGACY_OWNERSHIP_SOURCE_UNAVAILABLE");
  const hash = fingerprintCommand({
    kind: "historical-ownership-initialization",
    ...input,
    ...pin,
  });
  const receipt = (
    await sql<{
      request_hash: string;
      actor_id: string;
      revision: string;
      identities: Record<string, unknown>;
    }>`SELECT request_hash,actor_id,revision,identities FROM metadata.entity_authoring_command_receipt WHERE change_set_id=${input.changeSetId}::uuid AND tenant_id IS NULL AND idempotency_key=${input.idempotencyKey}`.execute(
      tx,
    )
  ).rows[0];
  const revision = input.expectedRevision + 1;
  const evidence = {
    kind: "historical-ownership-initialization",
    sourceHash: input.expectedSourceHash,
    sourceKind: "product",
    publicationOwner: "platform",
    ...pin,
  };
  const result: HistoricalOwnershipResult = {
    changeSetId: input.changeSetId,
    revision,
    sourceHash: input.expectedSourceHash,
    sourceKind: "product",
    publicationOwner: "platform",
    ...pin,
    replay: !!receipt,
  };
  if (receipt) {
    if (
      receipt.request_hash !== hash ||
      receipt.actor_id !== input.actorId ||
      Number(receipt.revision) !== revision ||
      canonicalJson(receipt.identities) !== canonicalJson(evidence)
    )
      throw new AuthoringConflictError(
        "Ownership command identity conflicts with the original request.",
      );
    if (
      root!.source_kind !== "product" ||
      root!.publication_owner !== "platform" ||
      root!.schema_version !== pin.schemaVersion ||
      root!.authoring_schema_hash !== pin.authoringSchemaHash ||
      root!.source_hash !== input.expectedSourceHash
    )
      fail("LEGACY_OWNERSHIP_REPLAY_INVALID");
    const history = (
      await sql<{
        lock_version: string;
        graph: MetaEntityGraph;
        graph_hash: string;
      }>`SELECT lock_version,graph,graph_hash FROM snapshot.entity_draft_save WHERE change_set_id=${input.changeSetId}::uuid AND tenant_id IS NULL AND lock_version IN (${input.expectedRevision},${revision}) ORDER BY lock_version`.execute(
        tx,
      )
    ).rows;
    if (
      history.length !== 2 ||
      Number(history[0]!.lock_version) !== input.expectedRevision ||
      Number(history[1]!.lock_version) !== revision ||
      history.some(
        (h) =>
          h.graph_hash !== input.expectedSourceHash ||
          sha256(h.graph) !== h.graph_hash,
      )
    )
      fail("LEGACY_OWNERSHIP_HISTORY_INVALID");
    await policy.audit(tx, input, result);
    return result;
  }
  if (Number(root!.lock_version) !== input.expectedRevision)
    throw new AuthoringConflictError("Stale ownership source revision.");
  if (!["draft", "rejected"].includes(String(root!.status)))
    fail("AUTHORING_DRAFT_NOT_EDITABLE");
  if (
    [
      "source_kind",
      "schema_version",
      "authoring_schema_hash",
      "publication_owner",
      "source_hash",
      "native_core_layout_version",
      "reference_contract_version",
    ].some((k) => root![k] != null)
  )
    fail("LEGACY_OWNERSHIP_ALREADY_INITIALIZED");
  const source = await load();
  if (
    ![
      "athyper.meta-entity-contract/2.1",
      "athyper.meta-entity-contract/2.2",
    ].includes(source.contractSchema) ||
    sha256(source) !== input.expectedSourceHash
  )
    fail("LEGACY_OWNERSHIP_SOURCE_MISMATCH");
  async function capture(version: number, kind: "previous" | "saved") {
    await sql`INSERT INTO snapshot.entity_draft_save(change_set_id,lock_version,tenant_id,graph,graph_hash,captured_by,capture_kind) VALUES(${input.changeSetId}::uuid,${version},NULL,${canonicalJson(source)}::jsonb,${input.expectedSourceHash},${input.actorId}::uuid,${kind}) ON CONFLICT(change_set_id,lock_version) DO NOTHING`.execute(
      tx,
    );
    const row = (
      await sql<{
        graph: MetaEntityGraph;
        graph_hash: string;
      }>`SELECT graph,graph_hash FROM snapshot.entity_draft_save WHERE change_set_id=${input.changeSetId}::uuid AND lock_version=${version} AND tenant_id IS NULL`.execute(
        tx,
      )
    ).rows[0];
    if (
      !row ||
      row.graph_hash !== input.expectedSourceHash ||
      sha256(row.graph) !== row.graph_hash
    )
      fail("LEGACY_OWNERSHIP_HISTORY_INVALID");
  }
  await capture(input.expectedRevision, "previous");
  const advanced = (
    await sql<{
      revision: string;
    }>`SELECT metadata.fn_advance_entity_change_set(${input.changeSetId}::uuid,${input.expectedRevision},${input.actorId}::uuid) AS revision`.execute(
      tx,
    )
  ).rows[0];
  if (Number(advanced?.revision) !== revision)
    fail("LEGACY_OWNERSHIP_REVISION_INVALID");
  const updated =
    await sql`UPDATE metadata.entity_change_set SET source_kind='product',publication_owner='platform',schema_version=${pin.schemaVersion},authoring_schema_hash=${pin.authoringSchemaHash},source_hash=${input.expectedSourceHash} WHERE id=${input.changeSetId}::uuid AND entity_id=${input.entityId}::uuid AND tenant_id IS NULL AND lock_version=${revision} RETURNING id,lock_version`.execute(
      tx,
    );
  if (
    updated.rows.length !== 1 ||
    Number((updated.rows[0] as { lock_version: unknown }).lock_version) !==
      revision
  )
    fail("LEGACY_OWNERSHIP_REVISION_INVALID");
  if (sha256(await load()) !== input.expectedSourceHash)
    fail("LEGACY_OWNERSHIP_GRAPH_CHANGED");
  await capture(revision, "saved");
  await sql`INSERT INTO metadata.entity_authoring_command_receipt(change_set_id,tenant_id,actor_id,idempotency_key,request_hash,expected_revision,revision,changed,identities) VALUES(${input.changeSetId}::uuid,NULL,${input.actorId}::uuid,${input.idempotencyKey},${hash},${input.expectedRevision},${revision},true,${canonicalJson(evidence)}::jsonb)`.execute(
    tx,
  );
  await policy.audit(tx, input, result);
  return result;
}
