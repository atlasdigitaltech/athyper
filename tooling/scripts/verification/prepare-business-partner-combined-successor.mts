import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateGraph,compileGraph} from '../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js';
import {parseEntityRuntimeDescriptor} from '../../../server/packages/platform/metadata/src/descriptor-parser.js';
import {entityScopeResolvers} from '../../../server/packages/contracts/metadata/src/entity-authorization.js';
// @ts-expect-error Independently tested review merge.
import {combineBusinessPartnerSuccessor,combinedHash} from './entity-authorization/combined-successor.mjs';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const source=read('governance/policy/reports/business-partner-combined-source.dev.json');
const selected=read('governance/policy/reports/business-partner-import-release.dev.json');
const combined=combineBusinessPartnerSuccessor(source,selected);
const id=(key:string)=>{const h=createHash('sha256').update(`bp-combined:${combined.descriptorHash}:${key}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
const graph=structuredClone(source.source.authored_contract);
// Every authored row gets a new identity; predecessor rows remain immutable.
const ids=new Map<string,string>();for(const [branch,rows] of Object.entries(graph))if(Array.isArray(rows))for(const row of rows)if(row?.id)ids.set(row.id,id(`${branch}:${row.id}`));
for(const rows of Object.values(graph))if(Array.isArray(rows))for(const row of rows)for(const key of Object.keys(row))if(typeof row[key]==='string'&&ids.has(row[key]))row[key]=ids.get(row[key]);
const profile=combined.descriptor.authorization,runtime=combined.descriptor.authorizationRuntime;
graph.operations=profile.operations.map((op:any)=>({id:id('operation:'+op.key),operationKey:op.key,operationKind:op.key==='import'?'import':op.key==='export'?'export':op.effect==='read'?'read':'execute',label:op.key.replaceAll('_',' '),permissionCode:op.permissionCode,handlerKey:runtime.bindings.find((b:any)=>b.operation===op.key).handler,auditEventCode:`business_partner.${op.key}`,status:'active'}));
graph.operationPermissions=profile.operations.map((op:any)=>({id:id('permission:'+op.key),entityOperationId:id('operation:'+op.key),targetPlane:'neon',permissionCode:op.permissionCode,permissionKind:selected.permissionDefinitions.find((p:any)=>p.canonicalCode===op.permissionCode)?.permissionKind??'entity_operation',status:'active'}));
graph.operationScopeBindings=profile.operations.flatMap((op:any)=>{
 const keys=entityScopeResolvers[op.scope as keyof typeof entityScopeResolvers];
 return (keys.length?keys:['tenant']).map(key=>({id:id(`scope:${op.key}:${key}`),entityOperationId:id('operation:'+op.key),bindingKey:`${op.key}_${key.replace(/[A-Z]/g,c=>'_'+c.toLowerCase())}`,targetPlane:'neon',decisionMode:op.target==='collection'?'collection':'entity_resource',scopeKind:({tenant:'tenant',operatingOrganizationId:'operating_organization',companyCodeId:'company_code',workspaceId:'workspace',networkRelationshipId:'network_relationship'} as Record<string,string>)[key],coordinateSource:key==='tenant'?'tenant_context':'relation_resolver',...(key==='tenant'?{}:{resolverKey:op.scope}),missingValueBehavior:'deny',status:'active'}));
});
// The immutable baseline marker deliberately pins the combined descriptor. The
// existing AI-only materializer rejects it; no ordinary publish can silently
// discard the authorization successor while that materializer is upgraded.
const surface=graph.surfaces.find((s:any)=>s.layoutConfig?.baselineImport);
if(!surface)throw Error('COMBINED_NATIVE_BASELINE_MARKER_MISSING');
surface.surfaceKey='bp_combined_successor';surface.title='Business Partner: Atlas and entity authorization';
surface.description='Combined successor preserving approved Atlas release 18 and the reviewed 42-operation authorization selection. New exact review required; grants and activation remain separate.';
surface.layoutConfig={...surface.layoutConfig,ai:combined.descriptor.ai,authorization:profile,authorizationRuntime:runtime,baselineImport:{...surface.layoutConfig.baselineImport,descriptorHash:combined.descriptorHash},authorizationSuccessor:{schemaVersion:1,predecessor:combined.predecessor,authorizationSelectionSha256:combined.authorizationSelectionSha256,combinedDescriptorHash:combined.descriptorHash,preservedAtlasHash:combined.preservedAtlasHash,publicationEligible:false}};
graph.tests=[{key:'combined_atlas_preserved',assertion:'path_equals',path:'surfaces.0.layoutConfig.ai',expected:combined.descriptor.ai},{key:'combined_profile_pinned',assertion:'path_equals',path:'surfaces.0.layoutConfig.authorization',expected:profile},{key:'combined_runtime_pinned',assertion:'path_equals',path:'surfaces.0.layoutConfig.authorizationRuntime',expected:runtime}];
const report=validateGraph(graph);if(report.issues.length)throw Error(JSON.stringify(report.issues));
const compiled=compileGraph(graph);
parseEntityRuntimeDescriptor({entity_code:'business_partner',plane_code:'neon',release_id:source.source.entity_release_id,release_no:18,entity_contract_hash:selected.base.contractHash,compiled_hash:combined.descriptorHash,compiled_json:combined.descriptor});
combined.nativeGraphHash=combinedHash(graph);combined.nativeCompilerContractHash=compiled.contractHash;combined.nativeDraftDescriptorHash=compiled.descriptorHash;
combined.reviewRevision=combinedHash(combined);
writeFileSync('governance/policy/reports/business-partner-combined-successor.dev.json',JSON.stringify(combined,null,2)+'\n');
writeFileSync('governance/policy/reviews/business-partner-combined-native-graph.dev.json',JSON.stringify(graph,null,2)+'\n');
console.log({reviewRevision:combined.reviewRevision,operations:graph.operations.length,atlasPreserved:true,nativeGraphValidated:true,publicationEligible:false});
