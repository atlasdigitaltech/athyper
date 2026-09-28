// Live acceptance: uses a real captured application session; never grants access.
import { request } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
const [plane, actor, entityType, entityId] = process.argv.slice(2);
if (!['neon','mesh','studio'].includes(plane) || !/^[a-z]+\.(admin|owner)$/.test(actor ?? '') || !/^[a-z_]+$/.test(entityType ?? '') || !/^[a-f0-9-]{36}$/.test(entityId ?? '')) throw Error('Expected plane actor entityType entityId');
const origin = `https://${plane}.dev.athyper.test`;
const client = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true, storageState: `tests/e2e/.auth/dev/${plane}/${actor}.json`, timeout: 30000 });
const marker = `COLLABACCEPTANCE${randomUUID().replaceAll('-','').toUpperCase()}`;
const attachmentId = randomUUID();
const evidence = { plane, actor, entityType, entityId, marker, attachmentId, startedAt: new Date().toISOString(), checks: [] };
function log(value) { console.log(JSON.stringify(value)); }
async function call(method, path, data, key) {
  const csrf = (await client.storageState()).cookies.find(c => c.domain === new URL(origin).hostname && ['__Host-athyper-csrf','athyper-csrf'].includes(c.name));
  const r = await client.fetch(`/api/relay${path}`, { method, headers: { origin, ...(csrf ? {'x-csrf-token':decodeURIComponent(csrf.value)} : {}), ...(key ? {'idempotency-key':key} : {}) }, ...(data !== undefined ? {data} : {}) });
  const body = r.status() === 204 ? null : await r.json();
  evidence.checks.push({method,path,status:r.status(),code:body?.code});
  if (!r.ok()) throw Error(`${method} ${path}: ${r.status()} ${body?.code ?? body?.title}`);
  return body;
}
try {
  const session = await (await client.get('/api/auth/session')).json();
  if (session.state !== 'authenticated' || session.plane !== plane) throw Error('Authenticated application session required');
  evidence.tenantId=session.tenantId; evidence.principalId=session.principalId;
  const base=`/entity-runtime/${entityType}/records/${entityId}/collaboration`;
  const comments=await call('GET',`${base}/comments`), files=await call('GET',`${base}/attachments`);
  evidence.releaseId=files.releaseId;
  if (!comments.capability.actions.some(a=>a.key==='create') || !files.capability.actions.some(a=>a.key==='preview') || !files.capability.actions.some(a=>a.key==='search')) throw Error('Required capabilities unavailable');
  const key=randomUUID();
  const posted=await call('POST','/collab/comments',{entityType,entityId,text:`[Acceptance test] ${marker}`,visibility:'private',format:'plain',attachmentIds:[],idempotencyKey:key},key);
  log({step:'comment-created',result:posted});
  evidence.commentId=posted.id ?? posted.commentId;
  if (evidence.commentId) {
    const replyKey=randomUUID();
    evidence.reply=await call('POST',`/collab/comments/${evidence.commentId}/replies`,{entityType,entityId,text:'[Acceptance test] threaded reply',visibility:'private',format:'plain',attachmentIds:[],idempotencyKey:replyKey},replyKey);
    await call('POST',`/collab/comments/${evidence.commentId}/reactions`,{code:'thumbs_up'});
    evidence.history=await call('GET',`/collab/comments/${evidence.commentId}/history`);
  }
  const require=createRequire(resolve('server/apps/platform-host/package.json'));
  const {PDFDocument,StandardFonts}=require('pdf-lib');
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
  const page=pdf.addPage();page.drawText('Synthetic collaboration acceptance document',{x:40,y:740,size:14,font});page.drawText(marker,{x:40,y:710,size:10,font});
  // The scanner deliberately rejects compressed object/xref streams.
  const bytes=Buffer.from(await pdf.save({useObjectStreams:false}));
  const staged=await call('POST','/attachments/stage',{attachmentId,fileName:`acceptance-${attachmentId.slice(0,8)}.pdf`,contentType:'application/pdf',sizeBytes:bytes.length,entityType,entityId},attachmentId);
  const upload=await client.put(staged.uploadUrl,{data:bytes,headers:{'Content-Type':'application/pdf'}});
  if(!upload.ok()) throw Error(`Object upload failed: ${upload.status()}`);
  await call('POST',`/attachments/${attachmentId}/finalize`,{contentType:'application/pdf'},attachmentId);
  log({step:'uploaded',attachmentId,commentId:evidence.commentId,marker});
  for(let attempt=0;attempt<24;attempt++) {
    const status=await call('GET',`/attachments/${attachmentId}/status`);
    evidence.processing=status;
    log({step:'processing',attempt,status});
    if(status.status==='active' && status.extractionStatus==='extracted') break;
    if(['rejected','failed','quarantined'].includes(status.status)) break;
    await new Promise(r=>setTimeout(r,5000));
  }
  const preview=await call('POST',`/attachments/${attachmentId}/preview`,{rendition:'preview_default'});
  evidence.preview={state:preview.state,contentType:preview.contentType,detail:preview.detail};
  if(preview.url) {const delivered=await client.get(preview.url);evidence.preview.deliveryStatus=delivered.status();evidence.preview.bytes=(await delivered.body()).length;}
  const search=await call('POST','/attachments/search',{entityType,entityId,q:marker});
  evidence.search={matchingAttachment:search.hits?.some(h=>h.attachmentId===attachmentId),hitCount:search.hits?.length};
  if (evidence.processing?.extractionStatus !== 'extracted' || evidence.preview.state !== 'ready' || evidence.preview.deliveryStatus !== 200 || !evidence.search.matchingAttachment)
    throw Error('Preview/extraction/content-search acceptance incomplete');
} catch(error) {evidence.error=error.message;process.exitCode=1;}
finally {log({step:'result',...evidence});await client.dispose();}
