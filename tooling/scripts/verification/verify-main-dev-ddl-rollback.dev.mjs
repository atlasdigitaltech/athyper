import fs from 'node:fs';
import path from 'node:path';
import { spawnSync,execFileSync } from 'node:child_process';
if(process.argv[2]!=='--confirm-rollback-only-dev')throw Error('Explicit local DEV rollback validation required');
const db='athyper-dev-db-1';
const info=JSON.parse(execFileSync('docker',['inspect',db],{encoding:'utf8'}))[0];
if(info.Config.Labels['com.docker.compose.project']!=='athyper-dev')throw Error('Wrong DEV target');
const root='server/db/ddl/';
const plane=process.argv.find(x=>x.startsWith('--plane='))?.slice(8)??'neon';
if(!['neon','studio','mesh'].includes(plane))throw Error('Unsupported DEV plane');
const files=fs.readFileSync(root+'planes/'+plane+'/_manifest.txt','utf8').split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));
// Cluster roles, extensions and database settings already exist. Do not alter
// cluster-wide authority or database settings during a rollback-only DDL check.
const selected=files.filter(x=>!x.includes('/_database/')||x.endsWith('/02_schema_provisions.sql'));
const expand=file=>{
 const absolute=path.resolve(root,file);
 if(!absolute.startsWith(path.resolve(root)+path.sep))throw Error('Include outside DDL root');
 const sql=fs.readFileSync(absolute,'utf8').replace(/^\s*\\ir\s+([^\r\n]+)$/gm,(_,include)=>expand(path.relative(path.resolve(root),path.resolve(path.dirname(absolute),include.trim()))));
 if(/^\s*(?:COMMIT|ROLLBACK|BEGIN)\s*;/im.test(sql)||/^\s*\\/m.test(sql))throw Error('Unexpected transaction/client control in '+file);
 return sql.replace(/^\uFEFF/,'');
};
const body=selected.map(file=>'\\echo DDL_FILE '+file+'\n'+expand(file)).join('\n');
let acceptance='';
if(process.argv.includes('--check-banking-metadata')){
 if(plane!=='neon')throw Error('Banking metadata belongs to Neon');
 const emitted=execFileSync('pnpm',['exec','tsx','tooling/scripts/verification/business-partner-cutover-publication.fixture.mts'],{encoding:'utf8',maxBuffer:64*1024*1024});
 if(!emitted.startsWith('BEGIN;\n')||!emitted.includes('\nROLLBACK;\n'))throw Error('Unexpected publication fixture transaction');
 acceptance=emitted.replace(/^BEGIN;\n/,'').replace('\nROLLBACK;\n','\n');
 const documents=['business_partner_banking/core.json','business_partner_bank_account_link/core.json','business_partner_bank_provisional_reference/core.json'];
 const bindings=documents.flatMap(file=>JSON.parse(fs.readFileSync('metadata/products/mdg/entities/'+file,'utf8')).fields.map(f=>f.binding).filter(Boolean));
 acceptance+=`\nDO $$ DECLARE binding jsonb; BEGIN
 FOR binding IN SELECT value FROM jsonb_array_elements('${JSON.stringify(bindings).replaceAll("'","''")}'::jsonb) LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass(binding->>'sourceObject') AND attname=binding->>'column' AND attnum>0 AND NOT attisdropped)
 THEN RAISE EXCEPTION 'Missing bank metadata binding: %',binding; END IF;
 END LOOP; END $$;\n`;
}
const schemas=[...new Set([...body.matchAll(/CREATE SCHEMA (?:IF NOT EXISTS )?([a-z_]+);/g)].map(x=>x[1]))];
if(!schemas.includes('master')||schemas.some(x=>['public','pg_catalog','information_schema'].includes(x)))throw Error('Unexpected schema manifest');
const sql=`\\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
SET LOCAL client_min_messages=warning;
SET LOCAL app.database_plane='${plane}';
SET LOCAL app.current_principal_id='00000000-0000-0000-0000-000000000000';
DROP SCHEMA ${schemas.join(',')} CASCADE;
DROP TABLE public.schema_provisions;
${body}
${acceptance}
\\echo ${plane.toUpperCase()}_DDL_ROLLBACK_VALIDATION_OK
ROLLBACK;
`;
const r=spawnSync('docker',['exec','-i',db,'psql','-X','-U','postgres','-d','athyper_'+plane],{input:sql,encoding:'utf8',maxBuffer:64*1024*1024,timeout:120000});
console.log((r.stdout??'').split('\n').slice(-18).join('\n'));
console.log((r.stdout??'').split('\n').filter(x=>x.startsWith('DDL_FILE ')).at(-1));
if(r.stderr)console.error(r.stderr.slice(-7000));
if(r.error)console.error(r.error.message);
process.exit(r.status??1);
