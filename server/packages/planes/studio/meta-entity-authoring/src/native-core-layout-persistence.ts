import { sql, type Transaction } from "kysely";
import {
  AuthoringConflictError,
  AuthoringPolicyError,
  parseNativeCoreLayoutCommands,
  parseNormalizedLayoutGraph,
  validateFoundationNode,
  referenceUuid,
  type NativeCoreLayoutCommandPolicy,
  type NativeAuthoringSnapshot,
  type NormalizedLayoutContext,
  type LabelCommandResult,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  fingerprintCommand,
  parseIdempotencyKey,
} from "@athyper/server-contract-events";
import { canonicalJson, sha256 } from "./deterministic.js";
import { changed } from "./graph-reconciliation.js";
import { writeReconciliationPlans } from "./scoped-graph-writer.js";
import {
  loadNormalizedCoreLayout,
  prepareNormalizedCoreLayoutSave,
  type NormalizedSaveCoordinate,
} from "./normalized-core-layout-storage.js";
import {
  applyNativeCoreLayoutCommands,
  type NativeCoreLayoutState,
  type NativeMemberInitializer,
} from "./native-core-layout-command-reducer.js";
type Tx = Transaction<Record<string, never>>;
export interface NativeCommandInput extends NormalizedSaveCoordinate {
  readonly actorId: string;
  readonly batch: unknown;
}
/** Trusted existing-host composition, never an HTTP-supplied policy/initializer.
 * Admission must resolve independent governed host/product authoring controls.
 * This contract does not itself qualify a host or grant product database writes. */
export interface NativeAuthoringPolicy {
  readonly commands: NativeCoreLayoutCommandPolicy;
  /** Explicit installed host admission; absence supports only the original source. */
  readonly snapshotVersions?: readonly (1 | 2)[];
  admit(
    tx: Tx,
    input: NativeCommandInput,
    intent: "read" | "write" | "history",
  ): Promise<void>;
  resolveContext(
    tx: Tx,
    coordinate: NormalizedSaveCoordinate,
    state: NativeCoreLayoutState,
  ): Promise<NormalizedLayoutContext>;
  resolveInitializer(
    tx: Tx,
    coordinate: NormalizedSaveCoordinate,
  ): Promise<NativeMemberInitializer>;
}
export interface NativeDraftRoot {
  readonly nativeVersion?: 1 | 2;
  readonly status: string;
  readonly lockVersion: number;
  readonly sourceKind: "product" | "tenant_entity";
  readonly authoringSchemaHash: string;
}
const fail = (code: string, message: string): never => {
  throw new AuthoringPolicyError(code, message);
};
export async function lockNativeDraft(
  tx: Tx,
  c: NormalizedSaveCoordinate,
  schemaHash: string,
  versions: readonly (1 | 2)[] = [1],
): Promise<NativeDraftRoot> {
  if (!tx.isTransaction)
    fail(
      "NORMALIZED_SAVE_TRANSACTION_REQUIRED",
      "Existing authoring transaction required.",
    );
  for (const id of [
    c.entityId,
    c.changeSetId,
    ...(c.tenantId === null ? [] : [c.tenantId]),
  ])
    validateFoundationNode(referenceUuid, id, "/coordinate");
  const row = (
    await sql<{
      source: Record<string, unknown>;
    }>`SELECT to_jsonb(cs) AS source FROM metadata.entity_change_set cs WHERE id=${c.changeSetId}::uuid AND entity_id=${c.entityId}::uuid AND tenant_id IS NOT DISTINCT FROM ${c.tenantId}::uuid FOR UPDATE`.execute(
      tx,
    )
  ).rows[0]?.source;
  if (!row)
    throw new AuthoringPolicyError(
      "AUTHORING_DRAFT_NOT_FOUND",
      "The scoped draft is unavailable.",
    );
  if (
    !versions.includes(row.native_core_layout_version as 1 | 2) ||
    ![1, 2].includes(row.native_core_layout_version as number) ||
    row.authoring_schema_hash !== schemaHash
  )
    fail(
      "NATIVE_AUTHORING_SOURCE_NOT_INITIALIZED",
      "Explicit versioned conversion and an exact descriptor pin are required.",
    );
  if (
    row.reference_contract_version !== 1 ||
    typeof row.default_locale !== "string" ||
    row.default_locale.length === 0
  )
    fail(
      "NATIVE_AUTHORING_DEPENDENCIES_NOT_CONVERTED",
      "Stable identities, selected reference members and owned labels must be converted before the native source is tagged.",
    );
  const sourceKind = row.source_kind;
  if (!(
    (sourceKind === "product" && c.tenantId === null) ||
    (sourceKind === "tenant_entity" && c.tenantId !== null)
  ))
    fail(
      "NATIVE_AUTHORING_SOURCE_KIND_UNSUPPORTED",
      "This slice does not authorize tenant extensions or inferred ownership.",
    );
  const revision = Number(row.lock_version);
  if (!Number.isSafeInteger(revision) || revision < 0)
    fail("AUTHORING_REVISION_INVALID", "Invalid source revision.");
  return {
    nativeVersion: row.native_core_layout_version as 1 | 2,
    status: String(row.status),
    lockVersion: revision,
    sourceKind: sourceKind as NativeDraftRoot["sourceKind"],
    authoringSchemaHash: schemaHash,
  };
}
/** Schema qualification belongs to a reviewed native-cutover forward migration.
 * Absence of dormant checks alone must never establish native readiness. */
