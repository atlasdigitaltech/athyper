import { sql, type Transaction } from "kysely";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { NotificationChannel } from "@athyper/server-contract-notifications";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";

type Tx = Transaction<Record<string, never>>;
export type NotificationDeliveryState = "pending"|"queued"|"claimed"|"sending"|"sent"|"delivered"|"failed"|"bounced"|"cancelled";
export interface NotificationDeliveryTimelineEvent { readonly type:"created"|"attempt_succeeded"|"attempt_failed"|"retry_scheduled"|"delivered"|"read"|"opened"|"clicked"|"bounced";readonly occurredAt:string;readonly attempt?:number;readonly detail?:Readonly<Record<string,unknown>>; }
export interface NotificationDeliveryTimeline { readonly deliveryId:string;readonly messageId:string;readonly tenantId:string;readonly recipientId:string|null;readonly channel:NotificationChannel;readonly status:NotificationDeliveryState;readonly attemptCount:number;readonly maxAttempts:number;readonly events:readonly NotificationDeliveryTimelineEvent[]; }
export interface NotificationReplayReceipt { readonly deliveryId:string;readonly replayKey:string;readonly replayed:boolean;readonly status:"pending"; }
export class NotificationOperationsError extends Error { constructor(readonly statusCode:403|404|409,readonly code:string,message:string){super(message);this.name="NotificationOperationsError";} }

export interface NotificationOperationsRepository {
  timeline(input:{readonly context:VerifiedRequestContext;readonly deliveryId:string;readonly recipientId?:string}):Promise<NotificationDeliveryTimeline|null>;
  replay(input:{readonly context:VerifiedRequestContext;readonly deliveryId:string;readonly replayKey:string}):Promise<NotificationReplayReceipt|null>;
}

export function createNotificationOperations(options:{readonly repository:NotificationOperationsRepository;readonly authorizer:Authorizer}) {
  return {
    subscriberTimeline(context:VerifiedRequestContext,deliveryId:string){return options.repository.timeline({context,deliveryId,recipientId:context.principalId});},
    async operatorTimeline(context:VerifiedRequestContext,deliveryId:string){await permit(options.authorizer,context,"notifications.delivery.read");return options.repository.timeline({context,deliveryId});},
    async replay(context:VerifiedRequestContext,deliveryId:string,replayKey:string){await permit(options.authorizer,context,"notifications.delivery.replay");if(!replayKey.trim()||replayKey.length>200)throw new TypeError("replayKey must contain 1-200 characters");const receipt=await options.repository.replay({context,deliveryId,replayKey:replayKey.trim()});if(!receipt)throw new NotificationOperationsError(404,"NOTIFICATION_DELIVERY_NOT_FOUND","Notification delivery was not found");return receipt;},
  };
}

