import { sql, type Kysely } from "kysely";
import {
  parseEntityAuthoringResource,
  type EntityAuthoringResourceSource,
  type PublicationCanonicalizer,
} from "@athyper/server-contract-publication";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { validateLegacyFieldIdentityPlan } from "@athyper/server-plane-studio-meta-entity-authoring";
export function createResourceSourceQualification(
  descriptorHash: string,
  canonical: PublicationCanonicalizer,
) {
  if (!/^[a-f0-9]{64}$/.test(descriptorHash))
    throw Error("RESOURCE_DESCRIPTOR_HASH_REQUIRED");
  return async (
    tx: Kysely<Record<string, never>>,
    source: EntityAuthoringResourceSource,
  ) => {
    const payload = parseEntityAuthoringResource(source.kind, source.payload);
    if (payload.schema === "entity.installed-authoring-descriptor/1") {
      if (
        payload.descriptorHash !== descriptorHash ||
        canonical.sha256(canonical.canonicalBytes(payload.descriptor)) !==
          descriptorHash
      )
        throw Error("RESOURCE_DESCRIPTOR_CHANGED");
      return;
    }
    if (payload.authoringSchemaHash !== descriptorHash)
      throw Error("RESOURCE_DESCRIPTOR_CHANGED");
    const current = (
      await sql<{
        graph: MetaEntityGraph;
        graphHash: string;
      }>`SELECT * FROM publication.read_authoring_resource_current_source(${payload.changeSetId}::uuid,${payload.entityId}::uuid)`.execute(
        tx,
      )
    ).rows;
    if (
      current.length !== 1 ||
      canonical.sha256(canonical.canonicalBytes(current[0]!.graph)) !==
        current[0]!.graphHash ||
      current[0]!.graphHash !== payload.sourceHash
    )
      throw Error("RESOURCE_IDENTITY_SOURCE_CHANGED");
    const graph = current[0]!.graph;
    const releases = (
      await sql<{
        releaseId: string;
        graph: MetaEntityGraph;
        integrity: boolean;
      }>`SELECT * FROM publication.read_authoring_resource_history(${payload.changeSetId}::uuid,${payload.entityId}::uuid)`.execute(
        tx,
      )
    ).rows;
    if (
      releases.length > 1000 ||
      releases.some((r) => !r.integrity) ||
      canonical.canonicalBytes(releases).length > 4194304
    )
      throw Error("RESOURCE_IDENTITY_HISTORY_INVALID");
    const plan = validateLegacyFieldIdentityPlan(graph, releases, {
      currentSourceHash: payload.sourceHash,
      releases: payload.releases,
    });
    if (
      plan.planHash !== payload.reviewedPlanHash ||
      plan.findings.some((f) => f.compatibility === "unknown")
    )
      throw Error("RESOURCE_IDENTITY_PLAN_CHANGED");
  };
}
