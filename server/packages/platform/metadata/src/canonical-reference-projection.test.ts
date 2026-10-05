import {expect,it} from 'vitest';
import {compileNativeRuntimeProjection} from './native-runtime-projection.js';
function fixture() {
 const native:any={
  entity:{entityCode:'region'},
  fields:['code','country_code'].map(key=>({id:key,fieldKey:key,storagePath:key,dataType:'string',valueOrigin:'stored',writeMode:'read_only',typeConfig:{}})),
  operations:['list','read'].map(key=>({id:key,operationKey:key,operationKind:'read'})),
  operationScopeBindings:['list','read'].map(key=>({entityOperationId:key,targetPlane:'studio',scopeKind:'tenant'})),
  operationPermissions:[],fieldReferenceBindings:[],
  runtimeProfiles:[{storageSchema:'shared',storageObject:'region'}],
  authorization:{schemaVersion:1,entityCode:'region',planeKey:'studio',ownership:'tenant.record.v1',recordReadOperation:'read',directory:{operation:'list',population:'tenant'},
   fieldPolicies:[{key:'fields',fields:['code','country_code'],queryUses:[],readOperation:'read',representation:'plain',writeOperations:[]}],
   operations:['list','read'].map(key=>({key,effect:'read',target:key==='list'?'collection':'existing',scope:'tenant.record.v1',requiresParentRead:false,requiresPreflight:false})),relationships:[],surfaces:[]},
 };
 const field=native.fields.find((f:any)=>f.fieldKey==='country_code');
 field.typeConfig.keyReference={targetEntity:'country',labelField:'name',fields:[{source:'country_code',target:'code'}]};
 field.typeConfig.relationReference={relationKey:'country',labelField:'name'};
 native.fieldReferenceBindings=native.fieldReferenceBindings.filter((b:any)=>b.entityFieldId!==field.id);
 native.relations=[{id:'r',relationKey:'country',relationKind:'many_to_one',resolutionKind:'foreign_key',mutationMode:'read_only'}];
 native.relationTargets=[{id:'t',entityRelationId:'r',targetEntityCode:'country'}];
 native.relationFields=[{entityRelationTargetId:'t',sourceFieldId:field.id,targetFieldKey:'code',position:1}];
 const profile=native.runtimeProfiles[0];
 const project=()=>compileNativeRuntimeProjection({native,registration:{entityCode:native.entity.entityCode,plane:'studio',storage:{schema:profile.storageSchema,object:profile.storageObject,idField:'code'},columns:native.fields.map((f:any)=>f.storagePath)},permissions:[...new Set<string>(native.operationPermissions.map((p:any)=>p.permissionCode))].map(code=>({code,scopeKinds:[...new Set<string>(native.operationScopeBindings.map((s:any)=>s.scopeKind))]}))});
 return {native,field,project};
}
it('lowers a canonical reference through the existing native reader',()=>{
 const {project}=fixture();
 expect(project().fields.find(f=>f.key==='country_code')?.keyReference).toMatchObject({targetEntity:'country',labelField:'name',fields:[{source:'country_code',target:'code'}]});
});
it.each(['target','mapping','label','missing','duplicate'])('rejects derived reference disagreement: %s',kind=>{
 const {native,field,project}=fixture();
 if(kind==='target')native.relationTargets[0].targetEntityCode='other';
 if(kind==='mapping')native.relationFields[0].targetFieldKey='other';
 if(kind==='label')field.typeConfig.keyReference.labelField='other';
 if(kind==='missing')native.relationFields=[];
 if(kind==='duplicate')native.relationTargets.push({...native.relationTargets[0]});
 expect(project).toThrow('NATIVE_PROJECTION_REFERENCE_MAPPING_INVALID');
});