export async function assertNativeAuthoringContract(
  tx: Tx,
  c: NormalizedSaveCoordinate,
  hash: string,
  version: 1 | 2 = 1,
): Promise<void> {
  if (version === 2) {
    const available = (
      await sql<{
        available: boolean;
      }>`SELECT to_regprocedure('metadata.fn_assert_native_authoring_snapshot(uuid,text,integer)') IS NOT NULL AS available`.execute(
        tx,
      )
    ).rows[0]?.available;
    if (!available)
      fail(
        "ENTITY_NATIVE_SNAPSHOT_CUTOVER_REQUIRED",
        "The expanded snapshot schema conformance guard is not installed.",
      );
    await sql`SELECT metadata.fn_assert_native_authoring_snapshot(${c.changeSetId}::uuid,${hash},${version})`.execute(
      tx,
    );
    return;
  }
  const available = (
    await sql<{
      available: boolean;
    }>`SELECT to_regprocedure('metadata.fn_assert_native_authoring_contract(uuid,text)') IS NOT NULL AS available`.execute(
      tx,
    )
  ).rows[0]?.available;
  if (!available)
    fail(
      "ENTITY_NATIVE_SCHEMA_CUTOVER_REQUIRED",
      "The registered native schema conformance guard is not installed.",
    );
  await sql`SELECT metadata.fn_assert_native_authoring_contract(${c.changeSetId}::uuid,${hash})`.execute(
    tx,
  );
}
async function capture(
  tx: Tx,
  input: NativeCommandInput,
  revision: number,
  kind: "previous" | "saved",
  graph: NativeAuthoringSnapshot,
) {
  await sql`INSERT INTO snapshot.entity_draft_save(change_set_id,lock_version,tenant_id,graph,graph_hash,captured_by,capture_kind) VALUES(${input.changeSetId}::uuid,${revision},${input.tenantId}::uuid,${canonicalJson(graph)}::jsonb,${sha256(graph)},${input.actorId}::uuid,${kind}) ON CONFLICT(change_set_id,lock_version) DO NOTHING`.execute(
    tx,
  );
  const stored = (
    await sql<{
      graph: NativeAuthoringSnapshot;
      graph_hash: string;
    }>`SELECT graph,graph_hash FROM snapshot.entity_draft_save WHERE change_set_id=${input.changeSetId}::uuid AND lock_version=${revision} AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid`.execute(
      tx,
    )
  ).rows[0];
  if (
    !stored ||
    stored.graph_hash !== sha256(graph) ||
    sha256(stored.graph) !== stored.graph_hash
  )
    throw new AuthoringConflictError(
      "The immutable saved revision contains different content.",
    );
}
/** Runs inside the same repository transaction/savepoint as existing typed commands.
 * Snapshot loader captures all unchanged branches too, not just edited members. */
