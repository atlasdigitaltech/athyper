/** Read-only comparison with the pre-catalog backup in the isolated database. */
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const query=(container,db,s)=>JSON.parse(execFileSync('docker',['exec',container,'psql','-X','-U','postgres','-d',db,'-At','-v','ON_ERROR_STOP=1','-c',`SELECT coalesce(json_agg(q),'[]') FROM (${s}) q`],{encoding:'utf8'}));
const tables=query('athyper-dev-db-1','athyper_neon',"SELECT tablename FROM pg_tables WHERE schemaname='authz' AND tablename NOT IN ('permission','permission_scope_kind','application_projection','entity_operation_binding','entity_operation_scope_binding','projection_provider','projection_scope') ORDER BY tablename").map(r=>r.tablename);
if(tables.some(t=>!/^[a-z_]+$/.test(t)))throw Error('INVALID_TABLE');
const sql=tables.map(t=>`SELECT '${t}' AS name,count(*)::text AS rows,md5(coalesce(string_agg(row_to_json(r)::text,E'\\n' ORDER BY row_to_json(r)::text),'')) AS digest FROM authz.${t} r`).join(' UNION ALL ');
const before=query('athyper-bp-recovery-20260924','before_catalog',sql),after=query('athyper-dev-db-1','athyper_neon',sql);
const changed=tables.filter((_,i)=>JSON.stringify(before[i])!==JSON.stringify(after[i]));
writeFileSync('/home/chandravel_natarajan/.athyper/backups/bp-publication-recovery-20260924/grant-preservation-verification.json',JSON.stringify({at:new Date().toISOString(),before,after,changed},null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({checkedTables:tables.length,changed,grantsPreserved:changed.length===0}));
if(changed.length)process.exitCode=1;
