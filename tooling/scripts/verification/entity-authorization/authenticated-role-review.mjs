import {readFile,writeFile,mkdir,open,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {hash,proposalHash} from './named-role-review.mjs';
import {prepareApprovalRequest,completeApprovalRequest} from './named-role-approval-workflow.mjs';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const fail=(status,code)=>Object.assign(new Error(code),{status,code});
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
async function maybeRead(path){try{return await readFile(path,'utf8');}catch(e){if(e.code==='ENOENT')return undefined;throw e;}}
/** DEV review artifacts only. Identity is supplied exclusively by verified server adapters. */
export function createAuthenticatedRoleReview(options){
 async function initial(){
  if(!options.enabled||new URL(options.origin).hostname!=='neon.dev.athyper.test')throw fail(404,'REVIEW_NOT_ENABLED');
  const [inventoryBytes,packetBytes]=await Promise.all([readFile(options.inventoryPath,'utf8'),readFile(options.packetPath,'utf8')]);
  if(hash(packetBytes)!==options.packetSha256)throw fail(409,'REVIEW_PACKET_CHANGED');
  const inventory=JSON.parse(inventoryBytes),packet=JSON.parse(packetBytes);
  if(packet.sourceSha256!==hash(inventoryBytes))throw fail(409,'REVIEW_INVENTORY_CHANGED');
  return{inventory,packet,sourceSha256:hash(inventoryBytes),initialPacketSha256:hash(packetBytes)};
 }
 async function identity(request,packet,write=false){
  const session=await options.resolveSession(request);
  if(!session?.tenantId)throw fail(401,'AUTHENTICATION_REQUIRED');
  const reviewer=packet.reviewers.find(r=>r.principalId===session.principalId&&r.homeTenantId===session.tenantId);
  if(!reviewer||session.plane!=='neon'||session.realmKey!=='athyper'||!reviewer.authorityReference||!['business','security'].every(d=>reviewer.domains.includes(d)))throw fail(403,'REVIEWER_NOT_AUTHORIZED');
  const live=await options.currentIdentity(request);
  if(live.principalId!==session.principalId||live.tenantId!==session.tenantId||live.authEpoch!==session.authEpoch)throw fail(401,'REAUTHENTICATION_REQUIRED');
  if(write){
   if(request.headers.get('origin')!==options.origin||request.headers.get('sec-fetch-site')==='cross-site')throw fail(403,'REVIEW_ORIGIN_INVALID');
   if(!session.acceptedCsrfTokens.some(t=>same(t,request.headers.get('x-csrf-token'))))throw fail(403,'REVIEW_CSRF_INVALID');
   if(session.assurance!=='elevated')throw fail(403,'REVIEW_STEP_UP_REQUIRED');
  }
  return{reviewerId:reviewer.id,principalId:session.principalId,tenantId:session.tenantId,authEpoch:session.authEpoch,assurance:session.assurance,profileHash:live.profileHash??null};
 }
 async function state(base){
  const bytes=await maybeRead(join(options.outputDirectory,'state.json'));
  if(!bytes){
   const value={createdAt:new Date().toISOString(),initialPacketSha256:base.initialPacketSha256,sourceSha256:base.sourceSha256,packet:base.packet,receipts:[]};
   await mkdir(options.outputDirectory,{recursive:true,mode:0o700});
   try{await writeFile(join(options.outputDirectory,'state.json'),JSON.stringify(value),{flag:'wx',mode:0o600});return value;}catch(e){if(e.code!=='EEXIST')throw e;return state(base);}
  }
  const value=JSON.parse(bytes);
  if(value.initialPacketSha256!==base.initialPacketSha256||value.sourceSha256!==base.sourceSha256)throw fail(409,'REVIEW_RELEASE_CHANGED');
  return value;
 }
 function reviewRequest(value,reviewerId){
  // Stable per current packet revision so reloads and MFA returns refer to the same selection.
  const request=prepareApprovalRequest(value.packet,proposalHash(value.packet),reviewerId,value.createdAt);
  const {requestSha256,...body}=request;
  const changed={...body,evidenceMode:'authenticated_neon_bff_review'};
  return{...changed,requestSha256:proposalHash(changed)};
 }
 return async function handle(request){
  let lock;
  try{
   const base=await initial(),actor=await identity(request,base.packet,request.method==='POST');
   if(request.method==='GET'){
    const value=await state(base);
    const reviewer=value.packet.reviewers.find(r=>r.id===actor.reviewerId);
    const assigned=value.packet.batches.filter(b=>!reviewer.assignedBatchIds||reviewer.assignedBatchIds.includes(b.batchId));
    const candidateIds=new Set(assigned.flatMap(b=>b.members.map(m=>m.candidateId)));
    const items=value.packet.items.filter(i=>candidateIds.has(i.candidateId));
    const common={reviewerId:actor.reviewerId,platformReviewComplete:value.packet.items.every(i=>i.approvals?.length===2),receipts:value.receipts.filter(r=>r.reviewerId===actor.reviewerId).map(r=>r.publicResult),assurance:actor.assurance};
    if(items.every(i=>i.approvals?.length===2))return json({complete:true,...common});
    return json({complete:false,request:reviewRequest(value,actor.reviewerId),items:items.map(i=>({candidateId:i.candidateId,tenant:i.tenant,principal:i.principal,group:i.group,role:i.role,scopeName:i.scopeName,proposal:i.proposal,exceptionReasons:i.exceptionReasons})),...common});
   }
   if(request.method!=='POST')return json({code:'METHOD_NOT_ALLOWED'},405);
   if(!request.headers.get('content-type')?.startsWith('application/json'))throw fail(415,'JSON_REQUIRED');
   const reader=request.body?.getReader();if(!reader)throw fail(400,'REVIEW_BODY_REQUIRED');
   const chunks=[];let size=0;
   for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>32768){await reader.cancel();throw fail(413,'REVIEW_BODY_TOO_LARGE');}chunks.push(next.value);}
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail(400,'REVIEW_BODY_INVALID');}
   if(!body||typeof body!=='object'||Object.keys(body).some(k=>!['requestSha256','approvedBatchIds','selfReviewAcknowledgedBatchIds','confirmBusiness','confirmSecurity','submissionId'].includes(k))||body.confirmBusiness!==true||body.confirmSecurity!==true||typeof body.submissionId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.submissionId)||typeof body.requestSha256!=='string'||!Array.isArray(body.approvedBatchIds)||!body.approvedBatchIds.length||body.approvedBatchIds.length>100||!Array.isArray(body.selfReviewAcknowledgedBatchIds)||body.selfReviewAcknowledgedBatchIds.length>100)throw fail(400,'REVIEW_SELECTION_REQUIRED');
   await mkdir(options.outputDirectory,{recursive:true,mode:0o700});
   try{lock=await open(join(options.outputDirectory,'.lock'),'wx',0o600);}catch(e){if(e.code==='EEXIST')throw fail(409,'REVIEW_BUSY');throw e;}
   const value=await state(base),commandHash=proposalHash({actor:actor.principalId,body});
   const previous=value.receipts.find(r=>r.submissionId===body.submissionId);
   if(previous){if(previous.commandHash!==commandHash)throw fail(409,'REVIEW_IDEMPOTENCY_CONFLICT');return json({...previous.publicResult,replayed:true});}
   const req=reviewRequest(value,actor.reviewerId);
   if(body.requestSha256!==req.requestSha256)throw fail(409,'REVIEW_REVISION_CHANGED');
   const reference=`neon-role-review:${randomUUID()}`,approvedAt=new Date().toISOString();
   let completed;try{completed=completeApprovalRequest({inventory:base.inventory,packet:value.packet,sourceSha256:base.sourceSha256,packetSha256:proposalHash(value.packet),request:req,response:{schemaVersion:1,kind:'named_role_approval_response',decision:'approve',domains:['business','security'],reviewerId:actor.reviewerId,requestSha256:body.requestSha256,approvedBatchIds:body.approvedBatchIds,selfReviewAcknowledgedBatchIds:body.selfReviewAcknowledgedBatchIds,reference,approvedAt}});}catch{throw fail(409,'REVIEW_SELECTION_OR_CONDITIONS_INVALID');}
   const current=await identity(request,base.packet,true);
   if(proposalHash(current)!==proposalHash(actor))throw fail(409,'REVIEW_AUTHORITY_CHANGED');
   const again=await initial();if(again.initialPacketSha256!==base.initialPacketSha256||again.sourceSha256!==base.sourceSha256)throw fail(409,'REVIEW_RELEASE_CHANGED');
   const publicResult={reference,approvedAt,approvedBatches:body.approvedBatchIds.length,remainingRows:completed.assessment.unresolvedRows,complete:completed.assessment.namedRoleReviewComplete,grantsChanged:false,activationAuthorized:false};
   const receipt={...completed.receipt,authenticatedReviewer:true,verifiedIdentity:actor,submissionId:body.submissionId,commandHash,publicResult};
   const updated={...value,packet:completed.packet,assessment:completed.assessment,receipts:[...value.receipts,receipt]};
   const temp=join(options.outputDirectory,`.state-${randomUUID()}.json`);
   const file=await open(temp,'wx',0o600);try{await file.writeFile(JSON.stringify(updated,null,2)+'\n');await file.sync();}finally{await file.close();}
   await rename(temp,join(options.outputDirectory,'state.json'));
   return json(publicResult,201);
  }catch(error){return json({code:error.status?error.code:'REVIEW_UNAVAILABLE',reference:randomUUID()},error.status??503);}
  finally{if(lock){await lock.close();await unlink(join(options.outputDirectory,'.lock'));}}
 };
}
