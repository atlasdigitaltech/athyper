import { sql, type Kysely } from "kysely";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { MetaEntityInspectionRelease } from "@athyper/server-contract-meta-entity-authoring";
type Db = Kysely<Record<string, never>>;
type Plane = "studio" | "neon" | "mesh";
export interface ActivationObservation {
  releaseId: string;
  contractHash: string;
  descriptorSourceHash: string;
  appliedReleaseId: string;
  descriptorHash: string;
  activatedAt: string;
}
export function classifyActivation(
  expected: MetaEntityInspectionRelease,
  observations: readonly ActivationObservation[],
) {
  if (!observations.length) return { state: "not_active" as const };
  if (observations.length !== 1)
    return {
      state: "unavailable" as const,
      reason: "Ambiguous active descriptor",
    };
  const current = observations[0]!;
  if (current.releaseId !== expected.id)
    return { state: "different_release" as const, ...current };
  if (
    current.contractHash !== expected.contractHash ||
    current.descriptorSourceHash !== expected.contractHash
  )
    return { state: "hash_mismatch" as const, ...current };
  return { state: "active" as const, ...current };
}
/** Called only after source-tenant lookup and explicit deployment-view authorization. */
export function createMetaEntityActivationInspector(
  run: <T>(
    plane: Plane,
    context: VerifiedRequestContext,
    work: (db: Db) => Promise<T>,
  ) => Promise<T>,
) {
  return async (
    context: VerifiedRequestContext,
    release: MetaEntityInspectionRelease,
  ) => {
    const source = await run(
      "studio",
      context,
      async (db) =>
        (
          await sql<{ publicationKey: string }>`
    SELECT COALESCE(p.release_key,'metadata.entity.'||e.entity_code) AS "publicationKey"
    FROM metadata.entity_release r JOIN metadata.entity e ON e.id=r.entity_id
    LEFT JOIN publication.release p ON p.id=r.id AND p.tenant_id=r.tenant_id
    WHERE r.id=${release.id}::uuid AND r.tenant_id=${context.tenantId}::uuid`.execute(
            db,
          )
        ).rows[0],
    );
    if (!source) throw Error("RELEASE_NOT_FOUND");
    const targets = await Promise.all(
      release.targetPlanes.map(async (plane) => {
        if (plane !== "studio" && plane !== "neon" && plane !== "mesh")
          return {
            plane,
            state: "unavailable",
            reason: "Unsupported target plane",
          };
        try {
          const observations = await run(
            plane,
            context,
            async (db) =>
              (
                await sql<ActivationObservation>`
        SELECT c.release_id::text AS "releaseId",c.entity_contract_hash AS "contractHash",
          d.source_contract_hash AS "descriptorSourceHash",d.compiled_hash AS "descriptorHash",
          a.id::text AS "appliedReleaseId",h.activated_at::text AS "activatedAt"
        FROM runtime_meta.release_activation_head h
        JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id AND a.status='active'
        JOIN runtime_meta.entity_contract c ON c.publication_key=h.publication_key AND c.release_id=a.source_release_id
        JOIN runtime_meta.entity_descriptor d ON d.entity_contract_id=c.id AND d.applied_release_id=a.id
        WHERE h.publication_key=${source.publicationKey} AND c.tenant_id=${context.tenantId}::uuid
          AND d.tenant_id=c.tenant_id AND d.plane_code=${plane} AND d.descriptor_kind='entity_runtime'
          AND d.status='active' AND c.status='published' AND c.entity_code=${release.entityCode}`.execute(
                  db,
                )
              ).rows,
          );
          return { plane, ...classifyActivation(release, observations) };
        } catch {
          return {
            plane,
            state: "unavailable",
            reason: "Target activation evidence could not be read",
          };
        }
      }),
    );
    return {
      releaseId: release.id,
      contractHash: release.contractHash,
      tenantId: context.tenantId,
      publicationKey: source.publicationKey,
      observedAt: new Date().toISOString(),
      targets,
    };
  };
}
