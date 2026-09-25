/** CATL-only signed preview alignment; preserves prior artifacts and all other permissions. */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {DurableGraphPreviewStore} from '../../../server/packages/planes/studio/meta-entity-authoring/src/durable-graph-preview.js';
import {parseEntityRuntimeDescriptor} from '../../../server/packages/platform/metadata/src/descriptor-parser.js';
const root=join(homedir(),'.athyper/instances/dev/workspace/preview');
const store=new DurableGraphPreviewStore(join(root,'meta-entity.sqlite'),readFileSync(join(root,'public.pem'),'utf8'),{...process.env,ATHYPER_ENV:'local',ATHYPER_LOCAL_WORKSPACE:'1',ATHYPER_DOMAIN_SUFFIX:'dev.athyper.test'});
const coordinate={tenantId:'44444444-4444-4444-8444-444444444444',entityCode:'business_partner'};
const source='neon.relationship.business_partner_network.read',target='neon.relationship.bp_target.network_read';
try {
 const previous=store.read(coordinate);assert.ok(previous);
 const projections=structuredClone(previous.projections) as any;
 const operation=projections.neon.descriptor.operations.network_read;
 assert.ok(operation);assert.ok([source,target].includes(operation.permissionCode));
 const networkBinding=projections.neon.operationBindings.find((row:any)=>row.operationKey==='network_read');
 if(operation.permissionCode===target && JSON.stringify(networkBinding?.requiredScopeKinds)==='["tenant"]') console.log(JSON.stringify({alreadyAligned:true,revision:previous.revision}));
 else {
  let replacements=0;
  function replace(value:any):any {
   if(value===source){replacements++;return target;}
   if(Array.isArray(value))return value.map(replace);
   if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v)]));
   return value;
  }
  projections.neon=replace(projections.neon);
  // Partner-owned relationships exist before any commercial role/company assignment.
  // Use the same tenant-record scope contract as other partner-wide collections.
  const d=projections.neon.descriptor;
  const readScope=d.authorization.operations.find((row:any)=>row.key==='identity_read');
  assert.equal(readScope.scope,'tenant.record.v1');
  const networkScope=d.authorization.operations.find((row:any)=>row.key==='network_read');
  assert.ok(networkScope);assert.equal(networkScope.requiresParentRead,true);
  networkScope.scope=readScope.scope;
  const runtime=d.authorizationRuntime.bindings.find((row:any)=>row.operation==='network_read');
  assert.ok(runtime);runtime.resolver='tenant.record.v1';
  const binding=projections.neon.operationBindings.find((row:any)=>row.operationKey==='network_read');
  assert.ok(binding);binding.requiredScopeKinds=['tenant'];
  const revision=previous.revision+1,changeSetId=randomUUID(),graphHash=createHash('sha256').update(JSON.stringify(projections)).digest('hex');
  parseEntityRuntimeDescriptor({entity_code:coordinate.entityCode,plane_code:'neon',release_id:changeSetId,release_no:revision+1,entity_contract_hash:graphHash,compiled_hash:graphHash,compiled_json:projections.neon.descriptor});
  assert.deepEqual(projections.mesh,previous.projections.mesh);assert.deepEqual(projections.studio,previous.projections.studio);
  if(process.argv.includes('--apply')) {
   assert.equal(store.read(coordinate)?.id,previous.id);
   const claim=store.claim({...coordinate,revision,changeSetId,graphHash});
   const sealed=store.seal(claim,projections,readFileSync(join(root,'../preview-private.pem'),'utf8'));
   assert.ok(store.commit(claim,sealed));
   store.record(claim,{state:'active',source:'approved-catl-network-read-alignment',previousArtifactId:previous.id,artifactHash:sealed.hash});
  }
  console.log(JSON.stringify({applied:process.argv.includes('--apply'),revision,replacements,operation:projections.neon.descriptor.operations.network_read}));
 }
} finally {store.close();}
