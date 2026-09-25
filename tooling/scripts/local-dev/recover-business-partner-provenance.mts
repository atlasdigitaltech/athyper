/** DEV incident runner. Defaults to a read-only plan. --apply requires the exact
 * artifact hash. Archive insertion never changes live authoring/audit history.
 * Normal host composition, not SQL, performs verification and activation.
 */
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,statSync,existsSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {canonicalBytes,sha256} from '../../../server/packages/adapters/publication-signing/src/index.js';
import {query,remoteVerify} from './inspect-business-partner-recovery.mjs';
import {unresolvedRecoveryPermissions} from './publication-recovery-preflight.mjs';
const releaseId='7bdb29f6-6b01-4385-867d-06357504f6ca';
const artifactHash='654c378b5336674cc7c4f827a77a0c497408f379fdcc5ee9348bba7d824c51e3';
const root='/home/chandravel_natarajan/.athyper/backups/bp-publication-recovery-20260924';
const args=process.argv.slice(2),apply=args.includes('--apply');
const supersedes=args.find(a=>a.startsWith('--supersedes='))?.slice('--supersedes='.length);
if(supersedes&&!/^[a-f0-9-]{36}$/.test(supersedes))throw Error('INVALID_PRIOR_RECOVERY_ID');
if(args.some(a=>a!=='--apply'&&!a.startsWith('--approved-artifact-sha256=')&&!a.startsWith('--supersedes=')))throw Error('UNKNOWN_ARGUMENT');
if(apply&&!args.includes('--approved-artifact-sha256='+artifactHash))throw Error('EXACT_OPERATOR_APPROVAL_REQUIRED');
const configuration='/home/chandravel_natarajan/.athyper/instances/dev/secrets/dev-publication/server.json';
if(statSync(configuration).mode&0o077)throw Error('PRIVATE_CONFIGURATION_REQUIRED');
const config=JSON.parse(readFileSync(configuration,'utf8'));
if(config.instance!=='dev'||config.entityCode!=='business_partner'||config.targets.join()!=='neon'||config.runtimeApproval.releaseId!==releaseId)throw Error('DEV_RECOVERY_SCOPE_MISMATCH');
const tenant=config.tenantId;
const topology=JSON.parse(execFileSync('docker',['inspect','athyper-dev-db-1'],{encoding:'utf8'}))[0];
if(topology.Config.Labels['com.docker.compose.project']!=='athyper-dev')throw Error('DEV_DATABASE_REQUIRED');
const [source]=query('athyper-bp-recovery-20260924','athyper_studio',`SELECT row_to_json(r) AS release,row_to_json(a) AS artifact,row_to_json(c) AS compilation FROM publication.release r JOIN publication.artifact a ON a.publication_release_id=r.id JOIN publication.artifact_compilation c ON c.publication_release_id=r.id AND c.plane_code=a.plane_code AND c.artifact_kind=a.artifact_kind WHERE r.id='${releaseId}' AND a.plane_code='neon' AND a.artifact_kind='entity_runtime'`);
if(!source||!['approved','published'].includes(source.release.status)||source.artifact.status!=='signed'||source.release.tenant_id!==tenant)throw Error('APPROVED_SIGNED_SOURCE_REQUIRED');
const unsigned=source.compilation.unsigned_document,document={...unsigned,signature:source.artifact.signature};
if(sha256(canonicalBytes(document))!==artifactHash||source.artifact.content_hash!==artifactHash)throw Error('ARCHIVE_ARTIFACT_HASH_MISMATCH');
await remoteVerify({keyId:source.artifact.signing_key_id,algorithm:source.artifact.signature_algorithm,signature:source.artifact.signature,bytes:canonicalBytes(unsigned)});
const contract=unsigned.envelope.payload.entityContract;
await remoteVerify({keyId:contract.signature.keyId,algorithm:contract.signature.algorithm,signature:contract.signature.signature,bytes:canonicalBytes(contract.contract)});
const [oldHead]=query('athyper-bp-recovery-20260924','athyper_neon',`SELECT h.artifact_hash FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id WHERE a.source_release_id='${releaseId}' AND a.status='active'`);
if(oldHead?.artifact_hash!==artifactHash)throw Error('BACKUP_ACTIVE_HEAD_REQUIRED');
const [native]=query('athyper-bp-recovery-20260924','athyper_studio',`SELECT row_to_json(r) AS release,row_to_json(c) AS "changeSet",row_to_json(s) AS snapshot,row_to_json(e) AS entity FROM metadata.entity_release r JOIN metadata.entity_change_set c ON c.id=r.change_set_id AND c.tenant_id=r.tenant_id JOIN snapshot.entity_contract_revision s ON s.id=r.revision_id AND s.tenant_id=r.tenant_id JOIN metadata.entity e ON e.id=r.entity_id AND e.tenant_id=r.tenant_id WHERE r.id='${releaseId}'`);
if(!native)throw Error('NATIVE_PROVENANCE_REQUIRED');
const audit=query('athyper-bp-recovery-20260924','athyper_studio',`SELECT * FROM audit.audit_log WHERE tenant_id='${tenant}' AND actor_type='service_account' AND actor_principal_id='${config.publisher.principalId}' AND outcome='success' AND ((event_code='metadata.development_publication.approved' AND context->>'changeSetId'='${native.changeSet.id}') OR (event_code='metadata.development_publication.dispatched' AND context->'release'->>'id'='${releaseId}'))`);
if(audit.length!==2)throw Error('EXACT_AUDIT_PROVENANCE_REQUIRED');
const catalog=query('athyper-dev-db-1','athyper_neon',`SELECT p.id,p.canonical_code code,p.permission_kind kind,array_agg(DISTINCT s.scope_kind::text ORDER BY s.scope_kind::text) "scopeKinds" FROM authz.permission p JOIN authz.permission_scope_kind s ON s.permission_id=p.id WHERE p.status='published' AND s.status='active' AND p.permission_kind IN ('entity_operation','capability') GROUP BY p.id,p.canonical_code,p.permission_kind ORDER BY p.canonical_code`);
const backup='/home/chandravel_natarajan/.athyper/backups/dev-qa-pre-rebuild-20260924-hg6ZwJ/dev-athyper_studio.dump';
const unresolved = unresolvedRecoveryPermissions(unsigned.envelope.payload.entityDescriptor.descriptor.operation_scope_bindings, catalog);
if (unresolved.length) {
 console.error(JSON.stringify({status:'blocked',code:'RECOVERY_PERMISSION_CATALOG_INCOMPLETE',unresolved,mutated:false}));
 process.exit(1);
}
const backupHash=createHash('sha256').update(readFileSync(backup)).digest('hex');
const payload={schema:'athyper.publication-recovery/1',tenantId:tenant,releaseId,entityCode:config.entityCode,plane:'neon',artifactHash,backupHash,currentCatalogHash:sha256(canonicalBytes(catalog)),authorId:config.author.principalId,authorEpoch:config.author.authEpoch,publisherId:config.publisher.principalId,publisherEpoch:config.publisher.authEpoch,historicalQualification:readFileSync(config.runtimeApproval.path,'utf8'),provenance:{...native,approval:audit.find(a=>a.event_code.endsWith('.approved')),dispatch:audit.find(a=>a.event_code.endsWith('.dispatched'))}};
const heads=query('athyper-dev-db-1','athyper_neon',`SELECT artifact_hash FROM runtime_meta.release_activation_head WHERE publication_key='${source.release.release_key}'`);
if(heads.length){if(heads[0].artifact_hash!==artifactHash)throw Error('TARGET_HEAD_CONFLICT');console.log(JSON.stringify({status:'already-active',releaseId,artifactHash}));process.exit(0);}
console.log(JSON.stringify({status:'planned',releaseId,artifactHash,backupHash,catalogHash:payload.currentCatalogHash,signedArtifactVerified:true,nativeContractSignatureVerified:true,historicalRowsReplayed:false,authoringGuardsChanged:false}));
if(!apply)process.exit(0);
const receiptPath=root+(supersedes?'/provenance-successor-'+supersedes:'/'+'provenance-recovery')+'-receipt.json';
const quote=(v:unknown)=>"'"+String(v).replaceAll("'","''")+"'";
let receipt:any;
if(existsSync(receiptPath)){
 receipt=JSON.parse(readFileSync(receiptPath,'utf8'));
 if(receipt.releaseId!==releaseId||receipt.artifactHash!==artifactHash||receipt.backupHash!==backupHash)throw Error('RECOVERY_RECEIPT_CONFLICT');
}else{
 const [{attempt}]=query('athyper-dev-db-1','athyper_studio',`SELECT coalesce(max(attempt_no),0)+1 AS attempt FROM publication.deployment WHERE artifact_id=${quote(source.artifact.id)} AND target_environment='local' AND target_instance='athyper_neon'`);
 receipt={releaseId,artifactHash,backupHash,attempt,commandId:randomUUID(),requestId:randomUUID(),recoveryId:randomUUID(),expiresAt:new Date(Date.now()+55*60000).toISOString()};
 writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'wx'});
}
const restore=Object.entries({release:source.release,artifact_compilation:source.compilation,artifact:source.artifact}).map(([table,row]:[string,any])=>{
 const current=query('athyper-dev-db-1','athyper_studio',`SELECT * FROM publication.${table} WHERE id=${quote(row.id)}`)[0];
 if(current){if(table==='release'?(current.release_hash!==row.release_hash||current.tenant_id!==tenant):table==='artifact'?current.content_hash!==row.content_hash:current.unsigned_hash!==row.unsigned_hash)throw Error('RECOVERY_SOURCE_CONFLICT');return '';}
 return `INSERT INTO publication.${table} SELECT * FROM jsonb_populate_record(NULL::publication.${table},${quote(JSON.stringify(row))}::jsonb);`;
}).join('\n');
const reason='User-approved exact Business Partner metadata recovery after clean DEV rebuild; no new authoring approval.';
const input=`BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'; SELECT set_config('app.current_tenant_id',${quote(tenant)},true),set_config('app.current_principal_id',${quote(config.publisher.principalId)},true);
${supersedes
 ? `SELECT metadata.fn_succeed_publication_recovery(${quote(receipt.recoveryId)}::uuid,${quote(supersedes)}::uuid,${quote(JSON.stringify(payload))}::jsonb,${quote(reason)},${quote(receipt.expiresAt)}::timestamptz);`
 : `SELECT metadata.fn_import_publication_recovery(${quote(tenant)}::uuid,${quote(releaseId)}::uuid,'business_partner',${quote(artifactHash)},${quote(backupHash)},${quote(JSON.stringify(payload))}::jsonb,${quote(reason)},${quote(receipt.expiresAt)}::timestamptz);`}
${restore}
SELECT 'DEPLOYMENT:'||id::text FROM publication.fn_create_deployment(${quote(receipt.commandId)}::uuid,${quote(source.artifact.id)}::uuid,'neon','local','athyper_neon',${Number(receipt.attempt??1)},${quote(receipt.requestId)}::uuid,${quote(config.publisher.principalId)}::uuid);
COMMIT;`;
const result=execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','athyper_studio'],{input,encoding:'utf8',maxBuffer:4*1024*1024});
receipt.deploymentId=result.match(/DEPLOYMENT:([a-f0-9-]{36})/)?.[1];
if(!receipt.deploymentId)throw Error('RECOVERY_DEPLOYMENT_NOT_CREATED');
writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
const activated=execFileSync('docker',['exec','-i','-w','/app/server','athyper-dev-source-worker-1','sh','/athyper/bin/start-runtime.sh','recover-dev-publication'],{input:JSON.stringify(receipt),encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
console.log(activated);
