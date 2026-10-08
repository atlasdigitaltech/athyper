import { sql, type Transaction } from "kysely";
import {
  AuthoringPolicyError,
  referenceUuid,
  validateReferenceIdentity,
  validateFoundationNode,
  type ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import type { NativeReleaseCompilationContext } from "./native-release-compilation.js";
import { sha256 } from "./deterministic.js";
import type { NativeBootstrapInput } from "./native-bootstrap-application.js";
export interface NativeIdentityAdoptionSource {
  readonly identityId: string;
  readonly targetFieldId: string;
  readonly sourceChangeSetId: string;
  readonly sourceFieldId: string;
  readonly sourceRevision: number;
  readonly sourceHash: string;
}
/** Resolve exact existing identities; never allocate replacements or change
 * introduction provenance. Source coordinates come from trusted preparation,
 * not the request. Database adoption independently verifies the immutable source.
 */
export async function establishNativeBootstrapIdentities(
  tx: Transaction<Record<string, never>>,
  input: NativeBootstrapInput,
  graph: ExpandedNativeMetaEntityGraph,
  context: NativeReleaseCompilationContext["core"],
  sources: readonly NativeIdentityAdoptionSource[],
) {
  const fail = (code: string): never => {
    throw new AuthoringPolicyError(
      code,
      "Resolve exact installed identities and source-bound adoption before native bootstrap.",
    );
  };
  if (!tx.isTransaction) fail("NORMALIZED_SAVE_TRANSACTION_REQUIRED");
  const captured = structuredClone(sources);
  if (
    captured.length > graph.fields.length ||
    new Set(captured.map((s) => s.identityId)).size !== captured.length ||
    new Set(captured.map((s) => s.targetFieldId)).size !== captured.length
  )
    fail("NATIVE_IDENTITY_ADOPTION_INVALID");
  for (const s of captured) {
    if (
      Object.keys(s).sort().join() !==
        "identityId,sourceChangeSetId,sourceFieldId,sourceHash,sourceRevision,targetFieldId" ||
      !Number.isSafeInteger(s.sourceRevision) ||
      s.sourceRevision < 0 ||
      !/^[a-f0-9]{64}$/.test(s.sourceHash)
    )
      fail("NATIVE_IDENTITY_ADOPTION_INVALID");
    for (const id of [
      s.identityId,
      s.targetFieldId,
      s.sourceChangeSetId,
      s.sourceFieldId,
    ])
      validateFoundationNode(referenceUuid, id, "/identityAdoption");
  }
  const consumed = new Set<string>();
  for (const field of [...graph.fields].sort((a, b) =>
    a.fieldIdentityId.localeCompare(b.fieldIdentityId),
  )) {
    const expected = context.identities.filter(
      (i) => i.id === field.fieldIdentityId,
    );
    if (
      expected.length !== 1 ||
      expected[0]!.entityId !== input.entityId ||
      expected[0]!.tenantId !== input.tenantId
    )
      fail("NATIVE_IDENTITY_CONTEXT_INVALID");
    const rows = (
      await sql<{
        id: string;
        field_key: string;
        parent_identity_id: string | null;
        identity_status: string;
        introduced_change_set_id: string;
      }>`
      SELECT id,field_key,parent_identity_id,identity_status,introduced_change_set_id FROM metadata.entity_field_identity
      WHERE id=${field.fieldIdentityId}::uuid AND entity_id=${input.entityId}::uuid AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid`.execute(
        tx,
      )
    ).rows;
    const identity = rows[0];
    if (
      rows.length !== 1 ||
      !identity ||
      identity.field_key !== expected[0]!.fieldKey ||
      identity.parent_identity_id !== expected[0]!.parentIdentityId ||
      !["active", "reserved"].includes(identity.identity_status)
    )
      fail("NATIVE_IDENTITY_INSTALLED_SOURCE_REQUIRED");
    const source = captured.find((s) => s.identityId === field.fieldIdentityId);
    if (
      identity!.identity_status === "active" ||
      identity!.introduced_change_set_id === input.changeSetId
    ) {
      if (source) fail("NATIVE_IDENTITY_ADOPTION_UNEXPECTED");
      continue;
    }
    if (
      !source ||
      source.targetFieldId !== field.id ||
      source.sourceChangeSetId !== identity!.introduced_change_set_id
    )
      fail("NATIVE_IDENTITY_ADOPTION_REQUIRED");
    await sql`SELECT entity_command_private.adopt_native_identity(${input.changeSetId}::uuid,${field.fieldIdentityId}::uuid,${field.id}::uuid,${source!.sourceChangeSetId}::uuid,${source!.sourceFieldId}::uuid,${source!.sourceRevision}::bigint,${source!.sourceHash},${input.proposalHash})`.execute(
      tx,
    );
    consumed.add(source!.identityId);
  }
  if (consumed.size !== captured.length)
    fail("NATIVE_IDENTITY_ADOPTION_UNUSED");
}

/** Compiler bindings are read from installed identities in the admitted application
 * transaction. An import cannot supply its own field keys or identity ownership.
 * Reservation adoption is still independently checked by the canonical writer.
 */
export async function resolveNativeBootstrapIdentities(
  tx: Transaction<Record<string, never>>,
  input: NativeBootstrapInput,
  graph: ExpandedNativeMetaEntityGraph,
): Promise<NativeReleaseCompilationContext["core"]["identities"]> {
  const fail = (): never => {
    throw new AuthoringPolicyError(
      "NATIVE_IDENTITY_BINDING_UNAVAILABLE",
      "Resolve every native field from installed, scoped stable identities.",
    );
  };
  if (
    !tx.isTransaction ||
    input.tenantId !== null ||
    graph.authoringSource.entityId !== input.entityId ||
    graph.authoringSource.tenantId !== null ||
    graph.authoringSource.sourceKind !== "product" ||
    graph.ownedLabels?.changeSetId !== input.changeSetId ||
    sha256(graph) !== input.proposalHash ||
    !graph.fields.length ||
    graph.fields.length > 4096
  )
    fail();
  for (const id of [input.entityId, input.changeSetId, input.actorId])
    validateFoundationNode(referenceUuid, id, "/bootstrap/id");
  const ids = graph.fields.map((field) => field.fieldIdentityId);
  if (new Set(ids).size !== ids.length) fail();
  for (const id of ids)
    validateFoundationNode(referenceUuid, id, "/bootstrap/identity");
  const rows = (
    await sql<{
      id: string;
      entity_id: string;
      tenant_id: string | null;
      field_key: string;
      parent_identity_id: string | null;
      identity_status: string;
    }>`SELECT id,entity_id,tenant_id,field_key,parent_identity_id,identity_status
    FROM metadata.entity_field_identity
    WHERE entity_id=${input.entityId}::uuid AND tenant_id IS NULL
    AND id IN (${sql.join(ids.map((id) => sql`${id}::uuid`))})
    AND entity_command_private.admitted_creation(${input.changeSetId}::uuid,${input.entityId}::uuid)
    AND current_setting('app.current_principal_id',true)=${input.actorId}`.execute(
      tx,
    )
  ).rows;
  if (
    rows.length !== ids.length ||
    new Set(rows.map((row) => row.id)).size !== ids.length
  )
    fail();
  return ids.map((id) => {
    const row = rows.find((row) => row.id === id);
    if (
      !row ||
      row.entity_id !== input.entityId ||
      row.tenant_id !== null ||
      !["active", "reserved"].includes(row.identity_status) ||
      !row.field_key
    )
      return fail();
    return {
      id: row.id,
      entityId: row.entity_id,
      tenantId: row.tenant_id,
      fieldKey: row.field_key,
      parentIdentityId: row.parent_identity_id,
    };
  });
}

/** Trusted host selection only. A graph cannot select fresh allocation itself. */
export type NativeBootstrapIdentityMode = "installed" | "fresh";

export function plannedNativeBootstrapIdentities(
  input: NativeBootstrapInput,
  graph: ExpandedNativeMetaEntityGraph,
): NativeReleaseCompilationContext["core"]["identities"] {
  const fail = (): never => {
    throw new AuthoringPolicyError(
      "NATIVE_FRESH_IDENTITIES_INVALID",
      "Fresh identities must exactly cover the scoped proposal, with no predecessor or release provenance.",
    );
  };
  if (
    input.tenantId !== null ||
    graph.authoringSource.entityId !== input.entityId ||
    graph.authoringSource.sourceKind !== "product" ||
    graph.authoringSource.tenantId !== null ||
    graph.ownedLabels?.changeSetId !== input.changeSetId ||
    sha256(graph) !== input.proposalHash
  )
    fail();
  const rows = graph.fieldIdentities;
  if (
    !rows?.length ||
    rows.length > 4096 ||
    rows.length !== graph.fields.length
  )
    return fail();
  const ids = new Set(rows.map((r) => r.id));
  if (
    ids.size !== rows.length ||
    new Set(
      rows.map((r) => JSON.stringify([r.parentIdentityId ?? null, r.fieldKey])),
    ).size !== rows.length ||
    new Set(graph.fields.map((f) => f.fieldIdentityId)).size !== rows.length ||
    graph.fields.some((f) => !ids.has(f.fieldIdentityId))
  )
    fail();
  for (const row of rows) {
    validateReferenceIdentity(row);
    if (
      row.entityId !== input.entityId ||
      row.tenantId != null ||
      row.introducedChangeSetId !== input.changeSetId ||
      row.createdBy !== input.actorId ||
      row.identityStatus !== "reserved" ||
      row.firstReleaseId != null ||
      row.retiredAt != null ||
      row.retiredBy != null ||
      row.retirementReleaseId != null ||
      row.replacementIdentityId != null
    )
      fail();
    const visited = new Set([row.id]);
    let parent = row.parentIdentityId;
    while (parent != null) {
      if (!ids.has(parent) || visited.has(parent)) fail();
      visited.add(parent);
      parent = rows.find((r) => r.id === parent)!.parentIdentityId;
    }
  }
  return graph.fields.map((field) => {
    const row = rows.find((r) => r.id === field.fieldIdentityId)!;
    return {
      id: row.id,
      entityId: row.entityId,
      tenantId: null,
      fieldKey: row.fieldKey,
      parentIdentityId: row.parentIdentityId ?? null,
    };
  });
}

/** Inserts only after canonical root creation, inside its admitted transaction.
 * No upsert/adoption: any collision rolls back the entire bootstrap. */
export async function persistFreshNativeBootstrapIdentities(
  tx: Transaction<Record<string, never>>,
  input: NativeBootstrapInput,
  graph: ExpandedNativeMetaEntityGraph,
  expected: NativeReleaseCompilationContext["core"]["identities"],
): Promise<void> {
  const planned = plannedNativeBootstrapIdentities(input, graph);
  if (!tx.isTransaction || sha256(planned) !== sha256(expected))
    throw new AuthoringPolicyError(
      "NATIVE_FRESH_IDENTITY_CONTEXT_MISMATCH",
      "Fresh identity compilation and persistence must agree.",
    );
  const remaining = [...graph.fieldIdentities!];
  const inserted = new Set<string>();
  while (remaining.length) {
    const index = remaining.findIndex(
      (r) => r.parentIdentityId == null || inserted.has(r.parentIdentityId),
    );
    const row = remaining.splice(index, 1)[0]!;
    const result = await sql`INSERT INTO metadata.entity_field_identity
      (id,entity_id,tenant_id,field_key,parent_identity_id,identity_status,introduced_change_set_id,created_at,created_by)
      SELECT ${row.id}::uuid,${input.entityId}::uuid,NULL,${row.fieldKey},${row.parentIdentityId ?? null}::uuid,
        'reserved',${input.changeSetId}::uuid,${row.createdAt}::timestamptz,${input.actorId}::uuid
      FROM metadata.entity_change_set c WHERE c.id=${input.changeSetId}::uuid AND c.entity_id=${input.entityId}::uuid
        AND c.tenant_id IS NULL AND c.source_kind='product' AND c.native_core_layout_version=2
        AND c.status='draft' AND c.lock_version=1 AND c.created_by=${input.actorId}::uuid
        AND current_setting('app.current_principal_id',true)=${input.actorId}
        AND entity_command_private.admitted_creation(c.id,c.entity_id)
      RETURNING id`.execute(tx);
    if (result.rows.length !== 1)
      throw new AuthoringPolicyError(
        "NATIVE_FRESH_IDENTITY_ADMISSION_REQUIRED",
        "Fresh-root identity insert requires the active application command.",
      );
    inserted.add(row.id);
  }
}
