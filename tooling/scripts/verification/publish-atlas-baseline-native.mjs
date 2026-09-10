import {readFileSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {request} from '@playwright/test';
const step=process.argv[2];if(!['stage','validate','test','submit','approve','publish','activate','redispatch'].includes(step))throw Error('Select stage, validate, test, submit, approve, publish or activate');
const id='28081bdb-5b6e-43aa-8c63-2f60ceeb6aeb',tenant='44444444-4444-4444-8444-444444444444';
const receiptPath='docs/examples/atlas-f5/cirrus-baseline-authenticated-publication.json';
const receipt=existsSync(receiptPath)?JSON.parse(readFileSync(receiptPath,'utf8')):{schema:'atlas-baseline-authenticated-publication/1',tenantId:tenant,changeSetId:id,steps:[]};
const user=step==='approve'?'catl.owner':'catl.admin',principal=step==='approve'?'5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d':'81cd1978-2df5-5c9a-938a-2f8c291aea13';
const query=`SELECT jsonb_build_object('id',cs.id,'status',cs.status,'revision',cs.lock_version,'author',cs.created_by,'reviewer',cs.approved_by,'releaseId',(SELECT id FROM metadata.entity_release WHERE change_set_id=cs.id ORDER BY release_no DESC LIMIT 1)) FROM metadata.entity_change_set cs WHERE id='${id}' AND tenant_id='${tenant}'`;
const current=JSON.parse(execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-qAt','-U','postgres','-d','athyper_studio','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}));
if(current.author!=='81cd1978-2df5-5c9a-938a-2f8c291aea13')throw Error('Unexpected author');
if(step==='stage'&&current.status!=='draft')throw Error('Graph cannot change after submission');
if(step==='approve'&&current.status!=='in_review')throw Error('Review state required');
if(step==='publish'&&(current.status!=='approved'||current.reviewer!=='5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d'||current.releaseId))throw Error('Independent approval without an existing release required');
const baseURL='https://studio.dev.athyper.test';
const c=await request.newContext({baseURL,ignoreHTTPSErrors:true,storageState:`tests/e2e/.auth/dev/studio/${user}.json`});
try{
 const initial=await c.storageState(),csrf=initial.cookies.find(x=>x.name==='__Host-athyper-csrf');
 if(!csrf)throw Error('Missing CSRF token');
 const refreshed=await c.post('/api/auth/refresh',{headers:{origin:baseURL,'x-csrf-token':decodeURIComponent(csrf.value)}});if(!refreshed.ok())throw Error('Studio session refresh failed');
 const session=await (await c.get('/api/auth/session')).json();if(session.state!=='authenticated'||session.tenantId!==tenant||session.principalId!==principal)throw Error('Refresh the correct Studio session');
 const state=await c.storageState(),cookie=state.cookies.find(x=>x.name==='__Host-athyper-csrf');if(!cookie)throw Error('Missing CSRF token');
 const headers={origin:baseURL,'x-csrf-token':decodeURIComponent(cookie.value),'if-match':String(current.revision)};
 const path=step==='activate'?`/api/relay/meta-entity-authoring/releases/${current.releaseId}/${step}`:`/api/relay/meta-entity-authoring/change-sets/${id}/${step==='stage'?'graph':step==='redispatch'?'publish':step}`;
 const data=step==='stage'?JSON.parse(readFileSync('docs/examples/atlas-f5/cirrus-baseline-native-graph.json','utf8')):step==='activate'?{plane:'neon'}:{expectedRevision:current.revision,...(step==='redispatch'?{releaseId:current.releaseId}:{}),...(['publish','redispatch'].includes(step)?{targetPlanes:['neon']}:{})};
 const response=step==='stage'?await c.put(path,{headers,data}):await c.post(path,{headers,data});
 const text=await response.text();let body;try{body=JSON.parse(text);}catch{body={nonJson:true};}
 receipt.steps.push({step,actor:user,principalId:principal,observedAt:new Date().toISOString(),status:response.status(),body});
 writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({step,status:response.status(),body:step==='publish'&&response.ok()?{release:body.release,signatureAlgorithm:body.artifact?.signatureAlgorithm}:body}));if(!response.ok())process.exitCode=1;
}finally{const path=`tests/e2e/.auth/dev/studio/${user}.json`;await c.storageState({path});chmodSync(path,0o600);await c.dispose();}
