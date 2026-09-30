import {readFileSync,readdirSync} from 'node:fs';
import {join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';

/** Known SQL dependencies only: passing this check does not replace acceptance. */
export function partnerCutoverFindings(root=process.cwd()){
 const findings=[];
 const rules=[
  ['retired banking authority',/\b(?:master\.bank_account_(?:link|usage|company_usage)|document\.business_partner_bank_verification)\b/],
  ['removed qualification role column',/\bqualification\.(?:partner_role|role_id)\b/],
  ['retired qualification link authority',/\bcontrol\.business_partner_qualification_classification\b/],
  ['removed block inline scope/action',/\b(?:FROM|UPDATE)\s+control\.business_partner_block\b[^`\n]*\b(?:partner_role_scope|operation_code|operating_organization_id|company_code_id)\b/],
 ];
 function walk(dir){
  for(const entry of readdirSync(dir,{withFileTypes:true})){
   if(entry.name==='__tests__'||entry.name==='node_modules')continue;
   const file=join(dir,entry.name);
   if(entry.isDirectory())walk(file);
   else if(entry.name.endsWith('.ts')&&!/\.(?:test|spec)\.ts$/.test(entry.name)){
    readFileSync(file,'utf8').split('\n').forEach((line,i)=>{
     for(const [reason,pattern] of rules)if(pattern.test(line))findings.push({file:relative(root,file),line:i+1,reason});
    });
   }
  }
 }
 walk(join(root,'server/packages/services/master-data/src'));
 walk(join(root,'server/packages/planes/neon/src'));
 walk(join(root,'server/apps/platform-host/src/composition'));
 return findings;
}
export function assertPartnerCutoverReady(root=process.cwd()){
 const findings=partnerCutoverFindings(root);
 if(findings.length)throw Error('DEV rebuild refused before deletion: application SQL still uses retired partner DDL.\n'+findings.map(f=>`${f.file}:${f.line} — ${f.reason}`).join('\n'));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const findings=partnerCutoverFindings();console.log(JSON.stringify({ready:findings.length===0,findings},null,2));process.exitCode=findings.length?1:0;
}
