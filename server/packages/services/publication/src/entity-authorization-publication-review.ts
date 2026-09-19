import type {EntityAuthorizationPublicationInput} from './entity-authorization-compiler.js';
type ReviewPort=NonNullable<EntityAuthorizationPublicationInput['review']>;
type Coordinate=Parameters<ReviewPort['qualify']>[0];
export interface VerifiedOperationReview {
 readonly schemaVersion:1;
 readonly coordinate:Coordinate;
 readonly receiptSha256:string;
 readonly verifiedReviewerDomains:readonly ('business'|'security')[];
 readonly authorityCurrent:boolean;
 readonly expiresAt:string;
 readonly operations:readonly {readonly operation:string;readonly decision:'approved'|'deferred'|'pending';readonly reason:string;readonly regressionEvidenceSha256:readonly string[]}[];
 readonly grantChanges:readonly never[];
 readonly activationAuthorized:false;
}
/** The owning adapter MUST load authenticated, immutable review evidence and
 * revalidate reviewer authority. Do not implement readVerified from request JSON. */
export function createEntityAuthorizationPublicationReview(options:{
 readVerified(coordinate:Coordinate):Promise<VerifiedOperationReview|null>;
 now?:()=>number;
}):ReviewPort {
 return {async qualify(coordinate){
  const record=await options.readVerified(coordinate);
  if(!record||record.schemaVersion!==1||!record.authorityCurrent||record.activationAuthorized!==false||record.grantChanges.length||!['business','security'].every(d=>record.verifiedReviewerDomains.includes(d as 'business'|'security'))||!Number.isFinite(Date.parse(record.expiresAt))||Date.parse(record.expiresAt)<=(options.now?.()??Date.now()))throw Error('Publication review missing, expired or unauthorized');
  for(const key of ['releaseId','releaseNo','tenantId','plane','entityCode','contractHash','profileHash','runtimeHash','catalogHash'] as const)if(record.coordinate[key]!==coordinate[key])throw Error('Publication review revision changed');
  const sameSet=(a:readonly string[],b:readonly string[])=>new Set(a).size===a.length&&a.length===b.length&&a.every(x=>b.includes(x));
  if(!sameSet(record.coordinate.operationKeys,coordinate.operationKeys))throw Error('Publication review operation selection changed');
  const keys=record.operations.map(o=>o.operation);
  if(new Set(keys).size!==keys.length)throw Error('Duplicate operation review');
  if(!sameSet(record.operations.filter(o=>o.decision==='approved').map(o=>o.operation),coordinate.operationKeys))throw Error('Selected operations require explicit approval');
  for(const operation of record.operations){
   if(!operation.reason.trim()||operation.decision==='pending'||!operation.regressionEvidenceSha256.length||operation.regressionEvidenceSha256.some(h=>!/^[a-f0-9]{64}$/.test(h)))throw Error('Operation disposition or regression evidence unresolved');
   if(operation.decision==='deferred'&&coordinate.operationKeys.includes(operation.operation))throw Error('Deferred operation cannot be published as executable');
  }
  if(!/^[a-f0-9]{64}$/.test(record.receiptSha256))throw Error('Invalid verified review receipt');
  return{receiptSha256:record.receiptSha256};
 }};
}
