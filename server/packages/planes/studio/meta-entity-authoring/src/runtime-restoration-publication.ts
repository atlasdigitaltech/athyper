import { sql, type Kysely } from "kysely";
import {
  AuthoringPolicyError,
  type SignedMetaEntityArtifact,
} from "@athyper/server-contract-meta-entity-authoring";
import { compileRuntimeRestoration } from "./runtime-restoration.js";
export async function prepareRuntimeRestorationRelease(
  database: Kysely<Record<string, never>>,
  input: {
    releaseId: string;
    artifact: SignedMetaEntityArtifact;
    targetPlanes: readonly string[];
  },
  emptyTarget: (expected: {
    tenantId: string;
    actorId: string;
    entityCode: string;
    publicationKey: string;
  }) => Promise<boolean>,
): Promise<boolean> {
  const restored = compileRuntimeRestoration(input.artifact.descriptor);
  if (!restored) return false;
  if (input.targetPlanes.length !== 1 || input.targetPlanes[0] !== "neon")
    throw new AuthoringPolicyError(
      "RESTORATION_TARGET_MISMATCH",
      "Restoration requires its exact target",
    );
  const row = (
    await sql<{
      tenant_id: string;
      published_by: string;
    }>`SELECT tenant_id,published_by FROM metadata.entity_release WHERE id=${input.releaseId}::uuid`.execute(
      database,
    )
  ).rows[0];
  if (
    !row ||
    row.tenant_id !== restored.tenantId ||
    !(await emptyTarget({
      tenantId: row.tenant_id,
      actorId: row.published_by,
      entityCode: restored.descriptor.entityCode,
      publicationKey: restored.publicationKey,
    }))
  )
    throw new AuthoringPolicyError(
      "RESTORATION_EMPTY_TARGET_REQUIRED",
      "The target must be empty and support restoration preconditions",
    );
  await sql`SELECT publication.fn_prepare_runtime_restoration(${input.releaseId}::uuid)`.execute(
    database,
  );
  return true;
}
