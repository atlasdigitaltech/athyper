import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";

/** A required parent and its immutable owner mapping must be in the same
 * reviewed release. Runtime still rechecks the current parent and record. */
export function validateRequiredParentContracts(
  descriptors: readonly EntityRuntimeDescriptor[],
): void {
  for (const child of descriptors) {
    const required = child.directoryScope?.parent;
    if (!required) continue;
    const parents = descriptors.filter(parent => parent.entityCode === required.entityCode && parent.planeKey === child.planeKey);
    if (parents.length !== 1 || parents[0]!.directoryScope?.parent)
      throw new Error(`COMPILED_ENTITY_PARENT_CONTRACT_REQUIRED:${child.entityCode}`);
    const parent = parents[0]!;
    const relations = parent.recordPresentation?.entityRelationships?.filter(relation => relation.key === required.relationshipKey) ?? [];
    if (relations.length !== 1 || relations[0]!.targetEntity !== child.entityCode)
      throw new Error(`COMPILED_ENTITY_PARENT_RELATIONSHIP_REQUIRED:${child.entityCode}`);
    const relation = relations[0]!;
    if (!parent.operations.read || !child.operations.read || !child.operations[relation.readOperation] ||
        !parent.storage.tenantField || !child.storage.tenantField ||
        relation.tenant.source !== parent.storage.tenantField || relation.tenant.target !== child.storage.tenantField ||
        !relation.fields.length || !relation.fields.some(mapping => mapping.source === parent.storage.idField))
      throw new Error(`COMPILED_ENTITY_PARENT_OWNER_MAPPING_REQUIRED:${child.entityCode}`);
    for (const mapping of [relation.tenant, ...relation.fields]) {
      const source = parent.fields.find(field => field.key === mapping.source);
      const target = child.fields.find(field => field.key === mapping.target);
      if (!source || !target || source.type !== target.type || !source.required || !target.required ||
          source.writableOn.length || target.writableOn.length ||
          ((mapping === relation.tenant || mapping.source === parent.storage.idField) && source.type !== "uuid"))
        throw new Error(`COMPILED_ENTITY_PARENT_FIELD_MAPPING_INVALID:${child.entityCode}:${mapping.target}`);
    }
    const title = parent.fields.find(field => field.key === parent.recordPresentation?.titleField);
    if (!title || title.type !== "string")
      throw new Error(`COMPILED_ENTITY_PARENT_TITLE_REQUIRED:${child.entityCode}`);
  }
}
