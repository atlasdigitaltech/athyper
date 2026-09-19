/** DEV storage qualification against a synthetic Atlas qualification thread.
 * Reads lineage through the runtime role, tests tenant/principal/plane isolation,
 * and attempts a no-op lineage update inside a transaction that must be rejected.
 * No grants or business data are changed. */
import { dirname, resolve, relative } from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';import {execFileSync,spawnSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
const receiptPath=resolve(process.env.ATLAS_REPLAY_RECEIPT ?? '');
if(!process.env.ATLAS_REPLAY_RECEIPT || !relative(process.cwd(),receiptPath).startsWith('../')) throw Error('Set ATLAS_REPLAY_RECEIPT to a private qualification receipt outside the repository');
const dir=dirname(receiptPath);
const receipt=JSON.parse(readFileSync(receiptPath,'utf8'));
const uuid=x=>{if(!/^[0-9a-f-]{36}$/.test(x))throw Error('Invalid fixture identifier');return x;};
const args=['exec','-i','athyper-dev-db-1','psql','-U','postgres','-d','athyper_neon','-X','-At','-v','ON_ERROR_STOP=1'];
const db=query=>execFileSync('docker',args,{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const rows=JSON.parse(db(`SELECT json_agg(json_build_object('id',id,'tenant',tenant_id,'principal',created_by,'lineageCount',jsonb_array_length(citation_refs),'readCount',jsonb_array_length(citation_refs->0->'reads'))) FROM ai.atlas_message WHERE conversation_id='${uuid(receipt.threadId)}';`));
const row=rows[0];
function count(tenant,principal,plane='neon'){
 const raw=db(`BEGIN READ ONLY; SET LOCAL ROLE athyper_runtime; SELECT set_config('app.current_tenant_id','${uuid(tenant)}',true); SELECT set_config('app.current_principal_id','${uuid(principal)}',true); SELECT set_config('app.current_atlas_plane','${plane}',true); SELECT count(*) FROM ai.atlas_message WHERE conversation_id='${uuid(receipt.threadId)}'; ROLLBACK;`);
 return Number(raw.split('\n').filter(x=>/^\d+$/.test(x)).at(-1));
}
const owner=count(row.tenant,row.principal),otherTenant=count(randomUUID(),row.principal),otherPrincipal=count(row.tenant,randomUUID()),otherPlane=count(row.tenant,row.principal,'mesh');
const immutable=spawnSync('docker',args,{input:`BEGIN; UPDATE ai.atlas_message SET citation_refs=citation_refs WHERE id='${uuid(row.id)}'; ROLLBACK;`,encoding:'utf8'});
const results={schema:'atlas-lineage-storage-qualification/1',capturedAt:new Date().toISOString(),ownerRows:owner,otherTenantRows:otherTenant,otherPrincipalRows:otherPrincipal,otherPlaneRows:otherPlane,lineagePersisted:rows.every(r=>r.lineageCount===1),readEvidencePersisted:rows.some(r=>r.readCount>0),terminalLineageImmutable:immutable.status!==0 && immutable.stderr.includes('terminal messages are immutable')};
if(owner<2||otherTenant||otherPrincipal||otherPlane||!results.lineagePersisted||!results.readEvidencePersisted||!results.terminalLineageImmutable)throw Error('Storage qualification failed');
writeFileSync(dir+'/storage-summary.json',JSON.stringify(results,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(results));
