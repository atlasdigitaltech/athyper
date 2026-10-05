import {Kysely,PostgresDialect} from 'kysely';
import {expect,it,vi} from 'vitest';
import type {MetaEntityGraph} from '@athyper/server-contract-meta-entity-authoring';
import {bindCanonicalRelationTargets} from './canonical-relation-targets.js';
function graph(kind='many_to_one'):MetaEntityGraph {
 return {contractSchema:'athyper.meta-entity-contract/2.1',entity:{entityCode:'source'},fields:[{id:'f',fieldKey:'code',dataType:'text',valueOrigin:'stored'}],operations:[],
 relations:[{id:'r',relationKey:'reference',relationKind:kind}],relationTargets:[{id:'t',entityRelationId:'r',targetEntityId:'target',targetKeyKey:'natural'}],relationFields:[{entityRelationTargetId:'t',sourceFieldId:'f',targetFieldKey:'code',position:1}]} as MetaEntityGraph;
}
function database(options:{tenant?:string|null;targetCode?:string;targetTenantField?:string;keyField?:string;type?:string}={}) {
 const query=vi.fn(async (statement:string)=>{
  if(statement.includes('FROM metadata.entity_change_set'))return {rows:[{tenant_id:null,entity_id:'source'}]};
  if(statement.includes('FROM metadata.entity WHERE'))return {rows:[{entity_code:options.targetCode??'target',tenant_id:options.tenant??null}]};
  if(statement.includes('FROM metadata.entity_key k'))return {rows:[{field_key:options.keyField??'code',data_type:options.type??'text',position:1}]};
  if(statement.includes('FROM metadata.entity_field f'))return {rows:[{field_key:'code',data_type:options.type??'text'}]};
  if(statement.includes('FROM metadata.entity_runtime_profile p'))return {rows:[{tenant_field_key:options.targetTenantField??null}]};
  throw Error('Unexpected query');
 });
 return new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool:{connect:async()=>({query,release(){}}),end:async()=>{}} as never})});
}
it('derives target codes and validates published composite/key types',async()=>{
 const db=database();try{
  const g=graph(); const result=await bindCanonicalRelationTargets(db,'draft',g);
  expect(result.relationTargets![0]!.targetEntityCode).toBe('target');expect(g.relationTargets![0]!.targetEntityCode).toBeUndefined();
 }finally{await db.destroy();}
});
it.each([
 [{tenant:'other'},'RELATION_TARGET_IDENTITY_UNAVAILABLE'],
 [{type:'uuid'},'RELATION_TARGET_KEY_MAPPING_INVALID'],
 [{keyField:'another'},'RELATION_TARGET_KEY_MAPPING_INVALID'],
 [{targetTenantField:'tenant_id'},'RELATION_TENANT_MAPPING_REQUIRED'],
] as const)('rejects inaccessible identities, incorrect keys and unlocked tenant scope: %j',async(options,code)=>{
 const db=database(options);try{await expect(bindCanonicalRelationTargets(db,'draft',graph())).rejects.toMatchObject({code});}finally{await db.destroy();}
});
it('allows child foreign-key mapping distinct from its declared record identity',async()=>{
 const db=database({keyField:'record_id'});try{
  await expect(bindCanonicalRelationTargets(db,'draft',graph('one_to_many'))).resolves.toMatchObject({relationTargets:[{targetEntityCode:'target'}]});
 }finally{await db.destroy();}
});
it('rejects caller supplied target-code mismatch',async()=>{
 const db=database();try{
  const g=graph();await expect(bindCanonicalRelationTargets(db,'draft',{...g,relationTargets:g.relationTargets!.map(t=>({...t,targetEntityCode:'spoofed'}))})).rejects.toMatchObject({code:'RELATION_TARGET_IDENTITY_UNAVAILABLE'});
 }finally{await db.destroy();}
});
