/** Read-only FK closure for the archived DEV authoring provenance. */
import { query } from './inspect-business-partner-recovery.mjs';
const source='athyper-bp-recovery-20260924',target='athyper-dev-db-1';
const literal=(v:unknown)=>"'"+String(v).replaceAll("'","''")+"'";
const dependencies=query(source,'athyper_studio',`SELECT n.nspname||'.'||t.relname AS child,nr.nspname||'.'||tr.relname AS parent,array_agg(a.attname ORDER BY u.ord) AS child_columns,array_agg(ar.attname ORDER BY u.ord) AS parent_columns FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_class tr ON tr.oid=c.confrelid JOIN pg_namespace nr ON nr.oid=tr.relnamespace JOIN LATERAL unnest(c.conkey,c.confkey) WITH ORDINALITY u(ck,pk,ord) ON true JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=u.ck JOIN pg_attribute ar ON ar.attrelid=c.confrelid AND ar.attnum=u.pk WHERE c.contype='f' GROUP BY c.oid,n.nspname,t.relname,nr.nspname,tr.relname`);
const rows=new Map<string,{table:string,row:any}>(),blocked:any[]=[];
async function visit(table:string,where:string){
  const found=query(source,'athyper_studio',`SELECT * FROM ${table} WHERE ${where}`);
  if(found.length!==1)throw Error('SOURCE_REFERENCE_AMBIGUOUS');
  const row=found[0],key=table+':'+row.id;
  if(rows.has(key))return;
  const current=query(target,'athyper_studio',`SELECT * FROM ${table} WHERE ${where}`);
  if(current.length){return;}
  if(!['metadata','snapshot','publication','audit'].includes(table.split('.')[0]!)){
    blocked.push({table,id:row.id,reason:'missing non-metadata dependency'});return;
  }
  if(rows.size>500)throw Error('RECOVERY_SCOPE_LIMIT');
  rows.set(key,{table,row});
  for(const fk of dependencies.filter(d=>d.child===table)){
    if(fk.child_columns.some((c:string)=>row[c]===null))continue;
    await visit(fk.parent,fk.parent_columns.map((c:string,i:number)=>`"${c}"=${literal(row[fk.child_columns[i]])}`).join(' AND '));
  }
}
await visit('metadata.entity_release',"id='7bdb29f6-6b01-4385-867d-06357504f6ca'");
const currentRelease=[...rows.values()].find(r=>r.table==='metadata.entity_release'&&r.row.id==='7bdb29f6-6b01-4385-867d-06357504f6ca')?.row;
if(currentRelease){
  const audits=query(source,'athyper_studio',`SELECT id FROM audit.audit_log WHERE tenant_id='44444444-4444-4444-8444-444444444444' AND outcome='success' AND actor_type='service_account' AND actor_principal_id='e545079f-4992-4f2e-bc92-8038a8dd9a22' AND ((event_code='metadata.development_publication.approved' AND context->>'changeSetId'=${literal(currentRelease.change_set_id)}) OR (event_code='metadata.development_publication.dispatched' AND context->'release'->>'id'='7bdb29f6-6b01-4385-867d-06357504f6ca'))`);
  if(audits.length!==2)throw Error('EXACT_WORKLOAD_AUDIT_PROVENANCE_REQUIRED');
  for(const audit of audits)await visit('audit.audit_log',`id=${literal(audit.id)}`);
}
console.log(JSON.stringify({provenanceRows:rows.size,tables:Object.fromEntries([...new Set([...rows.values()].map(r=>r.table))].map(t=>[t,[...rows.values()].filter(r=>r.table===t).length])),blockedDependencies:blocked,mutated:false},null,2));
export {rows,dependencies,blocked};