export async function saveNativeCoreLayoutCommands(
  tx: Tx,
  input: NativeCommandInput,
  policy: NativeAuthoringPolicy,
  snapshot: (root: NativeDraftRoot) => Promise<NativeAuthoringSnapshot>,
): Promise<LabelCommandResult> {
  const batch = parseNativeCoreLayoutCommands(input.batch, policy.commands);
  if (!parseIdempotencyKey(batch.idempotencyKey).ok)
    fail(
      "AUTHORING_IDEMPOTENCY_KEY_INVALID",
      "Valid command identity required.",
    );
  validateFoundationNode(referenceUuid, input.actorId, "/actorId");
  await policy.admit(tx, input, "write"); // Every replay rechecks current independent authority.
  const root = await lockNativeDraft(
    tx,
    input,
    policy.commands.authoringSchemaHash,
    policy.snapshotVersions,
  );
  await assertNativeAuthoringContract(
    tx,
    input,
    root.authoringSchemaHash,
    root.nativeVersion,
  );
  const hash = fingerprintCommand({ ...input, batch });
  const receipt = (
    await sql<{
      request_hash: string;
      actor_id: string;
      revision: string;
      changed: boolean;
      identities: Record<string, string>;
    }>`SELECT request_hash,actor_id,revision,changed,identities FROM metadata.entity_authoring_command_receipt WHERE change_set_id=${input.changeSetId}::uuid AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid AND idempotency_key=${batch.idempotencyKey}`.execute(
      tx,
    )
  ).rows[0];
  if (receipt) {
    if (receipt.request_hash !== hash || receipt.actor_id !== input.actorId)
      fail(
        "AUTHORING_IDEMPOTENCY_CONFLICT",
        "The identity is bound to another request.",
      );
    return {
      changeSetId: input.changeSetId,
      revision: Number(receipt.revision),
      changed: receipt.changed,
      identities: receipt.identities,
    };
  }
  if (root.lockVersion !== batch.expectedRevision)
    throw new AuthoringConflictError("Stale native authoring revision.");
  if (root.status !== "draft" && root.status !== "rejected")
    fail("AUTHORING_DRAFT_NOT_EDITABLE", "Source is sealed.");
  const before = await loadNormalizedCoreLayout(tx, input);
  const resolved = await policy.resolveContext(tx, input, before);
  if (
    resolved.coreContext.entityId !== input.entityId ||
    resolved.coreContext.tenantId !== input.tenantId
  )
    fail(
      "NORMALIZED_SAVE_CONTEXT_MISMATCH",
      "Independent context must match the exact source scope.",
    );
  const context = {
    ...resolved,
    maxMembers: Math.min(resolved.maxMembers, policy.commands.maxMembers),
    coreContext: {
      ...resolved.coreContext,
      maxMembers: Math.min(
        resolved.coreContext.maxMembers,
        policy.commands.maxMembers,
      ),
    },
  };
  parseNormalizedLayoutGraph(before.layout, { ...context, core: before.core });
  const allocations: string[] = [];
  for (const c of batch.commands)
    if (c.kind === "addMember")
      allocations.push(
        (await sql<{ id: string }>`SELECT shared.uuidv7() AS id`.execute(tx))
          .rows[0]!.id,
      );
  const initialize: NativeMemberInitializer = batch.commands.some(
    (c) => c.kind === "addMember",
  )
    ? await policy.resolveInitializer(tx, input)
    : () =>
        fail(
          "NATIVE_INITIALIZATION_SOURCE_REQUIRED",
          "An unexpected insertion requires independent initialization.",
        );
  const next = applyNativeCoreLayoutCommands(
    before,
    batch,
    context,
    () => allocations.shift()!,
    initialize,
  );
  const plans = await prepareNormalizedCoreLayoutSave(tx, input, next, {
    ...context,
    core: next.core,
  });
  const change = plans.some(changed),
    revision = batch.expectedRevision + Number(change);
  if (!Number.isSafeInteger(revision))
    fail(
      "AUTHORING_REVISION_EXHAUSTED",
      "Revision exceeds the safe integer bound.",
    );
  if (change) {
    const previous = await snapshot(root);
    assertSnapshotSource(previous, input, root);
    const advanced = (
      await sql<{
        revision: string;
      }>`SELECT metadata.fn_advance_entity_change_set(${input.changeSetId}::uuid,${batch.expectedRevision},${input.actorId}::uuid) AS revision`.execute(
        tx,
      )
    ).rows[0];
    if (Number(advanced?.revision) !== revision)
      throw new AuthoringConflictError("Native revision advance failed.");
    await capture(tx, input, batch.expectedRevision, "previous", previous);
    await writeReconciliationPlans(tx, plans, {
      change_set_id: input.changeSetId,
      entity_id: input.entityId,
      tenant_id: input.tenantId,
      created_by: input.actorId,
    });
    const stored = await loadNormalizedCoreLayout(tx, input);
    parseNormalizedLayoutGraph(stored.layout, {
      ...context,
      core: stored.core,
    });
    if (
      canonicalJson(stored) !==
      canonicalJson({ core: next.core, layout: next.layout })
    )
      fail(
        "NATIVE_AUTHORING_PERSISTENCE_MISMATCH",
        "The stored final graph differs from the accepted commands.",
      );
    const saved = await snapshot(root);
    assertSnapshotSource(saved, input, root);
    await capture(tx, input, revision, "saved", saved);
  }
  await sql`INSERT INTO metadata.entity_authoring_command_receipt(change_set_id,tenant_id,actor_id,idempotency_key,request_hash,expected_revision,revision,changed,identities) VALUES(${input.changeSetId}::uuid,${input.tenantId}::uuid,${input.actorId}::uuid,${batch.idempotencyKey},${hash},${batch.expectedRevision},${revision},${change},${JSON.stringify(next.identities)}::jsonb)`.execute(
    tx,
  );
  return {
    changeSetId: input.changeSetId,
    revision,
    changed: change,
    identities: next.identities,
  };
}

function assertSnapshotSource(
  graph: NativeAuthoringSnapshot,
  input: NativeCommandInput,
  root: NativeDraftRoot,
): void {
  const schema =
    root.nativeVersion === 2
      ? "athyper.meta-entity-contract/2.5"
      : "athyper.meta-entity-contract/2.4";
  const source = graph.authoringSource;
  if (
    graph.contractSchema !== schema ||
    !source ||
    source.entityId !== input.entityId ||
    source.tenantId !== input.tenantId ||
    source.sourceKind !== root.sourceKind ||
    source.authoringSchemaHash !== root.authoringSchemaHash
  )
    fail(
      "NATIVE_AUTHORING_SNAPSHOT_SOURCE_MISMATCH",
      "Snapshot version, coordinates and descriptor must match the locked source.",
    );
}
