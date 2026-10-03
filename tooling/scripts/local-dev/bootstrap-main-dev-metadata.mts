import { resolveSourcePath } from "../metadata/source-workspace.mjs";
import { discoverWorkspace } from "../metadata/source-workspace.mjs";
/** Initial signed BP metadata publication after an explicitly authorized empty DEV rebuild.
 * No historical release or human approval is fabricated. Successors require an
 * explicit flag and compare-and-swap the existing DEV activation head.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { compileCompiledEntityArtifacts, compiledEntityRuntimeProjection } from '../../../server/packages/services/publication/src/compiled-entity-artifact-compiler.js';
import { canonicalBytes } from '../../../server/packages/adapters/publication-signing/src/canonical-json.js';
import { createInfisicalSecretStore } from '../../../server/packages/adapters/secretstore-infisical/src/index.js';
import { CachedPublicationKeyResolver, Ed25519PublicationSigner, Ed25519PublicationVerifier } from '../../../server/packages/adapters/publication-signing/src/index.js';
import { loadDevPublicationConfiguration, verifyDevPublicationCredential } from '../../../server/apps/platform-host/src/development/publication.js';
const root=process.cwd();
if(!process.argv.includes('--inside')){
 const successor=process.argv.includes('--confirm-main-dev-binding-successor');
 if(!successor&&!process.argv.includes('--confirm-empty-main-dev'))throw Error('Explicit DEV publication confirmation required');
 const db=JSON.parse(execFileSync('docker',['inspect','athyper-dev-db-1'],{encoding:'utf8'}))[0];
 if(db.Config.Labels['com.docker.compose.project']!=='athyper-dev')throw Error('DEV database required');
 const dir=join(homedir(),'.athyper/instances/dev/secrets');
 const url=new URL(`postgresql://postgres@${(Object.values(db.NetworkSettings.Networks)[0] as any).IPAddress}:5432/athyper_neon`);
 url.password=readFileSync(resolveSourcePath(join(dir,'postgres-password')),'utf8').trim();
 const input={databaseUrl:url.toString(),successor,credentials:JSON.parse(readFileSync(resolveSourcePath(join(dir,'dev-publication/client.json')),'utf8'))};
 try {const result=execFileSync('docker',['exec','-i','-w',root,'athyper-dev-source-worker-1','node','--import','tsx',join(root,'tooling/scripts/local-dev/bootstrap-main-dev-metadata.mts'),'--inside'],{input:JSON.stringify(input),encoding:'utf8',maxBuffer:4*1024*1024});writeFileSync(join(homedir(),'.athyper/instances/dev/receipts/bp-rebuild-publication.json'),result,{mode:0o600});console.log(result);}
 catch(e:any){console.error(String(e.stdout??'')+String(e.stderr??'Bootstrap failed'));process.exitCode=1;}
}else{
 let store:any;let studio:any;let neon:any;
 try{
 const env=process.env;
 if(env.ATHYPER_ENV!=='local'||env.ATHYPER_DOMAIN_SUFFIX!=='dev.athyper.test')throw Error('MAIN_DEV_REQUIRED');
 let data='';for await(const chunk of process.stdin){data+=chunk;if(data.length>32768)throw Error('INPUT_LIMIT');}
 const input=JSON.parse(data),config=loadDevPublicationConfiguration(env,'local');
 if(!config||config.instance!=='dev'||config.entityCode!=='business_partner'||config.targets.join()!=='neon'||config.author.principalId===config.publisher.principalId)throw Error('SCOPED_AUTHORITY_REQUIRED');
 for(const role of ['author','publisher'] as const)verifyDevPublicationCredential(input.credentials[role],config[role]);
 const {Client}=createRequire(join(root,'server/db/package.json'))('pg');
 const studioUrl=new URL(input.databaseUrl);studioUrl.pathname='/athyper_studio';
 studio=new Client({connectionString:studioUrl.toString()});neon=new Client({connectionString:input.databaseUrl});await studio.connect();await neon.connect();
 const key='metadata.compiled_entity.business_partner';
 const previous=(await neon.query('SELECT * FROM runtime_meta.release_activation_head WHERE publication_key=$1',[key])).rows[0];
 const sourceReleases=(await studio.query('SELECT release_no FROM publication.release WHERE release_key=$1 ORDER BY release_no DESC',[key])).rows;
 if(!input.successor&&(previous||sourceReleases.length))throw Error('EMPTY_PUBLICATION_REQUIRED');
 if(input.successor&&(!previous||Number(previous.source_release_no)>Number(sourceReleases[0]?.release_no)))throw Error('SUCCESSOR_HEAD_REQUIRED');
 const releaseNo=sourceReleases.length?Number(sourceReleases[0].release_no)+1:1;
 // Restore only the existing, credential-verified DEV workload identities after
 // the authorized empty rebuild. Never replace an identity or grant human access.
 for(const client of [studio,neon]){
  const owner=(await client.query("SELECT p.id FROM master.tenant t JOIN master.principal p ON p.tenant_id=t.id AND p.code='seed.three-plane-provisioner' WHERE t.id=$1 AND t.code=$2 AND t.status='active'",[config.tenantId,config.tenantCode])).rows[0];
  if(!owner)throw Error('PUBLICATION_TENANT_SEED_REQUIRED');
  for(const role of ['author','publisher'] as const){const a=config[role];
   await client.query(`INSERT INTO master.principal(id,tenant_id,code,name,principal_type,auth_epoch,metadata,status,created_by)
     SELECT $1,$2,$3,$3,'service_account',$4,'{"_seed":{"pack":"existing-dev-publication-identities","version":"1"}}'::jsonb,'active',$5
     WHERE NOT EXISTS(SELECT 1 FROM master.principal WHERE id=$1 OR (tenant_id=$2 AND code=$3))`,[a.principalId,config.tenantId,a.code,a.authEpoch,owner.id]);
   if((await client.query("SELECT 1 FROM master.principal WHERE id=$1 AND tenant_id=$2 AND code=$3 AND principal_type='service_account' AND auth_epoch=$4 AND status='active'",[a.principalId,config.tenantId,a.code,a.authEpoch])).rowCount!==1)throw Error('WORKLOAD_IDENTITY_CONFLICT');
  }
 }
 for(const role of ['author','publisher'] as const){const a=config[role];if((await studio.query(`SELECT 1 FROM master.principal WHERE tenant_id=$1 AND id=$2 AND code=$3 AND principal_type='service_account' AND status='active' AND auth_epoch=$4`,[config.tenantId,a.principalId,a.code,a.authEpoch])).rowCount!==1)throw Error('WORKLOAD_IDENTITY_INVALID');}
 const required=(name:string)=>{if(!env[name])throw Error(`MISSING_${name}`);return env[name]!;};
 store=createInfisicalSecretStore({endpoint:required('INFISICAL_URL'),token:readFileSync(resolveSourcePath(required('INFISICAL_TOKEN_FILE')),'utf8').trim(),workspaceId:required('INFISICAL_WORKSPACE_ID'),environment:required('INFISICAL_ENVIRONMENT'),secretPath:env.INFISICAL_SECRET_PATH??'/'});
 const keyId=required('PUBLICATION_SIGNING_KEY_ID'),algorithm='Ed25519';
 const resolver=new CachedPublicationKeyResolver(store,[{keyId,privateKeyReference:required('PUBLICATION_PRIVATE_KEY_REFERENCE'),publicKeyReferences:[required('PUBLICATION_PUBLIC_KEY_REFERENCE')]}]);
 const hash=(x:Uint8Array)=>createHash('sha256').update(x).digest('hex');
 const canonicalizer={canonicalBytes,sha256:(x:Uint8Array)=>'sha256:'+hash(x)};
 const dir=join(root,'metadata/entities');
 const docs=discoverWorkspace(join(root,'metadata')).documents.map(({ref,value})=>({path:ref,value}));
 const catalog=JSON.parse(readFileSync(resolveSourcePath(join(dir,'../review/registry-catalog.json')),'utf8')).entries;
 const keys=(kind:string)=>new Set<string>(catalog.filter((e:any)=>e.kind===kind).map((e:any)=>e.key));
 const sourceObjects=new Set<string>((await neon.query(`SELECT n.nspname||'.'||c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN('r','p','v','m','f') AND n.nspname NOT LIKE 'pg_%'`)).rows.map((r:any)=>r.name));
 const omit=(v:any,fields:string[])=>Object.fromEntries(Object.entries(v).filter(([k])=>!fields.includes(k)));
 const releaseId=randomUUID();
 const compiled=compileCompiledEntityArtifacts({canonicalizer,registry:{permissions:keys('permission'),handlers:keys('handler'),renderers:keys('renderer'),resolvers:keys('resolver'),evaluators:keys('evaluator'),sourceObjects},
 artifacts:docs.filter(d=>['core','operation','presentation_surface','presentation_section','flow'].includes(d.value.artifactType)).map(d=>({ref:d.path,content:{...omit(d.value,['artifactHash']),contractStatus:'published'}})),
 release:{content:{...omit(docs.find(d=>d.path==='business_partner/release.json')!.value,['artifacts','releaseHash','signature']),contractStatus:'published',releaseId:`dev-rebuild-${releaseId}`,signature:{algorithm,keyId,value:'publication-envelope-signed-externally'}}}});
 for(const f of docs.find(d=>d.path==='business_partner/core.json')!.value.fields){const b=f.binding;if(b?.sourceObject && !(await neon.query('SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass($1) AND attname=$2 AND attnum>0 AND NOT attisdropped',[b.sourceObject,b.column])).rowCount)throw Error('STORAGE_BINDING_MISSING');}
 const payload=compiledEntityRuntimeProjection(compiled,new Date().toISOString(),'business_partner');
 const provenance={source:'operator-authorized-clean-dev-bootstrap',humanApprovalClaimed:false,authorId:config.author.principalId,publisherId:config.publisher.principalId,compiledReleaseHash:payload.release.releaseHash};
 // Role-free partner directory reads still require an exact published operation
 // binding. This projection changes no role grants and enables no write command.
 const readOperation=docs.find(d=>d.path==='business_partner/operation.json')!.value.operations.find((o:any)=>o.key==='read');
 if(readOperation?.permissionCode!=='neon.relationship.business_partner.read')throw Error('READ_CONTRACT_CHANGED');
 const permission=(await neon.query("SELECT p.id,p.permission_kind FROM authz.permission p WHERE p.canonical_code=$1 AND p.status='published' AND EXISTS(SELECT 1 FROM authz.permission_scope_kind s WHERE s.permission_id=p.id AND s.scope_kind='tenant' AND s.status='active')",[readOperation.permissionCode])).rows[0];
 if(!permission)throw Error('READ_PERMISSION_CATALOG_REQUIRED');
 const authorizationProjection={source:{entity_id:randomUUID(),release_hash:payload.release.releaseHash.replace(/^sha256:/,'')},operation_scope_bindings:[{bindingId:randomUUID(),scopeBindingId:randomUUID(),sourceEntityOperationId:randomUUID(),entityCode:'business_partner',operationKey:'read',permissionId:permission.id,permissionCode:readOperation.permissionCode,permissionKind:permission.permission_kind,decisionMode:'collection',scopeKind:'tenant',coordinateSource:'tenant_context',coordinateKey:null,resolverKey:null}]};
 const manifest={schema:'athyper.compiled-entity-runtime-publication/2.0',publicationKey:key,releaseId,releaseNo,targetPlane:'neon',artifactKind:'compiled_entity_runtime',payloadSha256:hash(canonicalBytes(payload)),authorizationProjectionSha256:hash(canonicalBytes(authorizationProjection)),evidence:provenance};
 const projection={authorizationProjection,applied_release_payload:{id:releaseId,tenant_id:null,artifact_kind:'compiled_entity_runtime',payload_schema_version:'2.0',payload_hash:manifest.payloadSha256,payload_json:payload,generated_at:payload.generatedAt,coordinates:{release_id:releaseId,release_no:releaseNo,publication_key:key,plane_code:'neon',entityCode:'business_partner',compiled_release_id:payload.release.releaseId,compiled_release_hash:payload.release.releaseHash}}};
 const document={manifest,projection},bytes=canonicalBytes(document),artifactHash=hash(bytes);
 const signature=(await new Ed25519PublicationSigner(resolver).sign({keyId,algorithm,bytes})).signature;
 if(!await new Ed25519PublicationVerifier(resolver).verify({keyId,algorithm,bytes,signature}))throw Error('SIGNATURE_VERIFICATION_FAILED');
 const artifactId=randomUUID(),correlation=randomUUID();const actor=config.publisher.principalId;
 await studio.query('BEGIN');await studio.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true),pg_advisory_xact_lock(hashtextextended($3,0))",[config.tenantId,actor,key]);
 if(Number((await studio.query('SELECT coalesce(max(release_no),0) n FROM publication.release WHERE release_key=$1',[key])).rows[0].n)!==releaseNo-1)throw Error('CONCURRENT_PUBLICATION');
 await studio.query(`INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,release_hash,manifest_hash,minimum_runtime_version,created_by,metadata) VALUES($1,$2,$3,$8,'publish','preparing','backward_compatible',$4,$5,'2.0.0',$6,$7)`,[releaseId,config.tenantId,key,payload.release.releaseHash.replace(/^sha256:/,''),hash(canonicalBytes(manifest)),actor,provenance,releaseNo]);
 await studio.query(`INSERT INTO publication.artifact_compilation(id,publication_release_id,plane_code,artifact_kind,unsigned_document,unsigned_hash,compiler_name,compiler_version,created_by) VALUES($1,$2,'neon','compiled_entity_runtime',$3,$4,'athyper.compiled-entity-artifact-compiler',$5,$6)`,[randomUUID(),releaseId,document,artifactHash,compiled.report.compilerVersion,actor]);
 await studio.query(`INSERT INTO publication.artifact(id,publication_release_id,plane_code,artifact_kind,artifact_uri,content_hash,status,created_by) VALUES($1,$2,'neon','compiled_entity_runtime','local://runtime/business_partner/neon/compiled-entity-runtime.json',$3,'compiled',$4)`,[artifactId,releaseId,artifactHash,actor]);
 await studio.query("SELECT publication.fn_transition_artifact($1,'validated')",[artifactId]);await studio.query("SELECT publication.fn_transition_artifact($1,'signed',$2,$3,$4)",[artifactId,algorithm,keyId,signature]);
 for(const status of ['approved','published'])await studio.query('SELECT publication.fn_transition_release($1,$2,$3,$4,$5)',[releaseId,status,actor,correlation,provenance]);
 const deployment=(await studio.query("SELECT id FROM publication.fn_create_deployment($1,$2,'neon','development','athyper_neon',1,$3,$4)",[randomUUID(),artifactId,correlation,actor])).rows[0].id;
 await studio.query('COMMIT');
 await neon.query('BEGIN');await neon.query("SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true),pg_advisory_xact_lock(hashtextextended($3,0))",[config.tenantId,actor,key]);
 const current=(await neon.query('SELECT applied_release_id FROM runtime_meta.release_activation_head WHERE publication_key=$1',[key])).rows[0];
 if(current?.applied_release_id!==previous?.applied_release_id)throw Error('TARGET_HEAD_CHANGED');
 const applied=(await neon.query('SELECT id FROM runtime_meta.fn_stage_release_projection($1,$2,$7,$3,$4,$5,$6)',[key,releaseId,deployment,artifactHash,manifest,projection,releaseNo])).rows[0].id;
 await neon.query('SELECT authz.fn_stage_entity_operation_projection($1,NULL,\'neon\',$2,$3,$4)',[applied,releaseId,manifest.payloadSha256,authorizationProjection]);
 const verified=(await neon.query('SELECT status FROM runtime_meta.fn_verify_release($1,$2,$3)',[applied,artifactHash,{signature_verified:true,manifest_valid:true,runtime_compatible:true,target_plane:'neon',payload_hash:manifest.payloadSha256,payload_schema_version:'2.0',signature_algorithm:algorithm,signing_key_id:keyId}])).rows[0];
 if(verified.status!=='verified')throw Error('RUNTIME_VERIFICATION_FAILED');
 await neon.query('SELECT runtime_meta.fn_activate_release($1,$2)',[applied,provenance]);
 await neon.query('SELECT authz.fn_activate_entity_operation_projection($1,clock_timestamp())',[applied]);
 if((await neon.query("SELECT 1 FROM authz.entity_operation_binding WHERE applied_release_id=$1 AND entity_code='business_partner' AND operation_key='read' AND status='published'",[applied])).rowCount!==1)throw Error('READ_BINDING_NOT_ACTIVATED');
 await neon.query('COMMIT');
 for(const status of ['dispatched','received','staged','verified','activated'])await studio.query('SELECT publication.fn_transition_deployment($1,$2,$3)',[deployment,status,provenance]);
 await studio.query("SELECT publication.fn_acknowledge_activation($1,'athyper_neon',$2,$3,$4)",[deployment,artifactHash,applied,provenance]);
 console.log(JSON.stringify({instance:'dev',releaseId,appliedReleaseId:applied,artifactHash,signatureAlgorithm:algorithm,signingKeyId:keyId,artifactCount:compiled.report.artifactCount,source:provenance.source,humanApprovalClaimed:false,activated:true}));resolver.clear();
 }catch(e:any){await studio?.query('ROLLBACK').catch(()=>{});await neon?.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({error:e.name,code:e.code,message:String(e.message).slice(0,300)}));process.exitCode=1;}
 finally{await studio?.end();await neon?.end();store?.close?.();}
}
