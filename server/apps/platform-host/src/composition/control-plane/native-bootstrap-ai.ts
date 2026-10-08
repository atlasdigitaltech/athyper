import type { ExpandedNativeMetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { entityAiPresentationCapability } from "@athyper/server-contract-metadata";
import { resolveAtlasEntityToolManifest } from "@athyper/server-platform-ai";
import {
  compileNativeAi,
  sha256,
  type NativeAiContext,
  type NativeAuthorizationContext,
} from "@athyper/server-plane-studio-meta-entity-authoring";

/** Preserve the complete authored AI declaration using the publication manifest
 * resolver shared with the tool factories. Content compatibility is not execution
 * admission, deployment readiness or authority to read a record. */
export function resolveNativeBootstrapAi(
  graph: ExpandedNativeMetaEntityGraph,
  authorization: NativeAuthorizationContext,
): NativeAiContext | null {
  const fail = (): never => {
    throw Error("PRODUCT_NATIVE_AI_BINDING_UNSUPPORTED");
  };
  const ai = graph.ai;
  if (
    !ai ||
    Object.values(ai).every((rows) => Array.isArray(rows) && rows.length === 0)
  )
    return null;
  if (
    ai.profile.length !== 1 ||
    authorization.entityCode !== graph.entity.entityCode ||
    authorization.changeSetId !== graph.ownedLabels?.changeSetId ||
    authorization.plane !== "studio"
  )
    fail();
  const fields = graph.fields.map((field) => {
    const matches = authorization.fields.filter((f) => f.id === field.id);
    const access =
      graph.referenceMembers?.members.fieldAccess.filter(
        (f) =>
          f.entityFieldId === field.id && f.targetPlane === authorization.plane,
      ) ?? [];
    if (matches.length !== 1 || access.length !== 1) fail();
    return {
      id: field.id,
      key: matches[0]!.key,
      uuid: field.dataType === "uuid",
      representation: access[0]!.representation,
    };
  });
  const profile = ai.profile[0]!;
  let searchProfile: NativeAiContext["searchProfile"] = null;
  if (profile.searchProfileId !== null) {
    const matches = (graph.searchProfiles ?? []).filter(
      (p) => p.id === profile.searchProfileId && p.status !== "deprecated",
    );
    if (matches.length !== 1) fail();
    const members = (graph.searchFields ?? [])
      .filter((f) => f.entitySearchProfileId === profile.searchProfileId)
      .sort((a, b) => a.position - b.position);
    if (
      !members.length ||
      new Set(members.map((f) => f.entityFieldId)).size !== members.length ||
      members.some(
        (f, i) =>
          f.position !== i + 1 ||
          !fields.some((known) => known.id === f.entityFieldId),
      )
    )
      fail();
    searchProfile = {
      id: profile.searchProfileId,
      fields: members.map((f) => f.entityFieldId),
    };
  }
  const relationships = ai.reference.map((reference) => {
    const field = graph.fields.find((f) => f.id === reference.sourceFieldId);
    const relation = (graph.relations ?? []).filter(
      (r) => r.id === reference.relationId && r.status !== "deprecated",
    );
    const targets = (graph.relationTargets ?? []).filter(
      (t) => t.entityRelationId === reference.relationId,
    );
    if (
      reference.referenceKind !== "entity_relation" ||
      !field ||
      field.relationId !== reference.relationId ||
      relation.length !== 1 ||
      targets.length !== 1 ||
      !(graph.relationFields ?? []).some(
        (f) =>
          f.entityRelationTargetId === targets[0]!.id &&
          f.sourceFieldId === field.id,
      )
    )
      fail();
    const key = fields.find((f) => f.id === reference.sourceFieldId)?.key;
    if (!key) return fail();
    return {
      key,
      relationId: relation[0]!.id!,
      sourceFieldId: reference.sourceFieldId!,
    };
  });
  const resources: NativeAiContext["resources"] = ai.binding.map((binding) => {
    if (binding.bindingKind === "insight_provider") {
      const identity = resolveAtlasEntityToolManifest(
        binding.contractKey,
        String(binding.contractVersion),
        authorization.plane,
      );
      return {
        kind: binding.bindingKind,
        owner: "shared.entity-tools",
        key: binding.contractKey,
        version: binding.contractVersion,
        hash: identity.manifestHash,
      };
    }
    const declaration = entityAiPresentationCapability(
      binding.bindingKind,
      binding.contractKey,
      binding.contractVersion,
    );
    if (!declaration) return fail();
    return {
      kind: binding.bindingKind,
      owner: "shared.entity-ai-contract",
      key: binding.contractKey,
      version: binding.contractVersion,
      hash: sha256(declaration),
    };
  });
  const context: NativeAiContext = {
    reference: {
      entityCode: graph.entity.entityCode,
      planeKey: authorization.plane,
      fields: fields.map((f) => ({
        key: f.key,
        searchable: searchProfile?.fields.includes(f.id) ?? false,
        reference: relationships.some((r) => r.sourceFieldId === f.id),
      })),
      operationKeys: graph.operations.map((o) => o.operationKey),
    },
    maximumMembers: authorization.maximumMembers,
    fields,
    operations: graph.operations.map((o) => ({
      id: o.id,
      key: o.operationKey,
    })),
    searchProfile,
    relationships,
    resources,
  };
  compileNativeAi(ai, context);
  return context;
}
