import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {images,sql,save,authenticated,tenant,attachment,assistantText} from './atlas-f6-common.mjs';
const base=join(homedir(),'.athyper/instances/dev/deployments/atlas-f6-pilot-20260910');
const report={observedAt:new Date().toISOString(),kind:'retrieval feature rollback on the MFA-corrected API image',images:images(),checks:[]};
const current=JSON.parse(readFileSync(join(base,'qualified-current.json'),'utf8')),rollback=JSON.parse(readFileSync(join(base,'qualified-rollback-lexical.json'),'utf8'));
assert.equal(current.services.api.image,rollback.services.api.image);
assert.equal(current.services.api.image,report.images.find(i=>i.name==='athyper-dev-api-1').digest,'Deployment changed after rollback preparation');
const control=JSON.parse(readFileSync('docs/examples/atlas-f6/model-studio.json','utf8'));assert.equal(control.passed,true);assert.match(control.threadId,/^[a-f0-9-]{36}$/);
const fingerprint=()=>createHash('sha256').update(sql('neon',`SELECT jsonb_build_object('attachment',jsonb_build_object('id',a.id,'sha',a.sha256,'status',a.status,'text',md5(a.extracted_text),'scan',a.is_virus_scanned,'extraction',a.text_extraction_status),'source',jsonb_build_object('status',s.status,'permission',s.permission_code),'revisions',(SELECT jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'version',r.source_version_id,'checksum',r.checksum) ORDER BY r.id) FROM ai.atlas_knowledge_revision r WHERE r.source_id=s.id AND r.tenant_id=s.tenant_id),'compiledHash',(SELECT d.compiled_hash FROM runtime_meta.release_activation_head h JOIN runtime_meta.entity_descriptor d ON d.applied_release_id=h.applied_release_id WHERE h.publication_key='metadata.entity.business_partner.local-master-data.cirrusatlantic')) FROM document.attachment a JOIN ai.atlas_knowledge_source s ON s.source_id=a.id::text AND s.tenant_id=a.tenant_id WHERE a.tenant_id='${tenant}' AND a.id='${attachment}';`)).digest('hex');
const compose=name=>execFileSync('docker',['compose','-f',join(base,name),'up','-d','--no-deps','--pull','never','api'],{stdio:'pipe'});
async function healthy(){const deadline=Date.now()+90000;while(Date.now()<deadline){const found=images();if(found.find(i=>i.name==='athyper-dev-api-1')?.health==='healthy')return found;await new Promise(r=>setTimeout(r,1000));}throw Error('API did not become healthy');}
const semanticConfigured=()=>execFileSync('docker',['exec','athyper-dev-api-1','node','-e','console.log(Boolean(process.env.ATLAS_SEMANTIC_RETRIEVAL_CONFIG_PATH))'],{encoding:'utf8',stdio:'pipe'}).trim()==='true';
let switched=false,auth;
try{
 auth=await authenticated('studio','catl.admin');
 const history=async()=>{const r=await auth.client.get('/api/relay/atlas/threads/'+control.threadId+'/messages');assert.equal(r.status(),200);assert.match(assistantText(await r.json()),/\b63\b/);};
 await history();assert.equal(semanticConfigured(),true);report.beforeFingerprint=fingerprint();
 switched=true;compose('qualified-rollback-lexical.json');await healthy();assert.equal(semanticConfigured(),false);await history();assert.equal(fingerprint(),report.beforeFingerprint);
 report.checks.push('feature configuration switched to lexical mode','authenticated Studio history remains available','canonical attachment/revision/publication fingerprint preserved');
} catch(error){report.error=error.message;}finally{
 if(switched){try{compose('qualified-current.json');report.restoredImages=await healthy();assert.equal(semanticConfigured(),true);assert.equal(fingerprint(),report.beforeFingerprint);report.restored=true;report.checks.push('hybrid configuration restored and API healthy');}catch(error){report.restoreError=error.message;}}
 if(auth)await auth.close();report.passed=!report.error&&!report.restoreError&&report.restored===true;
 report.retrievalPositiveRecheck='Requires the separate elevated Neon persona qualification';save('rollback.json',report);console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
}
