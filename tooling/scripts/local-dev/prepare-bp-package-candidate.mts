/** Read-only source capture. Writes a new immutable local candidate, never a
 * release, approval, preview head, permission, or business record. */
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {verify,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {canonicalBytes,sha256} from '../../../server/packages/adapters/publication-signing/src/canonical-json.js';
import {parseEntityRuntimeDescriptor} from '../../../server/packages/platform/metadata/src/descriptor-parser.js';
import {assertCompiledEntityRuntimePublication} from '../../../server/packages/contracts/publication/src/artifact.js';

if(process.argv.slice(2).some(a=>a!=='--write'))throw Error('Use --write or no arguments for validation only');
const tenantId='44444444-4444-4444-8444-444444444444',entityCode='business_partner';
const root=join(homedir(),'.athyper/instances/dev/workspace/preview');
const db=new DatabaseSync(join(root,'meta-entity.sqlite'),{readOnly:true});
const coordinate=JSON.stringify([tenantId,entityCode]);
const readSource=()=>db.prepare('SELECT a.hash,a.body,a.signature FROM heads h JOIN artifacts a ON a.hash=h.artifact_hash WHERE h.coordinate=?').get(coordinate);
const sql=(query:string)=>execFileSync('docker',['exec','athyper-dev-db-1','psql','-X','-U','postgres','-d','athyper_neon','-Atc',query],{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
try {
 assert.equal(execFileSync('docker',['inspect','--format','{{index .Config.Labels "com.docker.compose.project"}}','athyper-dev-db-1'],{encoding:'utf8'}).trim(),'athyper-dev');
 const row=readSource();assert.ok(row,'CATL source preview missing');
 const body=String(row.body), sourceHash=String(row.hash);
 assert.equal(createHash('sha256').update(body).digest('hex'),sourceHash);
 assert.ok(verify(null,Buffer.from(body),readFileSync(join(root,'public.pem')),Buffer.from(String(row.signature),'base64')),'Source preview signature invalid');
 const source=JSON.parse(body);assert.equal(source.tenantId,tenantId);assert.equal(source.entityCode,entityCode);
 const descriptor=structuredClone(source.projections.neon.descriptor);
 assert.equal(descriptor.entityCode,entityCode);assert.equal(descriptor.planeKey,'neon');
 const serialized=JSON.stringify(descriptor);
 assert.ok(!/44444444-4444-4444-8444-444444444444|cirrusatlantic|\bcatl\b/i.test(serialized),'Tenant binding requires explicit review');
 parseEntityRuntimeDescriptor({entity_code:entityCode,plane_code:'neon',release_id:source.changeSetId,release_no:source.revision+1,entity_contract_hash:sha256(canonicalBytes(descriptor)),compiled_hash:sha256(canonicalBytes(descriptor)),compiled_json:descriptor});
 const compiled=JSON.parse(sql(`SELECT json_build_object('artifactHash',h.artifact_hash,'releaseId',a.source_release_id,'releaseNo',a.source_release_no,'payloadHash',p.payload_hash,'manifestPayloadHash',a.manifest->>'payloadSha256','verified',a.verification_evidence->>'signature_verified','payload',p.payload_json) FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id AND a.status='active' JOIN runtime_meta.applied_release_payload p ON p.applied_release_id=a.id WHERE h.publication_key='metadata.compiled_entity.business_partner'`));
 assert.equal(compiled.verified,'true');
 // Release 22's scoped publisher used localeCompare ordering. Verify that
 // historical encoding exactly; the new candidate uses canonicalBytes below.
 const legacyCanonical=(v:any):string=>Array.isArray(v)?`[${v.map(legacyCanonical).join(',')}]`:v&&typeof v==='object'?`{${Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${legacyCanonical(x)}`).join(',')}}`:JSON.stringify(v);
 assert.equal(createHash('sha256').update(legacyCanonical(compiled.payload)).digest('hex'),compiled.payloadHash);
 assert.equal(compiled.payloadHash,compiled.manifestPayloadHash);
 assert.equal(compiled.payload.entityCode,entityCode);
 assert.equal(compiled.payload.tenantId,undefined);
 assertCompiledEntityRuntimePublication(compiled.payload);
 assert.ok(!/44444444-4444-4444-8444-444444444444|cirrusatlantic|\bcatl\b/i.test(JSON.stringify(compiled.payload)),'Compiled tenant binding requires review');
 const storage=descriptor.storage;
 assert.ok(/^[a-z][a-z0-9_]*$/.test(storage.schema)&&/^[a-z][a-z0-9_]*$/.test(storage.object));
 const columns=new Set(JSON.parse(sql(`SELECT coalesce(json_agg(column_name),'[]') FROM information_schema.columns WHERE table_schema='${storage.schema}' AND table_name='${storage.object}'`)));
 const missing=descriptor.fields.filter((f:any)=>!columns.has(f.storagePath)).map((f:any)=>f.key);
 assert.deepEqual(missing,[],'Native storage fields unavailable');
 const candidate={schema:'athyper.product-entity-candidate/1',entityCode,plane:'neon',ownershipModel:'package',status:'draft',
   provenance:{sourceTenantId:tenantId,nativePreviewHash:sourceHash,nativePreviewRevision:source.revision,compiledSourceReleaseId:compiled.releaseId,compiledSourceReleaseNo:compiled.releaseNo,compiledSourceArtifactHash:compiled.artifactHash,compiledPayloadHash:compiled.payloadHash},
   nativeDescriptor:descriptor,compiledRuntime:compiled.payload,
   validation:{nativeParsed:true,compiledParsed:true,storageFieldsPresent:true,tenantBindingsDetected:false},
   approval:{status:'required',sourceApprovalInherited:false},activationAuthorized:false};
 const hash=sha256(canonicalBytes(candidate));
 assert.equal(readSource()?.hash,sourceHash,'Native source changed during capture');
 assert.equal(sql("SELECT artifact_hash FROM runtime_meta.release_activation_head WHERE publication_key='metadata.compiled_entity.business_partner'"),compiled.artifactHash,'Compiled source changed during capture');
 const directory=join(homedir(),'.athyper/instances/dev/candidates/business-partner-package');
 const path=join(directory,hash+'.json');
 if(process.argv.includes('--write')) {
  mkdirSync(directory,{recursive:true,mode:0o700});
  const content=JSON.stringify(candidate,null,2)+'\n';
  if(existsSync(path))assert.equal(readFileSync(path,'utf8'),content,'Candidate collision');
  else writeFileSync(path,content,{flag:'wx',mode:0o600});
 }
 console.log(JSON.stringify({candidateHash:hash,path,written:process.argv.includes('--write'),nativeFieldCount:descriptor.fields.length,compiledArtifactCount:compiled.payload.artifacts.length,approvalRequired:true,activationChanged:false}));
} finally {db.close();}
