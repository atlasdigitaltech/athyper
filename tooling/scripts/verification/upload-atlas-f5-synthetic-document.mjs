/** Explicit DEV synthetic fixture upload using an existing authenticated session. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {request} from '@playwright/test';
const state=process.argv[2];
if(!state)throw Error('Usage: upload-atlas-f5-synthetic-document.mjs <catl.admin-storage-state.json>');
const origin='https://neon.dev.athyper.test',manifestPath='docs/examples/atlas-f5/cirrus-synthetic-bp-document.manifest.json';
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
const bytes=readFileSync('docs/examples/atlas-f5/cirrus-synthetic-bp-document.txt');
assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256);
const principalId='cca94907-7519-5871-8e3c-6b11aa545c93',partnerId='f7688c3d-8c92-5651-a469-da3f4f786375';
const client=await request.newContext({baseURL:origin,ignoreHTTPSErrors:true,storageState:state});
let authenticated=false;
const save=()=>writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
async function json(response,label){const body=await response.json();if(!response.ok())throw Error(`${label}: HTTP ${response.status()} ${body.code??body.title??'request failed'}`);return body;}
try{
 const initialCsrf=(await client.storageState()).cookies.find(c=>c.domain==='neon.dev.athyper.test'&&(c.name==='__Host-athyper-csrf'||c.name==='athyper-csrf'))?.value;
 assert.ok(initialCsrf,'Authenticated CSRF cookie required');
 const refresh=await client.post('/api/auth/refresh',{headers:{origin,'x-csrf-token':decodeURIComponent(initialCsrf)}});
 assert.ok(refresh.ok(),'Neon session refresh failed');
 const session=await json(await client.get('/api/auth/session'),'session');
 assert.equal(session.state,'authenticated');assert.equal(session.tenantId,manifest.tenantId);assert.equal(session.principalId,principalId);authenticated=true;
 await json(await client.get(`/api/relay/neon/business-partners/${partnerId}/360/summary?operatingOrganizationId=a478f9c0-8226-5d22-9599-b8fb27a45180`),'parent admission');
 const csrf=(await client.storageState()).cookies.find(c=>c.domain==='neon.dev.athyper.test'&&(c.name==='__Host-athyper-csrf'||c.name==='athyper-csrf'))?.value;
 assert.ok(csrf,'Authenticated CSRF cookie required');
 const headers={origin,'x-csrf-token':decodeURIComponent(csrf)};
 if(manifest.attachmentId && manifest.status!=='upload reserved; stage pending')throw Error('An attachment is already reserved in the manifest; inspect/recover it before creating another.');
 const attachmentId=manifest.reservedAttachmentId??manifest.attachmentId??randomUUID();
 manifest.businessPartnerId=partnerId;manifest.businessPartnerCode='CATL-BP-001';manifest.intendedPrincipal='catl.admin';manifest.principalId=principalId;
 manifest.reservedAttachmentId=attachmentId;manifest.status='upload reserved; stage pending';save();
 const staged=await json(await client.post('/api/relay/attachments/stage',{headers,data:{attachmentId,fileName:manifest.file,contentType:manifest.contentType,sizeBytes:bytes.length,entityType:'business_partner',entityId:partnerId}}),'stage');
 assert.equal(staged.attachmentId,attachmentId);assert.ok(staged.uploadUrl);
 manifest.attachmentId=attachmentId;manifest.status='staged; object upload pending';save();
 // Use a separate client so application cookies cannot be sent to object storage.
 const upload=await request.newContext({ignoreHTTPSErrors:true});
 try{const r=await upload.put(staged.uploadUrl,{headers:{'content-type':manifest.contentType},data:bytes});if(!r.ok())throw Error(`object upload: HTTP ${r.status()}`);}finally{await upload.dispose();}
 manifest.status='uploaded; scan/finalization pending';save();
 await json(await client.post(`/api/relay/attachments/${attachmentId}/finalize`,{headers:{...headers},data:{contentType:manifest.contentType}}),'finalize');
 manifest.status='finalized; extraction pending';manifest.finalizedAt=new Date().toISOString();save();
 const status=await json(await client.get(`/api/relay/attachments/${attachmentId}/status`),'status');
 manifest.processingStatus=status.status;manifest.extractionStatus=status.extractionStatus;save();
 console.log(JSON.stringify({attachmentId,partnerId,principal:'catl.admin',processingStatus:status.status,extractionStatus:status.extractionStatus}));
}finally{if(authenticated){await client.storageState({path:state});chmodSync(state,0o600);}await client.dispose();}
