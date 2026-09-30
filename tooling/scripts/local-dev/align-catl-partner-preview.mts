/** Explicit CATL-only local preview repair. Preserves prior signed artifacts; no grants. */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {DurableGraphPreviewStore} from '../../../server/packages/planes/studio/meta-entity-authoring/src/durable-graph-preview.js';
import {parseEntityRuntimeDescriptor} from '../../../server/packages/platform/metadata/src/descriptor-parser.js';
const root=join(homedir(),'.athyper/instances/dev/workspace/preview');
const env={...process.env,ATHYPER_ENV:'local',ATHYPER_LOCAL_WORKSPACE:'1',ATHYPER_DOMAIN_SUFFIX:'dev.athyper.test'};
const store=new DurableGraphPreviewStore(join(root,'meta-entity.sqlite'),readFileSync(join(root,'public.pem'),'utf8'),env);
const coordinate={tenantId:'44444444-4444-4444-8444-444444444444',entityCode:'business_partner'};
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
try{
 const previous=store.read(coordinate);assert.ok(previous);
 const projections=structuredClone(previous.projections) as any;
 const descriptor=projections.neon.descriptor;
 const collaboration=process.argv.includes('--collaboration');
 const identity=process.argv.includes('--person-identity');
 if(!identity&&descriptor.operations.read.permissionCode==='neon.relationship.business_partner.read'&&descriptor.storage.object==='business_partner_identity_current'&&(!collaboration||(descriptor.operations.comments_read.permissionCode==='neon.collaboration.comment.read'&&descriptor.operations.attachments_read.permissionCode==='neon.collaboration.attachment.read'))){
  console.log(JSON.stringify({alreadyAligned:true,revision:previous.revision,grantsChanged:false}));
 }else{
 const mapping:Record<string,string>={};
 for(const row of descriptor.authorizationRuntime.canonicalReadAdmission?.transitions??[]){
  // Legacy unqualified collaboration aliases are not restored or broadened.
  if(row.sourcePermissionCode.startsWith('neon.'))mapping[row.targetPermissionCode]=row.sourcePermissionCode;
 }
 Object.assign(mapping,{
  'neon.relationship.bp_target.read':'neon.relationship.business_partner.read',
  'neon.relationship.bp_target.enter':'neon.relationship.business_partner.read',
  'neon.relationship.bp_target.network_read':'neon.relationship.bp_target.network_read',
 });
 if(collaboration)Object.assign(mapping,{
  'neon.relationship.bp_target.comments_read':'neon.collaboration.comment.read',
  'neon.relationship.bp_target.attachments_read':'neon.collaboration.attachment.read',
  'collaboration.comment.read':'neon.collaboration.comment.read',
  'document.attachment.read':'neon.collaboration.attachment.read',
 });
 assert.equal(mapping['neon.relationship.bp_target.read'],'neon.relationship.business_partner.read');
 const db=JSON.parse(execFileSync('docker',['inspect','athyper-dev-db-1'],{encoding:'utf8'}))[0];
 assert.equal(db.Config.Labels['com.docker.compose.project'],'athyper-dev');
 const codes=[...new Set(Object.values(mapping))];
 assert.ok(codes.every(x=>/^[a-z_.]+$/.test(x)));
 const count=execFileSync('docker',['exec','athyper-dev-db-1','psql','-X','-U','postgres','-d','athyper_neon','-Atc',`SELECT count(*) FROM authz.permission WHERE status='published' AND canonical_code IN (${codes.map(x=>`'${x}'`).join(',')})`],{encoding:'utf8'}).trim();
 assert.equal(Number(count),codes.length,'All mapped read permissions must exist');
 function replace(v:any):any{if(typeof v==='string')return mapping[v]??v;if(Array.isArray(v))return v.map(replace);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,replace(x)]));return v;}
 projections.neon=replace(projections.neon);
 const d=projections.neon.descriptor;
 // Source and target permissions now coincide. Remove the obsolete v2
 // cross-permission admission exception; normal v1 intersection still applies.
 d.authorizationRuntime={schemaVersion:1,runtimeVersion:'entity-authorization.v1',bindings:d.authorizationRuntime.bindings};
 d.storage.object='business_partner_identity_current';
 if(identity){
  const visit=(value:any):void=>{
   if(!value||typeof value!=='object')return;
   if(value.key==='partner_category'&&value.validation?.options)value.validation.options=['organization','person'];
   if(value.key==='name'&&value.list?.label)value.list.label='Display name';
   for(const child of Object.values(value))visit(child);
  };
  visit(d);
 }
 const revision=previous.revision+1,changeSetId=randomUUID(),graphHash=digest(projections);
 parseEntityRuntimeDescriptor({entity_code:coordinate.entityCode,plane_code:'neon',release_id:changeSetId,release_no:revision+1,entity_contract_hash:graphHash,compiled_hash:graphHash,compiled_json:d});
 assert.deepEqual(projections.studio,previous.projections.studio);
 assert.deepEqual(projections.mesh,previous.projections.mesh);
 if(process.argv.includes('--apply')){
  assert.equal(store.read(coordinate)?.id,previous.id,'Preview changed during repair');
  const claim=store.claim({...coordinate,revision,changeSetId,graphHash});
  const sealed=store.seal(claim,projections,readFileSync(join(root,'../preview-private.pem'),'utf8'));
  assert.ok(store.commit(claim,sealed),'Concurrent preview save won');
  store.record(claim,{state:'active',source:'approved-catl-cleaned-permission-alignment',previousArtifactId:previous.id,artifactHash:sealed.hash});
  console.log(JSON.stringify({activated:true,artifactHash:sealed.hash,changeSetId,revision,mappedReadPermissions:codes,grantsChanged:false,previousArtifactPreserved:true}));
 }else console.log(JSON.stringify({planned:true,revision,mapping,storage:d.storage,grantsChanged:false}));
 }
}finally{store.close();}
