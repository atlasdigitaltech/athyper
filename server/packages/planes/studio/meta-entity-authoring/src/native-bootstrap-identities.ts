import { sql, type Transaction } from "kysely";
import {
  AuthoringPolicyError,
  referenceUuid,
  validateFoundationNode,
  type ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import type { NativeReleaseCompilationContext } from "./native-release-compilation.js";
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
