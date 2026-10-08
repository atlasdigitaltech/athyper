import type { ComponentQualifier } from "../shared/publication/component-qualification.js";
import { sql, type Kysely } from "kysely";
import {
  parseEntityAuthoringResource,
  type EntityAuthoringResourceSource,
  type PublicationCanonicalizer,
} from "@athyper/server-contract-publication";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import {
  compileNativeLiveReadResources,
  validateLegacyFieldIdentityPlan,
} from "@athyper/server-plane-studio-meta-entity-authoring";
export function createResourceSourceQualification(
  descriptorHash: string,
  canonical: PublicationCanonicalizer,
  componentQualifier?: ComponentQualifier,
  /** Trusted source reader: load the exact saved graph and independently
   * resolved compiler/provider/catalogue inputs in this transaction. Never
   * derive these from the submitted resource payload. */
  nativeLiveReadSource?: (
    tx: Kysely<Record<string, never>>,
    source: EntityAuthoringResourceSource,
  ) => Promise<Parameters<typeof compileNativeLiveReadResources>[0]>,
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
    if (payload.schema === "entity.ui-component-resource/1") {
      if (!componentQualifier)
        throw Error("RESOURCE_COMPONENT_QUALIFICATION_REQUIRED");
      await componentQualifier(payload);
      return;
    }
    if (payload.schema === "entity.installed-live-read-resource/1") {
      if (!nativeLiveReadSource)
        throw Error("RESOURCE_LIVE_READ_QUALIFICATION_REQUIRED");
      const inputs = await nativeLiveReadSource(tx, structuredClone(source));
      if (inputs.compiler.authoringSchemaHash !== descriptorHash)
        throw Error("RESOURCE_DESCRIPTOR_CHANGED");
      const candidates = compileNativeLiveReadResources(inputs);
      const expected =
        source.kind === "entity_security_manifest"
          ? candidates.security
          : candidates.storage;
      if (
        canonical.sha256(canonical.canonicalBytes(payload)) !==
        canonical.sha256(canonical.canonicalBytes(expected))
      )
        throw Error("RESOURCE_LIVE_READ_SOURCE_CHANGED");
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
