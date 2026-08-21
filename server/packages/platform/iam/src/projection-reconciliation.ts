import { createHash } from "node:crypto";
import type { PlaneKey } from "@athyper/server-foundation/context";

export type ProjectionRetryClass = "transient" | "permanent" | "stale";
export interface ProjectionReconciliationWork {
  readonly attemptId: string; readonly authorityTenantId: string; readonly projectionId: string;
  readonly desiredVersion: number; readonly desiredHash: string; readonly targetPlane: PlaneKey; readonly targetTenantId: string;
  readonly attemptNo: number; readonly jobIdentityHash: string; readonly claimTokenHash: string; readonly fencingToken: number;
  readonly desiredPayload: Readonly<Record<string, unknown>>;
}
export interface ProjectionAttemptCoordinate { readonly attemptId:string;readonly claimTokenHash:string;readonly fencingToken:number;readonly desiredVersion:number;readonly desiredHash:string }
export interface ProjectionReconciliationRepository {
  claim(input:{readonly workerId:string;readonly claimTokenHash:string;readonly claimedAt:string;readonly leaseExpiresAt:string}):Promise<ProjectionReconciliationWork|undefined>;
  current(work:ProjectionReconciliationWork):Promise<boolean>;
  start(coordinate:ProjectionAttemptCoordinate,startedAt:string):Promise<boolean>;
  succeed(coordinate:ProjectionAttemptCoordinate,input:{readonly observedAt:string;readonly receipt:Readonly<Record<string,unknown>>}):Promise<boolean>;
  fail(coordinate:ProjectionAttemptCoordinate,input:{readonly failedAt:string;readonly classification:ProjectionRetryClass;readonly errorCode:string;readonly nextAttemptAt?:string;readonly deadLetter:boolean;readonly receipt:Readonly<Record<string,unknown>>}):Promise<boolean>;
  replay(input:{readonly authorityTenantId:string;readonly deadLetterAttemptId:string;readonly actorId:string;readonly requestedAt:string}):Promise<boolean>;
  health(authorityTenantId:string):Promise<{readonly inSync:number;readonly pending:number;readonly drifted:number;readonly failed:number;readonly deadLetters:number;readonly oldestUnreconciledAt?:string}>;
}
export interface ExactPlaneProjectionApplier { apply(work:ProjectionReconciliationWork):Promise<{readonly desiredVersion:number;readonly desiredHash:string;readonly targetProjectionId:string}> }
export interface ProjectionReconciliationAlerts {
  outbox(event:{readonly authorityTenantId:string;readonly attemptId:string;readonly projectionId:string;readonly targetPlane:PlaneKey;readonly errorCode:string}):Promise<void>;
  metric(labels:{readonly targetPlane:PlaneKey;readonly classification:ProjectionRetryClass;readonly outcome:"retry"|"dead_letter"}):void;
  capture(error:unknown,context:{readonly attemptId:string;readonly projectionId:string;readonly targetPlane:PlaneKey}):void;
}

