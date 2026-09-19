/** Retry compilation of the existing release through authenticated Studio API. */
import {readFileSync,writeFileSync,chmodSync} from 'node:fs';import{request}from'@playwright/test';
const releaseId='ba383d04-9a18-4e59-ab4e-3d9726e934c6',changeSetId='9f8b8fd7-cd6e-4af7-a08b-7a650d70437b';
const deployment=JSON.parse(readFileSync('governance/policy/reports/business-partner-worker-deployment.dev.json','utf8'));if(!deployment.applied||!deployment.activationHold)throw Error('Qualified worker and activation hold required');
const path='tests/e2e/.auth/catl.admin-bp-combined-publisher.json',origin='https://studio.dev.athyper.test';const client=await request.newContext({baseURL:origin,ignoreHTTPSErrors:true,storageState:path});
try{
 let csrf=(await client.storageState()).cookies.find(c=>c.name==='__Host-athyper-csrf');if(!csrf)throw Error('STUDIO_LOGIN_REQUIRED');
 await client.post('/api/auth/refresh',{headers:{origin,'x-csrf-token':decodeURIComponent(csrf.value)}});
 const session=await(await client.get('/api/auth/session')).json();if(session.state!=='authenticated'||session.principalId!=='81cd1978-2df5-5c9a-938a-2f8c291aea13'||session.tenantId!=='44444444-4444-4444-8444-444444444444')throw Error('STUDIO_LOGIN_REQUIRED');
 const responseMe=await client.get('/api/relay/iam/me'),me=await responseMe.json();if(!responseMe.ok()||me.principalId!==session.principalId||!me.permissions?.includes('metadata.entity.publish'))throw Error('CURRENT_PUBLICATION_AUTHORITY_REQUIRED');
 csrf=(await client.storageState()).cookies.find(c=>c.name==='__Host-athyper-csrf');if(!csrf)throw Error('CSRF_REQUIRED');
 const response=await client.post(`/api/relay/meta-entity-authoring/change-sets/${changeSetId}/publish`,{headers:{origin,'x-csrf-token':decodeURIComponent(csrf.value)},data:{releaseId,targetPlanes:['neon']}});
 const body=await response.json();const report={schemaVersion:1,kind:'bp_release_19_compilation_retry',recordedAt:new Date().toISOString(),releaseId,changeSetId,principalId:session.principalId,status:response.status(),response:body,grantsChanged:false,activationAuthorized:false};writeFileSync('governance/policy/reports/business-partner-release-19-retry.dev.json',JSON.stringify(report,null,2)+'\n');console.log({status:response.status(),body});if(!response.ok())throw Error('Retry not accepted');
}finally{await client.storageState({path});chmodSync(path,0o600);await client.dispose();}
