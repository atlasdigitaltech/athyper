import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateGraph,compileGraph} from '../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js';
import type {MetaEntityGraph} from '../../../server/packages/contracts/meta-entity-authoring/src/index.js';
const plan=JSON.parse(readFileSync('docs/examples/atlas-f5/cirrus-initial-ai-publication-plan.json','utf8'));
const uuid=(key:string)=>{const h=createHash('sha256').update('cirrus-baseline-ai:'+key).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
const graph:MetaEntityGraph={contractSchema:'athyper.meta-entity-contract/2.1',entity:{entityCode:'business_partner',entityClass:'configuration',ownershipModel:'overlay'},
 runtimeProfiles:[{id:uuid('runtime'),profileKey:'default',backingKind:'virtual',apiExposure:'catalog_only',readMode:'none',writeMode:'none'}],
 fields:plan.descriptor.fields.map((f:any)=>({id:uuid('field.'+f.key),fieldKey:f.key,dataType:f.type,typeConfig:{kind:f.type,...(f.type==='enum'?{domain_code:f.key==='status'?'master.business_partner_status_d':'master.business_partner_category_d'}:{})},writeMode:'read_only',valueOrigin:'stored',storagePath:f.storagePath})),
 operations:[{id:uuid('read'),operationKey:'read',operationKind:'read',label:'Read imported Business Partner',permissionCode:plan.descriptor.operations.read.permissionCode,auditEventCode:'metadata.entity.read'}],
 searchProfiles:[{id:uuid('search'),searchKey:'default',searchKind:'keyword',minimumQueryLength:2,isDefault:true}],
 searchFields:plan.descriptor.fields.filter((f:any)=>f.searchable).map((f:any,i:number)=>({id:uuid('search.'+f.key),entitySearchProfileId:uuid('search'),entityFieldId:uuid('field.'+f.key),position:i+1,matchMode:'contains'})),
 surfaces:[{id:uuid('surface'),surfaceKey:'atlas_baseline_ai',surfaceKind:'detail',title:'AI enablement for imported Business Partner baseline',description:'AI-only derivative. Preserve imported Neon contract, descriptor, entity identity and publication key. This authoring graph is the review carrier; runtime storage and operations come from the immutable baseline.',layoutKind:'stack',layoutConfig:{ai:plan.descriptor.ai,baselineImport:plan.baselineImport}}],
 tests:[{key:'imported_source_bound',assertion:'path_equals',path:'surfaces.0.layoutConfig.baselineImport.contentHash',expected:plan.baselineImport.contentHash},{key:'reviewed_ai_enabled',assertion:'path_equals',path:'surfaces.0.layoutConfig.ai.enabled',expected:true},{key:'read_permission_preserved',assertion:'path_equals',path:'operations.0.permissionCode',expected:plan.descriptor.operations.read.permissionCode}]
};
const validation=validateGraph(graph);if(validation.issues.length)throw Error(JSON.stringify(validation.issues));compileGraph(graph);
writeFileSync('docs/examples/atlas-f5/cirrus-baseline-native-graph.json',JSON.stringify(graph,null,2)+'\n');console.log(JSON.stringify({valid:true,fields:graph.fields.length,sourceReleaseNo:plan.expectedSourceReleaseNo,changedRuntimeKeys:['ai']}));