export class ProjectionReconciliationWorker {
  private readonly now:()=>Date; private readonly maxAttempts:number;
  constructor(private readonly options:{readonly workerId:string;readonly repository:ProjectionReconciliationRepository;readonly targets:ExactPlaneProjectionApplier;readonly alerts:ProjectionReconciliationAlerts;readonly now?:()=>Date;readonly maxAttempts?:number;readonly leaseMs?:number}){this.now=options.now??(()=>new Date());this.maxAttempts=options.maxAttempts??5;}
  async runOne(claimToken:string):Promise<"idle"|"succeeded"|"retry"|"dead_letter"|"stale"> {
    const claimedAt=this.now(),claimTokenHash=sha256(claimToken),leaseExpiresAt=new Date(claimedAt.getTime()+(this.options.leaseMs??60_000));
    const work=await this.options.repository.claim({workerId:this.options.workerId,claimTokenHash,claimedAt:claimedAt.toISOString(),leaseExpiresAt:leaseExpiresAt.toISOString()});
    if(!work)return"idle";
    const coordinate=coordinates(work);
    try{
      validateWork(work,claimTokenHash);
      if(!await this.options.repository.current(work))throw coded("PROJECTION_DESIRED_STATE_STALE");
      if(!await this.options.repository.start(coordinate,this.now().toISOString()))throw coded("PROJECTION_ATTEMPT_FENCE_REJECTED");
      const applied=await this.options.targets.apply(work);
      if(applied.desiredVersion!==work.desiredVersion||applied.desiredHash!==work.desiredHash)throw coded("PROJECTION_TARGET_OBSERVATION_MISMATCH");
      if(!await this.options.repository.succeed(coordinate,{observedAt:this.now().toISOString(),receipt:{targetProjectionId:applied.targetProjectionId,desiredVersion:applied.desiredVersion,desiredHash:applied.desiredHash}}))throw coded("PROJECTION_ATTEMPT_FENCE_REJECTED");
      return"succeeded";
    }catch(error){const classification=classifyProjectionFailure(error),deadLetter=classification!=="transient"||work.attemptNo>=this.maxAttempts;const next=deadLetter?undefined:new Date(this.now().getTime()+retryDelay(work.attemptNo)).toISOString();await this.fail(work,coordinate,classification,errorCode(error),next,deadLetter,error);return classification==="stale"?"stale":deadLetter?"dead_letter":"retry";}
  }
  private async fail(work:ProjectionReconciliationWork,coordinate:ProjectionAttemptCoordinate,classification:ProjectionRetryClass,errorCodeValue:string,nextAttemptAt: string|undefined,deadLetter:boolean,error?:unknown){
    const recorded=await this.options.repository.fail(coordinate,{failedAt:this.now().toISOString(),classification,errorCode:errorCodeValue,...(nextAttemptAt?{nextAttemptAt}:{}),deadLetter,receipt:{desiredVersion:work.desiredVersion,desiredHash:work.desiredHash,targetPlane:work.targetPlane}});
    if(!recorded)throw coded("PROJECTION_ATTEMPT_FENCE_REJECTED");
    this.options.alerts.metric({targetPlane:work.targetPlane,classification,outcome:deadLetter?"dead_letter":"retry"});
    if(deadLetter){this.options.alerts.capture(error??coded(errorCodeValue),{attemptId:work.attemptId,projectionId:work.projectionId,targetPlane:work.targetPlane});await this.options.alerts.outbox({authorityTenantId:work.authorityTenantId,attemptId:work.attemptId,projectionId:work.projectionId,targetPlane:work.targetPlane,errorCode:errorCodeValue});}
  }
}

export function projectionJobIdentity(work:Pick<ProjectionReconciliationWork,"projectionId"|"desiredVersion"|"desiredHash"|"targetPlane"|"targetTenantId"|"attemptNo">):string{return sha256(`${work.projectionId}:${work.desiredVersion}:${work.desiredHash}:${work.targetPlane}:${work.targetTenantId}:${work.attemptNo}`);}
export function classifyProjectionFailure(error:unknown):ProjectionRetryClass{const code=errorCode(error).toUpperCase(),message=error instanceof Error?error.message.toUpperCase():"";if(code.includes("STALE")||code.includes("FENCE")||code.includes("VERSION")||code.includes("HASH"))return"stale";if(["23503","23505","23514","22P02","22023"].includes(code)||code.includes("INVALID")||code.includes("MISMATCH")||code.includes("CONFLICT")||code.includes("CROSS_PLANE")||message.includes("INVALID")||message.includes("MISMATCH"))return"permanent";if(code.startsWith("08")||["40001","40P01","53300","57P01","57P02","57P03"].includes(code))return"transient";return"transient";}
function validateWork(work:ProjectionReconciliationWork,claimTokenHash:string){if(work.claimTokenHash!==claimTokenHash)throw coded("PROJECTION_CLAIM_TOKEN_MISMATCH");if(work.jobIdentityHash!==projectionJobIdentity(work))throw coded("PROJECTION_JOB_IDENTITY_MISMATCH");if(work.desiredVersion<1||!/^[a-f0-9]{64}$/.test(work.desiredHash)||work.fencingToken<1)throw coded("PROJECTION_WORK_INVALID");}
function coordinates(work:ProjectionReconciliationWork):ProjectionAttemptCoordinate{return{attemptId:work.attemptId,claimTokenHash:work.claimTokenHash,fencingToken:work.fencingToken,desiredVersion:work.desiredVersion,desiredHash:work.desiredHash};}
function retryDelay(attempt:number){return[5*60_000,15*60_000,60*60_000][Math.min(Math.max(attempt-1,0),2)]!;}
function errorCode(error:unknown){if(typeof error==="object"&&error&&"code"in error)return String((error as{code:unknown}).code).slice(0,160);return error instanceof Error?error.message.slice(0,160):"PROJECTION_RECONCILIATION_FAILED";}
function coded(code:string){return Object.assign(new Error(code),{code});}
function sha256(value:string){return createHash("sha256").update(value).digest("hex");}