export function createKyselyNotificationOperationsRepository(transactions:PlaneTransactionCoordinator<Tx>):NotificationOperationsRepository{return{
  async timeline(input){return transactions.run(input.context.planeKey,input.context,async tx=>{
    const delivery=(await sql<Record<string,unknown>>`SELECT d.id,d.message_id,d.tenant_id,d.recipient_id,d.channel,d.status,d.attempt_count,d.max_attempts,d.created_at,d.delivered_at,d.read_at,d.opened_at,d.clicked_at,d.bounced_at,d.next_retry_at FROM event.notification_delivery d JOIN event.notification_message m ON m.tenant_id=d.tenant_id AND m.id=d.message_id WHERE d.tenant_id=${input.context.tenantId}::uuid AND d.id=${input.deliveryId}::uuid AND m.plane_key=${input.context.planeKey} ${input.recipientId?sql`AND d.recipient_id=${input.recipientId}::uuid`:sql`` } LIMIT 1`.execute(tx)).rows[0];
    if(!delivery)return null;
    const attempts=(await sql<Record<string,unknown>>`SELECT created_at,is_success,duration_ms,response_status,error FROM log.notification_delivery_attempt WHERE tenant_id=${input.context.tenantId}::uuid AND delivery_id=${input.deliveryId}::uuid ORDER BY created_at,id`.execute(tx)).rows;
    return toTimeline(delivery,attempts,input.recipientId===undefined);
  });},
  async replay(input){return transactions.run(input.context.planeKey,input.context,async tx=>{
    const eventKey=`notification-replay:${input.deliveryId}:${input.replayKey}`;
    const prior=(await sql<{payload:unknown}>`SELECT payload FROM event.outbox WHERE tenant_id=${input.context.tenantId}::uuid AND event_key=${eventKey} LIMIT 1`.execute(tx)).rows[0];
    if(prior)return{deliveryId:input.deliveryId,replayKey:input.replayKey,replayed:true,status:"pending"};
    const delivery=(await sql<{id:string;message_id:string;status:string}>`SELECT d.id,d.message_id,d.status FROM event.notification_delivery d JOIN event.notification_message m ON m.tenant_id=d.tenant_id AND m.id=d.message_id WHERE d.tenant_id=${input.context.tenantId}::uuid AND d.id=${input.deliveryId}::uuid AND m.plane_key=${input.context.planeKey} FOR UPDATE`.execute(tx)).rows[0];
    if(!delivery)return null;
    if(delivery.status!=="failed"&&delivery.status!=="bounced"&&delivery.status!=="cancelled")throw new NotificationOperationsError(409,"NOTIFICATION_DELIVERY_NOT_REPLAYABLE",`Delivery in ${delivery.status} state cannot be replayed`);
    await sql`INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,aggregate_type,aggregate_id,actor_id,source,payload,created_by) VALUES(${input.context.tenantId}::uuid,'platform.notifications.delivery','notifications.delivery.replay.requested',${eventKey},'notification_delivery',${input.deliveryId}::uuid,${input.context.principalId}::uuid,'notifications.operator',${JSON.stringify({deliveryId:input.deliveryId,messageId:delivery.message_id,replayKey:input.replayKey,previousStatus:delivery.status})}::jsonb,${input.context.principalId}::uuid)`.execute(tx);
    await sql`UPDATE event.notification_delivery SET status='pending',attempt_count=0,last_error=NULL,error_category=NULL,next_retry_at=now(),locked_until=NULL,channel_detail=channel_detail-'claimed_by'-'claimed_at',metadata=metadata||${JSON.stringify({last_replay_key:input.replayKey,last_replayed_by:input.context.principalId})}::jsonb,updated_at=now(),updated_by=${input.context.principalId}::uuid WHERE tenant_id=${input.context.tenantId}::uuid AND id=${input.deliveryId}::uuid`.execute(tx);
    await sql`UPDATE event.notification_message SET status='delivering',completed_at=NULL,updated_at=now(),updated_by=${input.context.principalId}::uuid WHERE tenant_id=${input.context.tenantId}::uuid AND id=${delivery.message_id}::uuid`.execute(tx);
    return{deliveryId:input.deliveryId,replayKey:input.replayKey,replayed:false,status:"pending"};
  });}
};}

async function permit(authorizer:Authorizer,context:VerifiedRequestContext,permissionCode:string):Promise<void>{if(!(await authorizer.authorize({context,permissionCode})).allowed)throw new NotificationOperationsError(403,"FORBIDDEN",`Missing permission: ${permissionCode}`);}
function toTimeline(row:Record<string,unknown>,attempts:readonly Record<string,unknown>[],operatorDetail:boolean):NotificationDeliveryTimeline{const events:NotificationDeliveryTimelineEvent[]=[{type:"created",occurredAt:iso(row["created_at"])}];attempts.forEach((attempt,index)=>events.push({type:attempt["is_success"]===true?"attempt_succeeded":"attempt_failed",occurredAt:iso(attempt["created_at"]),attempt:index+1,detail:{durationMs:Number(attempt["duration_ms"]),...(operatorDetail&&attempt["response_status"]!=null?{responseStatus:Number(attempt["response_status"])}:{}),...(operatorDetail&&typeof attempt["error"]==="string"?{error:attempt["error"]}:{})}}));for(const [column,type] of [["delivered_at","delivered"],["read_at","read"],["opened_at","opened"],["clicked_at","clicked"],["bounced_at","bounced"]] as const)if(row[column])events.push({type,occurredAt:iso(row[column])});if(row["next_retry_at"]&&row["status"]==="failed")events.push({type:"retry_scheduled",occurredAt:iso(row["next_retry_at"])});events.sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt));return{deliveryId:String(row["id"]),messageId:String(row["message_id"]),tenantId:String(row["tenant_id"]),recipientId:row["recipient_id"]==null?null:String(row["recipient_id"]),channel:row["channel"] as NotificationChannel,status:row["status"] as NotificationDeliveryState,attemptCount:Number(row["attempt_count"]),maxAttempts:Number(row["max_attempts"]),events};}
function iso(value:unknown):string{return value instanceof Date?value.toISOString():new Date(String(value)).toISOString();}
