import {sql,type Kysely} from "kysely";
import type {MetaEntityGraph} from "@athyper/server-contract-meta-entity-authoring";
import {AuthoringPolicyError} from "@athyper/server-contract-meta-entity-authoring";
function required<T>(value:T|undefined):T {if (!value) throw new AuthoringPolicyError("RELATION_SOURCE_DRAFT_UNAVAILABLE", "RELATION_SOURCE_DRAFT_UNAVAILABLE");return value;}
/** Target names are derived from existing metadata identities, never stored twice. */
export async function bindCanonicalRelationTargets(db: Kysely<Record<string, never>>, changeSetId: string, graph: MetaEntityGraph): Promise<MetaEntityGraph> {
  if (!graph.relationTargets?.length) return graph;
  const owner = required((await sql<{tenant_id:string|null;entity_id:string}>`SELECT tenant_id,entity_id FROM metadata.entity_change_set WHERE id=${changeSetId}::uuid`.execute(db)).rows[0]);
  const targets = [];
  for (const target of graph.relationTargets) {
    const entity = (await sql<{entity_code:string;tenant_id:string|null}>`SELECT entity_code,tenant_id FROM metadata.entity WHERE id=${target.targetEntityId}::uuid AND status IN ('draft','active')`.execute(db)).rows[0];
    if (!entity || (entity.tenant_id !== null && entity.tenant_id !== owner.tenant_id)
      || (owner.tenant_id === null && entity.tenant_id !== null)
      || (target.targetEntityCode !== undefined && target.targetEntityCode !== entity.entity_code))
      throw new AuthoringPolicyError('RELATION_TARGET_IDENTITY_UNAVAILABLE', 'RELATION_TARGET_IDENTITY_UNAVAILABLE');
    const relation = graph.relations?.find(r=>r.id===target.entityRelationId);
    const mapping = graph.relationFields?.filter(f=>f.entityRelationTargetId===target.id) ?? [];
    let keyFields: {field_key:string;data_type:string;position:number}[];
    if (target.targetEntityId === owner.entity_id) {
      const key = graph.keys?.find(k=>k.keyKey===target.targetKeyKey && k.status!=='deprecated');
      keyFields = key ? (graph.keyFields ?? []).filter(k=>k.entityKeyId===key.id).map(k=>{
        const f=graph.fields.find(f=>f.id===k.entityFieldId);
        return {field_key:f?.fieldKey ?? '',data_type:f?.dataType ?? '',position:k.position};
      }) : [];
    } else {
      keyFields = (await sql<{field_key:string;data_type:string;position:number}>`SELECT f.field_key,f.data_type,kf.position FROM metadata.entity_key k
        JOIN metadata.entity_key_field kf ON kf.entity_key_id=k.id AND kf.change_set_id=k.change_set_id
        JOIN metadata.entity_field f ON f.id=kf.entity_field_id AND f.change_set_id=k.change_set_id
        JOIN metadata.entity_release r ON r.entity_id=k.entity_id AND r.change_set_id=k.change_set_id
        WHERE k.entity_id=${target.targetEntityId}::uuid AND k.key_key=${target.targetKeyKey} AND k.status='active' AND f.status='active' AND f.value_origin='stored'
          AND r.release_kind='publish' AND r.release_no=(SELECT max(r2.release_no) FROM metadata.entity_release r2 WHERE r2.entity_id=r.entity_id AND r2.release_kind='publish')
        ORDER BY kf.position`.execute(db)).rows;
    }
    const self = target.targetEntityId === owner.entity_id;
    const targetFields = self
      ? graph.fields.filter(f => f.status !== 'deprecated' && f.valueOrigin === 'stored').map(f => ({field_key:f.fieldKey,data_type:f.dataType}))
      : (await sql<{field_key:string;data_type:string}>`SELECT f.field_key,f.data_type FROM metadata.entity_field f
          JOIN metadata.entity_release r ON r.entity_id=f.entity_id AND r.change_set_id=f.change_set_id
          WHERE f.entity_id=${target.targetEntityId}::uuid AND f.status='active' AND f.value_origin='stored'
            AND r.release_kind='publish' AND r.release_no=(SELECT max(r2.release_no) FROM metadata.entity_release r2 WHERE r2.entity_id=r.entity_id AND r2.release_kind='publish')`.execute(db)).rows;
    const targetTenant = self ? graph.runtimeProfiles?.[0]?.tenantFieldKey
      : (await sql<{tenant_field_key:string|null}>`SELECT p.tenant_field_key FROM metadata.entity_runtime_profile p
          JOIN metadata.entity_release r ON r.entity_id=p.entity_id AND r.change_set_id=p.change_set_id
          WHERE p.entity_id=${target.targetEntityId}::uuid AND r.release_kind='publish'
            AND r.release_no=(SELECT max(r2.release_no) FROM metadata.entity_release r2 WHERE r2.entity_id=r.entity_id AND r2.release_kind='publish')`.execute(db)).rows[0]?.tenant_field_key;
    for (const field of graph.fields) {
      const presentation = field.typeConfig?.relationReference as {relationKey?:string;labelField?:string} | undefined;
      if (presentation?.relationKey !== relation?.relationKey) continue;
      const label = targetFields.find(f => f.field_key === presentation?.labelField);
      if (!label || label.data_type === 'uuid')
        throw new AuthoringPolicyError('RELATION_LABEL_FIELD_INVALID', 'Select a stored readable label field on the declared target');
    }
    const sourceTenant = graph.runtimeProfiles?.[0]?.tenantFieldKey;
    if (targetTenant && (!sourceTenant || !mapping.some(m => m.targetFieldKey === targetTenant
      && graph.fields.find(f => f.id === m.sourceFieldId)?.fieldKey === sourceTenant)))
      throw new AuthoringPolicyError('RELATION_TENANT_MAPPING_REQUIRED', 'RELATION_TENANT_MAPPING_REQUIRED');
    if (!relation || !keyFields.length || !mapping.length || mapping.some(m=>{
      const source=graph.fields.find(f=>f.id===m.sourceFieldId), destination=targetFields.find(f=>f.field_key===m.targetFieldKey);
      return !source || !destination || source.dataType!==destination.data_type;
    }) || (relation.relationKind!=='one_to_many' && (keyFields.some(k=>!mapping.some(m=>m.targetFieldKey===k.field_key)) || mapping.some(m=>m.targetFieldKey!==targetTenant && !keyFields.some(k=>k.field_key===m.targetFieldKey)))))
      throw new AuthoringPolicyError('RELATION_TARGET_KEY_MAPPING_INVALID', 'RELATION_TARGET_KEY_MAPPING_INVALID');
    targets.push({...target,targetEntityCode:entity.entity_code});
  }
  return {...graph,relationTargets:targets};
}
