import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { parseCollectionRelationship, parseEntityAiDescriptor } from "@athyper/server-contract-metadata";

/** Surface authoring uses the same reference validator as runtime publication reads. */
export function compileEntityAi(graph: MetaEntityGraph) {
  const surfaces = (graph.surfaces ?? []).filter(surface => surface.status !== "deprecated");
  const authored = surfaces.filter(surface => surface.layoutConfig?.["ai"] !== undefined);
  if (authored.length > 1) throw new TypeError("Only one AI contract may be published per entity");
  if (!authored.length) return undefined;
  const fields = graph.fields.filter(field => field.status !== "deprecated");
  const profiles = new Set((graph.searchProfiles ?? []).filter(profile => profile.status !== "deprecated").map(profile => profile.id));
  const searchableIds = new Set((graph.searchFields ?? []).filter(binding => profiles.has(binding.entitySearchProfileId)).map(binding => binding.entityFieldId));
  const relationships = surfaces.filter(surface => surface.layoutConfig?.["collectionRelationship"] !== undefined);
  if (relationships.length > 1) throw new TypeError("Only one collection relationship may be published per entity");
  const relationship = relationships[0] ? parseCollectionRelationship(relationships[0].layoutConfig!["collectionRelationship"]) : undefined;
  return parseEntityAiDescriptor(authored[0]!.layoutConfig!["ai"], {
    entityCode: String(graph.entity.entityCode),
    fields: fields.map(field => ({ key: String(field.fieldKey), searchable: field.id !== undefined && searchableIds.has(field.id), reference: field.dataType === "reference" })),
    operationKeys: graph.operations.filter(operation => operation.status !== "deprecated").map(operation => String(operation.operationKey)),
    ...(relationship ? { collectionSourceRef: relationship.sourceRef } : {}),
  });
}
