/** Small Country-like batch using the existing importer and maker/checker workflow. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {artifactDirectory} from '../artifact-paths.mjs';
const mode=process.argv[2],output=process.argv[3]?resolve(process.argv[3]):artifactDirectory('reference-batch-dev');
assert.ok(['prepare','propose','activate','execute'].includes(mode));
for(const entity of ['currency','language']){
 const directory=join(output,entity);mkdirSync(directory,{recursive:true,mode:0o700});
 if(mode==='prepare'){
  const result=JSON.parse(execFileSync('pnpm',['exec','tsx','server/db/scripts/operations/publication/import-dev-reference-product.ts',`--product=metadata/products/shared/entities/${entity}`,'--confirm=DEV-IMPORT-REFERENCE-DRAFT'],{encoding:'utf8'}));
  assert.ok(result.publicationPolicyCandidate);for(const [name,value] of Object.entries({'draft':result,'policy-candidate':result.publicationPolicyCandidate}))writeFileSync(join(directory,name+'.json'),JSON.stringify(value,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({entity,stage:'draft',changeSetId:result.publicationPolicyCandidate.changeSetId}));
 }else{
  const candidate=JSON.parse(readFileSync(join(directory,'policy-candidate.json'),'utf8'));assert.equal(candidate.policyId.startsWith(`dev.entity.${entity}.`),true);
  execFileSync('node',['tooling/scripts/verification/qualify-masked-export-dev.mjs',mode,directory],{stdio:'inherit'});
 }
}
console.log(`Evidence: ${output}`);
