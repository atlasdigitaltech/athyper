/** Read-only retirement inventory. No credentials, business rows or file writes. */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const roots=['apps','packages','server/packages','server/apps','server/db','metadata','tooling','tests','deploy'];
export const referencePattern=String.raw`\b(?:supplier_id|customer_id|supplierId|customerId|suggested_supplier_id|suggestedSupplierId)\b|master\.(?:supplier|customer)\b|["'](?:supplier|customer)["']`;

export function classifyReference(path,text){
 if(/(?:__tests__|\/tests\/|\.test\.|\.spec\.|\/fixtures\/)/.test(path))return 'test-or-fixture';
 if(/(?:docs-internal|\/review\/baselines\/)/.test(path))return 'historical-or-documentation';
 if(/\b(?:supplier_id|customer_id|supplierId|customerId|suggested_supplier_id|suggestedSupplierId)\b|master\.(?:supplier|customer)\b/.test(text))return 'identity-reference-review';
 return 'capacity-or-entity-key-review';
}

export function parseMatches(output){
 return output.split('\n').filter(Boolean).flatMap(line=>{
  const event=JSON.parse(line);if(event.type!=='match')return [];
  const d=event.data,path=d.path.text,text=d.lines.text.trimEnd();
  // Do not include source lines: only locations, match tokens and classifications.
  return [{path,line:d.line_number,kind:classifyReference(path,text),tokens:[...new Set(d.submatches.map(m=>m.match.text))]}];
 });
}

export const catalogSql=`BEGIN READ ONLY;
SELECT jsonb_build_object(
 'database',current_database(), 'observedAt',clock_timestamp(),
 'identityTables',(SELECT coalesce(jsonb_agg(n.nspname||'.'||c.relname ORDER BY c.relname),'[]'::jsonb) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid IN(to_regclass('master.supplier'),to_regclass('master.customer'))),
 'foreignKeys',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',k.conrelid::regclass::text,'name',k.conname,'definition',pg_get_constraintdef(k.oid)) ORDER BY k.conrelid::regclass::text,k.conname),'[]'::jsonb) FROM pg_constraint k WHERE k.contype='f' AND k.confrelid IN(to_regclass('master.supplier'),to_regclass('master.customer'))),
 'indexes',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',tablename,'name',indexname,'definition',indexdef) ORDER BY tablename,indexname),'[]'::jsonb) FROM pg_indexes WHERE schemaname='master' AND tablename IN('supplier','customer'))
);
ROLLBACK;`;

export function buildInventory({root,live=false}){
 let output='';
 try{output=execFileSync('rg',['--json','-n','--glob','!*.lock','--glob','!pnpm-lock.yaml','--glob','!partner-capability-dependencies*',referencePattern,...roots],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});}
 catch(error){if(error.status!==1)throw error;output=error.stdout??'';}
 const references=parseMatches(output);
 const files=[...new Set(references.map(r=>r.path))].sort().map(path=>({path,sha256:createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')}));
 let catalog;
 if(live){
  const name='athyper-dev-db-1';
  const label=execFileSync('docker',['inspect','--format','{{ index .Config.Labels "com.docker.compose.project" }}',name],{encoding:'utf8'}).trim();
  if(label!=='athyper-dev')throw Error('Refusing unexpected DEV database container');
  const raw=execFileSync('docker',['exec','-i',name,'psql','-X','-qAt','-U','postgres','-d','athyper_neon','-v','ON_ERROR_STOP=1'],{input:catalogSql,encoding:'utf8',maxBuffer:8*1024*1024});
  catalog=JSON.parse(raw.trim());
 }
 const identityReferences=references.filter(r=>r.kind==='identity-reference-review').length;
 return {schema:'partner-capability-dependency-inventory.v1',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),files,references,...(catalog?{catalog}:{}),summary:{files:files.length,identityReferences,reviewCandidates:references.filter(r=>r.kind==='capacity-or-entity-key-review').length,liveForeignKeys:catalog?.foreignKeys.length??null},retirementReady:false,limitations:['Text matches require semantic review; capability terminology is not automatically obsolete.','Dynamic SQL, indirect bindings and integration payloads require independent review.','Live catalog covers identity tables, inbound foreign keys and indexes, not a complete function/RLS/grant crosswalk.','Absence of text matches alone cannot certify retirement.']};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const args=process.argv.slice(2);if(args.some(a=>!['--live-dev','--summary'].includes(a)))throw Error('Use --live-dev and/or --summary');
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
  const result=buildInventory({root,live:args.includes('--live-dev')});
  console.log(JSON.stringify(args.includes('--summary')?{schema:result.schema,...result.summary,retirementReady:result.retirementReady,limitations:result.limitations}:result,null,2));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
