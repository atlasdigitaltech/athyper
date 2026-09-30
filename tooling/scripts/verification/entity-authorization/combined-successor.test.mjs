import {test} from 'node:test';
import assert from 'node:assert/strict';
import {combineBusinessPartnerSuccessor,combinedHash} from './combined-successor.mjs';
function fixture(){
 const base={schema:'athyper.entity-runtime-descriptor/1.0',entityCode:'business_partner',planeKey:'neon',fields:[{key:'name',writableOn:['patch']}],storage:{table:'bp'},operations:{read:{permissionCode:'old'}},listPresentation:{title:'Partners'},operation_scope_bindings:[{old:true}]};
 const baseline={sourceReleaseId:'baseline',sourceReleaseNo:17,source:{descriptor:{compiled_json:base}}};baseline.contentHash=combinedHash(baseline.source);
 const source={schemaVersion:1,kind:'bp_combined_successor_source',source:{status:'approved',release_no:18,publication_release_id:'126721f6-a2e5-45e2-91bf-0d6a1b660c56',approved_by:'reviewer',created_by:'author',tenant_id:'tenant',release_key:'bp',baseline,descriptor:{...structuredClone(base),ai:{enabled:true,insightProviders:[{id:'preserve_me'}]}},authored_contract:{operations:[]}}};
 const {operation_scope_bindings,...target}=structuredClone(base);
 const selection={activationAuthorized:false,grantChanges:[],selectionSha256:'selection',base:{tenantId:'tenant',publicationKey:'bp',releaseId:'baseline',releaseNo:17},descriptor:{...target,fields:[{key:'name',writableOn:[]}],operations:{read:{permissionCode:'target'}},authorization:{policy:'reviewed'},authorizationRuntime:{version:1}}};
 return{source,selection};
}
test('preserves Atlas and storage while applying reviewed authorization and discarding old scope identities',()=>{
 const f=fixture(),before=structuredClone(f);const result=combineBusinessPartnerSuccessor(f.source,f.selection);
 assert.deepEqual(result.descriptor.ai,f.source.source.descriptor.ai);assert.deepEqual(result.descriptor.storage,f.source.source.descriptor.storage);
 assert.deepEqual(result.descriptor.operation_scope_bindings,[]);assert.deepEqual(result.descriptor.fields[0].writableOn,[]);
 assert.deepEqual(f,before);assert.equal(result.publicationEligible,false);assert.deepEqual(result.grantChanges,[]);
});
test('rejects simultaneous conflicting edits to predecessor fields',()=>{
 const f=fixture();f.source.source.descriptor.fields[0].type='new-type';
 assert.throws(()=>combineBusinessPartnerSuccessor(f.source,f.selection),/PREDECESSOR_CONFLICT/);
});
test('rejects storage or AI mutations hidden in the authorization selection',()=>{
 for(const key of ['storage','ai']){const f=fixture();f.selection.descriptor[key]={changed:true};assert.throws(()=>combineBusinessPartnerSuccessor(f.source,f.selection),/UNREVIEWED_DELTA/);}
});
test('requires exact baseline and independent approved predecessor',()=>{
 const f=fixture();f.selection.base.releaseNo=16;assert.throws(()=>combineBusinessPartnerSuccessor(f.source,f.selection),/BASE_MISMATCH/);
 const g=fixture();g.source.source.approved_by=g.source.source.created_by;assert.throws(()=>combineBusinessPartnerSuccessor(g.source,g.selection),/APPROVED_PREDECESSOR_REQUIRED/);
});
