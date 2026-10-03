import { resolveSourcePath } from "./source-workspace.mjs";
/** Prepare only the three CA-09 actions over a live baseline; never publish here. */
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {compileCompiledEntityArtifacts} from '../../../server/packages/services/publication/src/compiled-entity-artifact-compiler.js';
const root=resolve(import.meta.dirname,'../../..');
const args=new Map<string,string>();for(let i=2;i<process.argv.length;i+=2)args.set(process.argv[i]!,process.argv[i+1]!);
if(!args.get('--baseline')||!args.get('--output'))throw Error('Usage: --baseline <read-only live capture.json> --output <new private candidate directory>');
const captured=JSON.parse(readFileSync(resolveSourcePath(args.get('--baseline')!),'utf8'));
const payload=captured.payload;
if(captured.head?.publication_key!=='metadata.compiled_entity.business_partner'||payload.entityCode!=='business_partner'||payload.artifacts.length!==95)throw Error('Expected the pinned 95-artifact Business Partner baseline');
const op=JSON.parse(readFileSync(resolveSourcePath(root+'/metadata/entities/business_partner/operation.json'),'utf8'));
const section=JSON.parse(readFileSync(resolveSourcePath(root+'/metadata/entities/business_partner/presentation.section.attachments.json'),'utf8'));
const keys=['preview','extract','search'];
const values=payload.artifacts.map((a:any)=>{
 const v=structuredClone(a.content);delete v.artifactHash;
 if(a.artifactKey==='business_partner/operation'){
  v.attachmentBinding.processing=op.attachmentBinding.processing;
  v.attachmentBinding.actions=[...v.attachmentBinding.actions.filter((x:any)=>!keys.includes(x.key)),...op.attachmentBinding.actions.filter((x:any)=>keys.includes(x.key))];
 }
 if(a.artifactKey==='business_partner/presentation.section.attachments')v.availableOperations=[...v.availableOperations.filter((x:any)=>!keys.includes(x.key)),...section.availableOperations.filter((x:any)=>keys.includes(x.key))];
 return {ref:a.artifactKey+'.json',content:v};
});
const catalog=JSON.parse(readFileSync(resolveSourcePath(root+'/metadata/review/registry-catalog.json'),'utf8'));
const registry=Object.fromEntries(['permission','handler','renderer','resolver','evaluator'].map(k=>[k+'s',new Set(catalog.entries.filter((x:any)=>x.kind===k).map((x:any)=>x.key))]));
function stable(v:any):any{return Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;}
const canonicalizer={canonicalBytes:(v:any)=>Buffer.from(JSON.stringify(stable(v))),sha256:(v:Uint8Array)=>'sha256:'+createHash('sha256').update(v).digest('hex')};
const {artifacts,releaseHash,...release}=payload.release;
release.releaseId='business-partner-collaboration-ca09-dev';release.signature={algorithm:'Ed25519',keyId:'athyper-dev-publication-ed25519-20260905',value:''};
const compiled=compileCompiledEntityArtifacts({artifacts:values,release:{content:release},registry,canonicalizer});
const changed=compiled.artifacts.filter((a:any)=>payload.artifacts.find((b:any)=>b.artifactKey===a.artifact.artifactKey)?.artifactHash!==a.artifact.artifactHash).map((a:any)=>a.artifact.artifactKey);
if(JSON.stringify(changed.sort())!==JSON.stringify(['business_partner/operation','business_partner/presentation.section.attachments']))throw Error('Unexpected changed artifacts '+changed);
const output=resolve(args.get('--output')!);
if(existsSync(output))throw Error('Candidate output must be a new directory');
mkdirSync(output,{recursive:true,mode:0o700});
for(const a of compiled.artifacts){const p=output+'/entities/'+a.ref;mkdirSync(p.slice(0,p.lastIndexOf('/')),{recursive:true});writeFileSync(p,JSON.stringify(a.artifact.content,null,2)+'\n');}
writeFileSync(output+'/entities/release.json',JSON.stringify(compiled.releaseDocument,null,2)+'\n');
writeFileSync(output+'/compilation.json',JSON.stringify({baseline:captured.head,changedArtifactKeys:changed,artifactCount:compiled.artifacts.length,releaseHash:compiled.release.releaseHash,published:false,activated:false},null,2)+'\n');
console.log(JSON.stringify({artifactCount:compiled.artifacts.length,changed,releaseHash:compiled.release.releaseHash}));
