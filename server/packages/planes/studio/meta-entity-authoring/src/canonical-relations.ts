import type { MetaEntityGraph } from '@athyper/server-contract-meta-entity-authoring';

/** Structural authoring is normalized; presentation selects a relation and labels.
 * Derived runtime mappings remain compatible with the existing authorized readers. */
export function deriveCanonicalRelations(graph: MetaEntityGraph, validateAll = false): MetaEntityGraph {
  const copy = structuredClone(graph);
  const resolve = (key: unknown) => {
    if (typeof key !== 'string') throw Error('RELATION_KEY_REQUIRED');
    const matches = (graph.relations ?? []).filter(r => r.relationKey === key && r.status !== 'deprecated');
    if (matches.length !== 1 || !matches[0]!.id) throw Error('RELATION_DECLARATION_REQUIRED');
    const relation = matches[0]!;
    if (!['one_to_one', 'many_to_one', 'one_to_many'].includes(relation.relationKind)
      || !['foreign_key', 'logical'].includes(relation.resolutionKind)
      || (relation.mutationMode !== undefined && relation.mutationMode !== 'read_only'))
      throw Error('RELATION_READ_CONTRACT_UNSUPPORTED');
    const targets = (graph.relationTargets ?? []).filter(t => t.entityRelationId === relation.id);
    if (targets.length !== 1 || !targets[0]!.id || !targets[0]!.targetEntityCode || !targets[0]!.targetKeyKey)
      throw Error('RELATION_TARGET_REQUIRED');
    const target = targets[0]!;
    const mappings = (graph.relationFields ?? []).filter(f => f.entityRelationTargetId === target.id).sort((a,b) => a.position-b.position);
    if (!mappings.length || mappings.some((f,i) => f.position !== i+1)
      || new Set(mappings.map(f=>f.sourceFieldId)).size !== mappings.length
      || new Set(mappings.map(f=>f.targetFieldKey)).size !== mappings.length)
      throw Error('RELATION_FIELD_MAPPING_INVALID');
    const fields = mappings.map(mapping => {
      const field = graph.fields.find(f => f.id === mapping.sourceFieldId);
      if (!field || field.status === 'deprecated' || field.valueOrigin !== 'stored') throw Error('RELATION_SOURCE_FIELD_REQUIRED');
      return {source:field.fieldKey,target:mapping.targetFieldKey};
    });
    return {relation,target,fields};
  };
  if (validateAll) {
    for (const relation of graph.relations ?? []) if (relation.status !== "deprecated") resolve(relation.relationKey);
    if (graph.relationTargets?.some(t => !graph.relations?.some(r => r.id === t.entityRelationId))
      || graph.relationFields?.some(f => !graph.relationTargets?.some(t => t.id === f.entityRelationTargetId)))
      throw Error('RELATION_GRAPH_OWNER_REQUIRED');
  }
  const compiledFields = copy.fields.map(field => {
    const selected = field.typeConfig?.relationReference as {relationKey?:string;labelField?:string} | undefined;
    if (!selected) return field;
    if (field.typeConfig?.keyReference !== undefined) throw Error('RELATION_REFERENCE_DUPLICATE_STRUCTURE');
    if (Object.keys(selected).some(k=>!['relationKey','labelField'].includes(k))
      || typeof selected.labelField !== 'string' || !/^[a-z][a-z0-9_]*$/.test(selected.labelField))
      throw Error('RELATION_REFERENCE_PRESENTATION_INVALID');
    const {relation,target,fields} = resolve(selected.relationKey);
    if (!['one_to_one','many_to_one'].includes(relation.relationKind) || !fields.some(f=>f.source===field.fieldKey))
      throw Error('RELATION_REFERENCE_FIELD_MISMATCH');
    return {...field,typeConfig:{...field.typeConfig,keyReference:{targetEntity:target.targetEntityCode,labelField:selected.labelField,fields}}};
  });
  const compiledSurfaces = copy.surfaces?.map(surface => {
    const presentation = surface.layoutConfig?.recordPresentation as Record<string,any> | undefined;
    if (!presentation || !Array.isArray(presentation.entityRelationships)) return surface;
    const relationships = presentation.entityRelationships.map((entry:any) => {
      if (entry.relationKey === undefined) return entry; // Prior published representation, rejected on new saves.
      if (entry.targetEntity !== undefined || entry.fields !== undefined || entry.tenant !== undefined)
        throw Error('RELATION_PRESENTATION_DUPLICATE_STRUCTURE');
      const {relation,target,fields} = resolve(entry.relationKey);
      const expected = relation.relationKind === 'one_to_many' ? ['many'] : ['one','zero_or_one'];
      if (!expected.includes(entry.cardinality)) throw Error('RELATION_PRESENTATION_CARDINALITY_INVALID');
      const tenantField = graph.runtimeProfiles?.[0]?.tenantFieldKey;
      const tenant = tenantField ? fields.filter(f=>f.source===tenantField) : [];
      if (tenantField && tenant.length !== 1) throw Error('RELATION_TENANT_MAPPING_REQUIRED');
      // Existing record-relationship runtime requires explicit tenant scope.
      if (!tenantField) throw Error('RELATION_EMBEDDED_TENANT_CONTRACT_REQUIRED');
      const {relationKey:_key,...display} = entry;
      return {...display,targetEntity:target.targetEntityCode,fields:fields.filter(f=>f.source!==tenantField),
        tenant:{source:tenant[0]!.source,target:tenant[0]!.target}};
    });
    return {...surface,layoutConfig:{...surface.layoutConfig,recordPresentation:{...presentation,entityRelationships:relationships}}};
  });
  return {...copy,fields:compiledFields,...(compiledSurfaces ? {surfaces:compiledSurfaces} : {})};
}

/** Only authoring writes use this guard. Historical signed descriptors remain readable. */
export function assertCanonicalRelationAuthoring(graph: MetaEntityGraph): void {
  for (const binding of graph.fieldReferenceBindings ?? []) {
    if (!['lookup_domain','resolver'].includes(binding.referenceKind) || binding.targetEntityCode !== undefined
      || (binding.referenceKind === 'lookup_domain' ? !binding.lookupDomain || binding.resolverKey !== undefined : !binding.resolverKey || binding.lookupDomain !== undefined))
      throw Error('ENTITY_REFERENCE_MIGRATION_REQUIRED: field reference bindings support lookup_domain or resolver only');
  }
  if (graph.fields.some(f=>f.typeConfig?.keyReference !== undefined))
    throw Error('ENTITY_REFERENCE_MIGRATION_REQUIRED: use typeConfig.relationReference with relationKey and labelField');
  for (const surface of graph.surfaces ?? []) {
    const presentation = surface.layoutConfig?.recordPresentation as Record<string,any> | undefined;
    if (presentation?.entityRelationships?.some((r:any)=>r.relationKey===undefined || r.targetEntity!==undefined || r.fields!==undefined || r.tenant!==undefined))
      throw Error('ENTITY_RELATION_MIGRATION_REQUIRED: presentation must select relationKey without structural mappings');
  }
  deriveCanonicalRelations(graph, true);
}
