import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {compileSharedReferenceProduct,parseSharedReferenceProduct} from './authoring/product.js';
import {compileGraph,sha256,validateGraph} from './deterministic.js';
import {assertCanonicalRelationAuthoring,deriveCanonicalRelations} from './canonical-relations.js';
import type {MetaEntityGraph} from '@athyper/server-contract-meta-entity-authoring';
function fixture():MetaEntityGraph {
 const source=JSON.parse(readFileSync(new URL('../../../../../../metadata/entities/common/reference/state_region/definition.json',import.meta.url),'utf8'));
 const legacy=compileSharedReferenceProduct(parseSharedReferenceProduct(source),'studio').graph;
 const fields=legacy.fields.map(f=>{
   if (!f.typeConfig?.keyReference)return f;
   const {keyReference,...typeConfig}=f.typeConfig;
   return {...f,typeConfig:{...typeConfig,relationReference:{relationKey:f.fieldKey,labelField:'name'}}};
 });
 const refs=legacy.fields.filter(f=>f.typeConfig?.keyReference);
 return {...legacy,fields,fieldReferenceBindings:[],
 relations:refs.map((f,i)=>({id:'r'+i,relationKey:f.fieldKey,relationKind:'many_to_one',resolutionKind:'foreign_key',mutationMode:'read_only'})),
 relationTargets:refs.map((f,i)=>({id:'t'+i,entityRelationId:'r'+i,relationTargetKey:'default',targetEntityId:'11111111-1111-4111-8111-111111111111',targetEntityCode:(f.typeConfig!.keyReference as any).targetEntity,targetKeyKey:'code'})),
 relationFields:refs.flatMap((f,i)=>(f.typeConfig!.keyReference as any).fields.map((m:any,j:number)=>({entityRelationTargetId:'t'+i,sourceFieldId:fields.find(f=>f.fieldKey===m.source)!.id!,targetFieldKey:m.target,position:j+1}))) };
}
it('derives simple and composite references without altering the reviewed graph hash',()=>{
 const graph=fixture(),before=structuredClone(graph);
 assertCanonicalRelationAuthoring(graph);
 expect(validateGraph(graph).issues).toEqual([]);
 const compiled=compileGraph(graph);
 expect(compiled.contractHash).toBe(sha256(graph));expect(graph).toEqual(before);
 const fields=(compiled.descriptor.fields as any[]);
 expect(fields.find(f=>f.fieldKey==='country_code').typeConfig.keyReference).toEqual({targetEntity:'country',labelField:'name',fields:[{source:'country_code',target:'code'}]});
 expect(fields.find(f=>f.fieldKey==='parent_code').typeConfig.keyReference.fields).toEqual([{source:'country_code',target:'country_code'},{source:'parent_code',target:'code'}]);
 expect(compiled.descriptor.fieldReferenceBindings).toEqual([]);
});
it('uses relation metadata for generic parent surfaces while preserving tenant lock and optional cardinality',()=>{
 const g=fixture();
 const tenant={...g.fields[0]!,id:'tenant-field',fieldKey:'tenant_id',storagePath:'tenant_id',dataType:'uuid'};
 const owner={...tenant,id:'owner-field',fieldKey:'owner_id',storagePath:'owner_id'};
 const graph:MetaEntityGraph={...g,entity:{entityCode:'shipment',entityClass:'business',ownershipModel:'system'},fields:[...g.fields.filter(f=>!f.typeConfig?.relationReference),tenant,owner],
 runtimeProfiles:g.runtimeProfiles!.map(p=>({...p,tenantFieldKey:'tenant_id'})),
 relations:[{id:'r',relationKey:'settings',relationKind:'one_to_one',resolutionKind:'logical',mutationMode:'read_only'}],
 relationTargets:[{id:'t',entityRelationId:'r',relationTargetKey:'default',targetEntityId:'target-id',targetEntityCode:'shipment_preferences',targetKeyKey:'natural'}],
 relationFields:[{entityRelationTargetId:'t',sourceFieldId:'owner-field',targetFieldKey:'owner_id',position:1},{entityRelationTargetId:'t',sourceFieldId:'tenant-field',targetFieldKey:'tenant_id',position:2}],
 surfaces:[{surfaceKey:'detail',surfaceKind:'detail',title:'Details',layoutKind:'stack',layoutConfig:{recordPresentation:{entityRelationships:[{key:'settings',relationKey:'settings',cardinality:'zero_or_one',readOperation:'list'}]}}}]};
 expect((deriveCanonicalRelations(graph).surfaces![0]!.layoutConfig!.recordPresentation as any).entityRelationships[0]).toEqual({key:'settings',targetEntity:'shipment_preferences',cardinality:'zero_or_one',readOperation:'list',fields:[{source:'owner_id',target:'owner_id'}],tenant:{source:'tenant_id',target:'tenant_id'}});
 expect(()=>deriveCanonicalRelations({...graph,relationFields:graph.relationFields!.slice(0,1)})).toThrow('TENANT_MAPPING_REQUIRED');
});
it('rejects duplicate authoring, missing targets, ambiguous mappings and unsupported relation execution',()=>{
 const g=fixture();
 const old=structuredClone(g);old.fieldReferenceBindings=[{entityFieldId:g.fields[0]!.id!,bindingKey:'duplicate',referenceKind:'entity_relation',targetEntityCode:'country'}];
 expect(()=>assertCanonicalRelationAuthoring(old)).toThrow('MIGRATION_REQUIRED');
 const duplicate=structuredClone(g);(duplicate.fields.find(f=>f.fieldKey==='country_code')!.typeConfig as any).keyReference={};
 expect(()=>assertCanonicalRelationAuthoring(duplicate)).toThrow('MIGRATION_REQUIRED');
 expect(()=>deriveCanonicalRelations({...g,relationTargets:[]})).toThrow('TARGET_REQUIRED');
 expect(()=>deriveCanonicalRelations({...g,relationFields:[...g.relationFields!,g.relationFields![0]!]})).toThrow('FIELD_MAPPING_INVALID');
 expect(()=>deriveCanonicalRelations({...g,relations:g.relations!.map(r=>({...r,mutationMode:'coordinated'}))})).toThrow('READ_CONTRACT_UNSUPPORTED');
});
it('allows lookup and resolver bindings, but refuses mixed targets',()=>{
 const g=fixture();
 const binding={bindingKey:'lookup',entityFieldId:g.fields[0]!.id!,referenceKind:'lookup_domain' as const,lookupDomain:'status'};
 expect(()=>assertCanonicalRelationAuthoring({...g,fieldReferenceBindings:[binding]})).not.toThrow();
 expect(()=>assertCanonicalRelationAuthoring({...g,fieldReferenceBindings:[{...binding,targetEntityCode:'country'}]})).toThrow('MIGRATION_REQUIRED');
});
