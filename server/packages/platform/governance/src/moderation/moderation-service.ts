import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { OutboxWriter } from "@athyper/server-contract-events";
import type { CommentModerationRecord, CommentModerationRepository, DismissModerationCommand, ModerationService, ResolveModerationCommand, ReviewModerationCommand } from "@athyper/server-contract-governance";
import { assertExactPlaneTransaction, type ExactPlaneTransaction, type PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { ExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";

export function createModerationService<Transaction>(options:{readonly transactions:PlaneTransactionCoordinator<ExactPlaneTransaction<Transaction>>;readonly repositories:ExactPlaneRepositoryProvider<CommentModerationRepository<Transaction>>;readonly audit:AuditRecorder<Transaction>;readonly outbox:OutboxWriter<Transaction>;readonly now?:()=>Date}):ModerationService<Transaction>{
  const transition=async(command:ReviewModerationCommand|ResolveModerationCommand|DismissModerationCommand,kind:"review"|"resolve"|"dismiss"):Promise<CommentModerationRecord>=>{
    validateReason(command.reasonCode);validateEvidence(command.reviewerEvidence);
    const note="note" in command?command.note?.trim():undefined;
    if(note&&note.length>4_000)throw new TypeError("Moderation notes cannot exceed 4000 characters");
    if(kind==="resolve"&&"decision" in command){if(!["approved","rejected","removed"].includes(command.decision))throw new TypeError("Invalid moderation decision");if(command.decision==="removed"&&!note)throw new TypeError("Removed comments require a moderation note");}
    const at=(options.now?.()??new Date()).toISOString();
    const repository=options.repositories.require(command.context.planeKey);
    return options.transactions.run(command.context.planeKey,{tenantId:command.context.tenantId,principalId:command.context.principalId},async transaction=>{
      const params=kind==="review"
        ?{from:["open"] as const,to:"reviewing" as const,flagFrom:["open"] as const,flagStatus:"reviewing" as const}
        :kind==="dismiss"
          ?{from:["open","reviewing"] as const,to:"approved" as const,flagFrom:["open","reviewing"] as const,flagStatus:"dismissed" as const}
          :{from:["reviewing"] as const,to:(command as ResolveModerationCommand).decision,flagFrom:["reviewing"] as const,flagStatus:"resolved" as const};
      const result=await repository.transition({tenantId:command.context.tenantId,moderationId:command.moderationId,reviewerPrincipalId:command.context.principalId,...params,...(kind==="resolve"?{decisionCode:(command as ResolveModerationCommand).decision}:{}),reasonCode:command.reasonCode,...(note?{decisionNote:note}:{}),reviewerEvidence:command.reviewerEvidence,changedAt:at},transaction);
      if(!result)throw new Error("GOVERNANCE_INVALID_TRANSITION");
      await evidence(options,command,result,kind,transaction);return result;
    });
  };
  return {
    async open(command,transaction){
      const repository=options.repositories.require(command.context.planeKey);
      const work=async(tx:Transaction)=>{assertExactPlaneTransaction(tx,command.context.planeKey);const result=await repository.createOrReplayOpen({tenantId:command.context.tenantId,commentFlagId:command.commentFlagId,createdBy:command.context.principalId,reviewerEvidence:command.reviewerEvidence??{}},tx);if(!result.replayed)await evidence(options,command,result,"open",tx);return result;};
      return transaction?work(transaction):options.transactions.run(command.context.planeKey,{tenantId:command.context.tenantId,principalId:command.context.principalId},work);
    },
    review:command=>transition(command,"review"),resolve:command=>transition(command,"resolve"),dismiss:command=>transition(command,"dismiss"),
  };
}

async function evidence<Transaction>(options:{readonly audit:AuditRecorder<Transaction>;readonly outbox:OutboxWriter<Transaction>},command:{readonly context:ReviewModerationCommand["context"];readonly reviewerEvidence?:Readonly<Record<string,unknown>>},result:CommentModerationRecord,action:string,transaction:Transaction):Promise<void>{const eventType=`governance.comment_moderation.${action}`;await options.outbox.append({tenantId:command.context.tenantId,topic:"governance",eventType,eventKey:`${result.id}:${action}:${result.status}`,aggregateType:"governance.comment_moderation",aggregateId:result.id,actorId:command.context.principalId,payload:{moderationId:result.id,commentFlagId:result.commentFlagId,status:result.status,reviewerEvidence:command.reviewerEvidence??{}}},transaction);await options.audit.record({eventCode:eventType,action,outcome:"success",actor:{kind:"user",principalId:command.context.principalId},tenantId:command.context.tenantId,entityType:"governance.comment_moderation",entityId:result.id,requestId:command.context.requestId,...(command.context.correlationId?{correlationId:command.context.correlationId}:{}),metadata:{commentFlagId:result.commentFlagId,status:result.status,reviewerEvidence:command.reviewerEvidence??{}}},transaction);}
function validateReason(value:string):void{if(!/^[a-z][a-z0-9_.-]{1,62}$/.test(value))throw new TypeError("Invalid moderation reason code");}
function validateEvidence(value:Readonly<Record<string,unknown>>):void{if(!value||Array.isArray(value)||Object.keys(value).length===0)throw new TypeError("Reviewer evidence is required");}
