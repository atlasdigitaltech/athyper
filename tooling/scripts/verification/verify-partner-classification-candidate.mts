/** Offline contract compilation: only public metadata enters error diagnostics. */
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {compileCompiledEntityArtifacts} from '../../../server/packages/services/publication/src/index.ts';
const base=process.argv.includes('--collection-labels')?'/tmp/athyper-bp-classification-r25/entities/':process.argv.includes('--partner-collections')?'/tmp/athyper-bp-classification-r24/entities/':process.argv.includes('--role-free')?'/tmp/athyper-bp-classification-r23/entities/':process.argv.includes('--direct-unspsc')?'/tmp/athyper-bp-classification-r22/entities/':process.argv.includes('--display-labels')?'/tmp/athyper-bp-classification-r21/entities/':'/tmp/athyper-bp-classification-r20/entities/';
const release=JSON.parse(readFileSync(base+'release.json','utf8'));
const artifacts=release.artifacts.map((a:any)=>{const {artifactHash,...value}=JSON.parse(readFileSync(base+a.ref,'utf8'));return {ref:a.ref,content:{...value,contractStatus:'published'}};});
const entries=JSON.parse(readFileSync('metadata/products/mdg/review/registry-catalog.json','utf8')).entries;
const keys=(kind:string)=>new Set<string>(entries.filter((e:any)=>e.kind===kind).map((e:any)=>e.key));
const sourceObjects=new Set<string>(execFileSync('docker',['exec','athyper-dev-db-1','psql','-X','-U','postgres','-d','athyper_neon','-Atc',"SELECT n.nspname||'.'||c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN('r','p','v','m','f')"],{encoding:'utf8'}).trim().split('\n'));
const canonical=(v:any):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}':JSON.stringify(v);
const {artifacts:unused,releaseHash,signature,...rest}=release;
try{const result=compileCompiledEntityArtifacts({artifacts,release:{content:{...rest,contractStatus:'published',signature}},registry:{permissions:keys('permission'),handlers:keys('handler'),renderers:keys('renderer'),resolvers:keys('resolver'),evaluators:keys('evaluator'),sourceObjects},canonicalizer:{canonicalBytes:v=>new TextEncoder().encode(canonical(v)),sha256:v=>'sha256:'+createHash('sha256').update(v).digest('hex')}});console.log(JSON.stringify(result.report));}
catch(error){console.error(error);process.exitCode=1;}
