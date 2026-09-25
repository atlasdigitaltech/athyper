/** CATL DEV only: add the bank reveal alongside the existing tax reveal. */
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
try {
 const previous=store.read(coordinate);assert.ok(previous);
 const projections=structuredClone(previous.projections) as any, d=projections.neon.descriptor;
 if(d.operations.bank_reveal){console.log(JSON.stringify({alreadyEnabled:true}));}
 else {
  const clone=(v:unknown)=>JSON.parse(JSON.stringify(v).replaceAll('tax_reveal','bank_reveal'));
  d.operations.bank_reveal=clone(d.operations.tax_reveal);
  for(const [list,key] of [[d.authorization.operations,'key'],[d.authorizationRuntime.bindings,'operation'],[projections.neon.operationBindings,'operationKey']] as const){
   const tax=list.find((v:any)=>v[key]==='tax_reveal');assert.ok(tax);list.push(clone(tax));
  }
  const revision=previous.revision+1,changeSetId=randomUUID(),graphHash=createHash('sha256').update(JSON.stringify(projections)).digest('hex');
  parseEntityRuntimeDescriptor({entity_code:coordinate.entityCode,plane_code:'neon',release_id:changeSetId,release_no:revision+1,entity_contract_hash:graphHash,compiled_hash:graphHash,compiled_json:d});
  assert.deepEqual(projections.mesh,previous.projections.mesh);assert.deepEqual(projections.studio,previous.projections.studio);
  if(process.argv.includes('--apply')){
   assert.equal(store.read(coordinate)?.id,previous.id);
   const claim=store.claim({...coordinate,revision,changeSetId,graphHash});
   const sealed=store.seal(claim,projections,readFileSync(join(root,'../preview-private.pem'),'utf8'));
   assert.ok(store.commit(claim,sealed));
   store.record(claim,{state:'active',source:'approved-catl-bank-reveal',previousArtifactId:previous.id,artifactHash:sealed.hash});
   console.log(JSON.stringify({activated:true,revision,artifactHash:sealed.hash}));
  } else console.log(JSON.stringify({planned:true,revision,operation:d.operations.bank_reveal}));
 }
} finally {store.close();}
