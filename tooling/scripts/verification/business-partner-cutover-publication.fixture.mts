// Emits rollback-only SQL for the disposable foundation test. Never connects to DEV.
import {readFile,readdir} from 'node:fs/promises';
import {generateKeyPairSync,sign,verify,randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {compileCompiledEntityArtifacts,compiledEntityRuntimeProjection} from '../../../server/packages/services/publication/src/compiled-entity-artifact-compiler.js';
import {canonicalBytes} from '../../../server/packages/adapters/publication-signing/src/canonical-json.js';

const root=new URL('../../../metadata/products/mdg/entities/',import.meta.url);
async function paths(dir:URL,prefix=''):Promise<string[]> {
 const result:string[]=[];
 for(const entry of await readdir(dir,{withFileTypes:true})){
   if(entry.isDirectory())result.push(...await paths(new URL(entry.name+'/',dir),prefix+entry.name+'/'));
   else if(entry.name.endsWith('.json'))result.push(prefix+entry.name);
 }
 return result.sort();
}
const documents=await Promise.all((await paths(root)).map(async path=>({path,value:JSON.parse(await readFile(new URL(path,root),'utf8'))})));
const entries=JSON.parse(await readFile(new URL('../review/registry-catalog.json',root),'utf8')).entries as {kind:string;key:string}[];
const keys=(kind:string)=>new Set(entries.filter(e=>e.kind===kind).map(e=>e.key));
const hash=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
const canonicalizer={canonicalBytes,sha256:(value:Uint8Array)=>'sha256:'+hash(value)};
const omit=(value:Record<string,unknown>,fields:string[])=>Object.fromEntries(Object.entries(value).filter(([key])=>!fields.includes(key)));
const compilation=compileCompiledEntityArtifacts({canonicalizer,
 registry:{permissions:keys('permission'),handlers:keys('handler'),renderers:keys('renderer'),resolvers:keys('resolver'),evaluators:keys('evaluator')},
 artifacts:documents.filter(d=>['core','operation','presentation_surface','presentation_section','flow'].includes(d.value.artifactType))
   .map(d=>({ref:d.path,content:omit(d.value,['artifactHash'])})),
 release:{content:omit(documents.find(d=>d.path==='business_partner/release.json')!.value,['artifacts','releaseHash'])},
});
const payload=compiledEntityRuntimeProjection(compilation,new Date().toISOString(),'business_partner');
const bytes=canonicalBytes(payload),payloadHash=hash(bytes);
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const signature=sign(null,bytes,privateKey);
assert.ok(verify(null,bytes,publicKey,signature));
assert.equal(verify(null,Buffer.concat([bytes,Buffer.from('tampered')]),publicKey,signature),false);
const releaseId=randomUUID(),deploymentId=randomUUID(),publicationKey='compiled.entity.business_partner.cutover_test';
const manifest={artifactKind:'compiled_entity_runtime',targetPlane:'neon',releaseId,payloadSha256:payloadHash};
const projection={applied_release_payload:{id:releaseId,tenant_id:null,artifact_kind:'compiled_entity_runtime',payload_schema_version:'2.0',payload_hash:payloadHash,payload_json:payload,generated_at:payload.generatedAt,
 coordinates:{release_id:releaseId,release_no:1,publication_key:publicationKey,plane_code:'neon',entityCode:'business_partner',compiled_release_id:payload.release.releaseId,compiled_release_hash:payload.release.releaseHash}}};
const evidence={signature_verified:true,manifest_valid:true,runtime_compatible:true,target_plane:'neon',payload_hash:payloadHash,payload_schema_version:'2.0',test_only:true};
const literal=(value:unknown)=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
console.log(`BEGIN;
SELECT set_config('app.database_plane','neon',true);
DO $$ DECLARE staged runtime_meta.applied_release; verified runtime_meta.applied_release; field record; BEGIN
 -- Inspect every BP core binding against the actual newly built schema before activation.
 FOR field IN SELECT f->'binding'->>'sourceObject' object_name,f->'binding'->>'column' column_name
   FROM jsonb_array_elements(${literal(documents.find(d=>d.path==='business_partner/core.json')!.value)}->'fields') f LOOP
   IF field.object_name IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass(field.object_name)
      AND a.attname=field.column_name AND a.attnum>0 AND NOT a.attisdropped) THEN
      RAISE EXCEPTION 'Compiled BP binding missing: %.%',field.object_name,field.column_name; END IF;
 END LOOP;
 staged:=runtime_meta.fn_stage_release_projection('${publicationKey}','${releaseId}',1,'${deploymentId}','${payloadHash}',${literal(manifest)},${literal(projection)});
 BEGIN PERFORM runtime_meta.fn_activate_release(staged.id,'{}'); RAISE EXCEPTION 'Unverified activation accepted';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 verified:=runtime_meta.fn_verify_release(staged.id,'${payloadHash}',${literal(evidence)});
 IF verified.status<>'verified' THEN RAISE EXCEPTION 'Verification failed: %',verified.failure_code; END IF;
 PERFORM runtime_meta.fn_activate_release(staged.id,'{"testOnly":true}');
 IF NOT EXISTS(SELECT 1 FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release_payload p ON p.applied_release_id=h.applied_release_id
   WHERE h.publication_key='${publicationKey}' AND p.payload_hash='${payloadHash}' AND p.payload_json=${literal(payload)}) THEN RAISE EXCEPTION 'Activated payload mismatch'; END IF;
 IF (runtime_meta.fn_stage_release_projection('${publicationKey}','${releaseId}',1,'${deploymentId}','${payloadHash}',${literal(manifest)},${literal(projection)})).id<>staged.id THEN RAISE EXCEPTION 'Publication replay duplicated release'; END IF;
END $$;
ROLLBACK;
SELECT 'BP_COMPILED_CUTOVER_ACTIVATION_OK';`);
