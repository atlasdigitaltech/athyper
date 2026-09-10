import {readFile,mkdir,open,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {hash,proposalHash} from './named-role-review.mjs';
const fail=(status,code)=>Object.assign(Error(code),{status,code});
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function assessOperationDecisions(packet,receipts){
 const rows=packet.rows.map(row=>{
  const decisions=packet.reviewers.map(reviewer=>receipts.flatMap(r=>r.decisions.map(d=>({...d,reviewerId:r.actor.reviewerId}))).find(d=>d.operation===row.operation&&d.reviewerId===reviewer.id&&d.proposalSha256===row.proposalSha256));
  const complete=decisions.every(Boolean),accepted=complete&&decisions.every(d=>d.decision==='approve');
  return {operation:row.operation,complete,accepted,state:!complete?'pending':accepted?(row.proposal.disposition==='defer'?'deferred':'proposal_approved'):'rejected_or_conflicting'};
 });return{rows,remainingRows:rows.filter(r=>!r.complete).length,unresolvedRows:rows.filter(r=>!r.accepted).length,proposalReviewComplete:rows.every(r=>r.accepted),publicationEligible:false,activationAuthorized:false,grantChanges:[]};
}
export function createAuthenticatedOperationReview(options){
 async function initial(){
  if(!options.enabled||options.origin!=='https://neon.dev.athyper.test')throw fail(404,'OPERATION_REVIEW_DISABLED');
  const [bytes,nbytes]=await Promise.all([readFile(options.packetPath,'utf8'),readFile(options.nominationPath,'utf8')]);const packet=JSON.parse(bytes),nomination=JSON.parse(nbytes);const {packetRevision,...body}=packet;
  if(hash(bytes)!==options.packetSha256||proposalHash(body)!==packetRevision||hash(nbytes)!==packet.nominationSha256||packet.kind!=='bp_operation_decision_packet'||packet.schemaVersion!==1)throw fail(409,'OPERATION_REVIEW_REVISION_CHANGED');
  if(!nomination.nominationOnly||nomination.activationAuthorized!==false||nomination.scope.entityCode!=='business_partner'||nomination.scope.planeKey!=='neon'||nomination.scope.tenantId!==packet.source.base.tenantId||nomination.scope.publicationKey!==packet.source.base.publicationKey||packet.rows.length!==new Set(packet.rows.map(r=>r.operation)).size||packet.rows.some(r=>proposalHash(r.proposal)!==r.proposalSha256))throw fail(409,'OPERATION_REVIEW_PACKET_INVALID');
  for(const reviewer of packet.reviewers){const r=nomination.reviewers.find(r=>r.id===reviewer.id);if(!r||r.principalId!==reviewer.principalId||r.homeTenantId!==reviewer.homeTenantId||!['business','security'].every(d=>r.domains.includes(d)))throw fail(403,'OPERATION_REVIEW_NOMINATION_CHANGED');}
  return packet;
 }
 async function actor(request,packet,write){
  const session=await options.resolveSession(request);if(!session?.tenantId)throw fail(401,'AUTHENTICATION_REQUIRED');
  const reviewer=packet.reviewers.find(r=>r.principalId===session.principalId&&r.homeTenantId===session.tenantId);
  if(!reviewer||session.plane!=='neon'||session.realmKey!=='athyper')throw fail(403,'OPERATION_REVIEWER_NOT_AUTHORIZED');
  const live=await options.currentIdentity(request);if(live.principalId!==session.principalId||live.tenantId!==session.tenantId||live.authEpoch!==session.authEpoch)throw fail(401,'REAUTHENTICATION_REQUIRED');
  if(write){if(request.headers.get('origin')!==options.origin||request.headers.get('sec-fetch-site')==='cross-site')throw fail(403,'REVIEW_ORIGIN_INVALID');if(!session.acceptedCsrfTokens?.some(t=>same(t,request.headers.get('x-csrf-token'))))throw fail(403,'REVIEW_CSRF_INVALID');if(session.assurance!=='elevated')throw fail(403,'REVIEW_STEP_UP_REQUIRED');}
  return{reviewerId:reviewer.id,principalId:session.principalId,tenantId:session.tenantId,authEpoch:session.authEpoch,profileHash:live.profileHash??null,assurance:session.assurance};
 }
 async function state(packet){try{const s=JSON.parse(await readFile(join(options.outputDirectory,'state.json'),'utf8'));if(s.packetRevision!==packet.packetRevision)throw fail(409,'OPERATION_REVIEW_STATE_REVISION_CHANGED');return s;}catch(e){if(e.code==='ENOENT')return{schemaVersion:1,packetRevision:packet.packetRevision,receipts:[]};throw e;}}
 return async request=>{let lock;try{
  const packet=await initial(),identity=await actor(request,packet,request.method==='POST');
  if(request.method==='GET'){const s=await state(packet);return json({reviewerId:identity.reviewerId,assurance:identity.assurance,packetRevision:packet.packetRevision,rows:packet.rows,receipts:s.receipts.map(r=>({reference:r.reference,reviewerId:r.actor.reviewerId,recordedAt:r.recordedAt,decisions:r.decisions})),assessment:assessOperationDecisions(packet,s.receipts)});}
  if(request.method!=='POST')throw fail(405,'METHOD_NOT_ALLOWED');
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw fail(415,'JSON_REQUIRED');
  const reader=request.body?.getReader();if(!reader)throw fail(400,'BODY_REQUIRED');let size=0;const chunks=[];for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>65536){await reader.cancel();throw fail(413,'BODY_TOO_LARGE');}chunks.push(next.value);}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail(400,'INVALID_JSON');}
  if(!body||Object.keys(body).some(k=>!['packetRevision','submissionId','decisions','confirmBusiness','confirmSecurity'].includes(k))||body.packetRevision!==packet.packetRevision||body.confirmBusiness!==true||body.confirmSecurity!==true||!/^\w{8}-[\da-f-]{27}$/i.test(body.submissionId??'')||!Array.isArray(body.decisions)||!body.decisions.length||body.decisions.length>packet.rows.length)throw fail(400,'EXPLICIT_REVISION_BOUND_DECISION_REQUIRED');
  if(new Set(body.decisions.map(d=>d.operation)).size!==body.decisions.length)throw fail(400,'DUPLICATE_DECISIONS');
  for(const d of body.decisions){const row=packet.rows.find(r=>r.operation===d.operation);if(!row||d.proposalSha256!==row.proposalSha256||!['approve','reject'].includes(d.decision)||typeof d.reason!=='string'||!d.reason.trim()||d.reason.length>2000||Object.keys(d).some(k=>!['operation','proposalSha256','decision','reason'].includes(k)))throw fail(400,'INVALID_OPERATION_DECISION');}
  await mkdir(options.outputDirectory,{recursive:true,mode:0o700});try{lock=await open(join(options.outputDirectory,'.lock'),'wx',0o600);}catch(e){if(e.code==='EEXIST')throw fail(409,'REVIEW_BUSY');throw e;}
  const s=await state(packet),commandHash=proposalHash({principalId:identity.principalId,body});const previous=s.receipts.find(r=>r.submissionId===body.submissionId);if(previous){if(previous.commandHash!==commandHash)throw fail(409,'IDEMPOTENCY_CONFLICT');return json({reference:previous.reference,replayed:true,assessment:assessOperationDecisions(packet,s.receipts)});}
  if(s.receipts.some(r=>r.actor.reviewerId===identity.reviewerId&&r.decisions.some(d=>body.decisions.some(n=>n.operation===d.operation))))throw fail(409,'EXISTING_DECISION_REQUIRES_NEW_PROPOSAL_REVISION');
  const current=await actor(request,packet,true);if(proposalHash(current)!==proposalHash(identity)||(await initial()).packetRevision!==packet.packetRevision)throw fail(409,'REVIEW_AUTHORITY_OR_REVISION_CHANGED');
  const receipt={reference:`neon-operation-review:${randomUUID()}`,recordedAt:new Date().toISOString(),packetRevision:packet.packetRevision,nominationSha256:packet.nominationSha256,actor:identity,domains:['business','security'],decisions:body.decisions,submissionId:body.submissionId,commandHash,authenticatedReviewer:true,grantChanges:[],activationAuthorized:false};
  const updated={...s,receipts:[...s.receipts,receipt]};const temp=join(options.outputDirectory,`.state-${randomUUID()}.json`);const file=await open(temp,'wx',0o600);try{await file.writeFile(JSON.stringify(updated,null,2)+'\n');await file.sync();}finally{await file.close();}await rename(temp,join(options.outputDirectory,'state.json'));
  return json({reference:receipt.reference,assessment:assessOperationDecisions(packet,updated.receipts)},201);
 }catch(e){return json({code:e.status?e.code:'OPERATION_REVIEW_UNAVAILABLE',reference:randomUUID()},e.status??503);}finally{if(lock){await lock.close();await unlink(join(options.outputDirectory,'.lock'));}}};
}
