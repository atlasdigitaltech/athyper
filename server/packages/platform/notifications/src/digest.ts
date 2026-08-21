import { createHash } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type { JobExecutionResult, JobHandler } from "@athyper/server-contract-jobs";
import type { PlaneKey } from "@athyper/server-foundation/context";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";

export const FLUSH_NOTIFICATION_DIGEST_JOB = "notifications.flush-digest";
export type DigestFrequency = "hourly_digest" | "daily_digest" | "weekly_digest";
export interface DigestFlushRequest { readonly planeKey:PlaneKey; readonly tenantId:string; readonly principalId:string; readonly frequency:DigestFrequency; readonly batchSize?:number; }

export function createNotificationDigestHandler(options:{readonly transactions:PlaneTransactionCoordinator<Transaction<Record<string,never>>>}):JobHandler<typeof FLUSH_NOTIFICATION_DIGEST_JOB,DigestFlushRequest>{
  return {async handle(job):Promise<JobExecutionResult>{
    const request=valid(job.data);
    return options.transactions.run(request.planeKey,request,async transaction=>{
      const result=await sql<Record<string,unknown>>`SELECT id,recipient_id,channel,event_code,subject,payload,metadata,staged_at FROM event.digest_staging WHERE tenant_id=${request.tenantId}::uuid AND frequency=${request.frequency} AND delivered_at IS NULL ORDER BY recipient_id,channel,staged_at FOR UPDATE SKIP LOCKED LIMIT ${bounded(request.batchSize??500,1,1000)}`.execute(transaction);
      const groups=new Map<string,Record<string,unknown>[]>();
      for(const row of result.rows){const key=`${row["recipient_id"]}:${row["channel"]}`;const group=groups.get(key)??[];group.push(row);groups.set(key,group);}
      let created=0;
      for(const rows of groups.values()){
        const first=rows[0]!;const recipientId=String(first["recipient_id"]),channel=String(first["channel"]);const metadata=object(first["metadata"]);const address=typeof metadata["recipient_address"]==="string"?metadata["recipient_address"]:recipientId;
        const digestId=createHash("sha256").update(`${request.planeKey}:${request.tenantId}:${recipientId}:${channel}:${request.frequency}:${rows.map(row=>row["id"]).join(",")}`).digest("hex");
        const items=rows.map(row=>({eventCode:row["event_code"],subject:row["subject"],payload:object(row["payload"]),stagedAt:dateTime(row["staged_at"])}));const subject=`${items.length} notification${items.length===1?"":"s"}`;const renderedText=items.map(item=>item.subject||item.eventCode).join("\n");
        const message=await sql<{id:string}>`INSERT INTO event.notification_message (tenant_id,plane_key,event_id,event_code,template_key,subject,payload,priority,channels,recipient_count,status,metadata,created_by) VALUES (${request.tenantId}::uuid,${request.planeKey},${digestId},'notification.digest',${`notification.digest.${request.frequency}`},${subject},${JSON.stringify({frequency:request.frequency,items})}::jsonb,'normal',ARRAY[${channel}]::text[],1,'pending',${JSON.stringify({digest_frequency:request.frequency})}::jsonb,${request.principalId}::uuid) ON CONFLICT (tenant_id,plane_key,event_id) DO NOTHING RETURNING id`.execute(transaction);
        const messageId=message.rows[0]?.id;
        if(messageId){await sql`INSERT INTO event.notification_delivery (tenant_id,message_id,recipient_id,recipient_addr,channel,status,max_attempts,idempotency_key,channel_detail,created_by) VALUES (${request.tenantId}::uuid,${messageId}::uuid,${recipientId}::uuid,${address},${channel},'pending',5,${digestId},${JSON.stringify({subject,renderedText,data:{frequency:request.frequency,count:items.length}})}::jsonb,${request.principalId}::uuid)`.execute(transaction);created++;}
        await sql`UPDATE event.digest_staging SET delivered_at=now() WHERE tenant_id=${request.tenantId}::uuid AND id=ANY(${rows.map(row=>String(row["id"]))}::uuid[])`.execute(transaction);
      }
      return {status:"completed",output:{staged:result.rows.length,digests:created}};
    });
  }};
}
function valid(value:DigestFlushRequest){if(!/^[0-9a-f-]{36}$/i.test(value.tenantId)||!/^[0-9a-f-]{36}$/i.test(value.principalId)||!["studio","neon","mesh"].includes(value.planeKey)||!["hourly_digest","daily_digest","weekly_digest"].includes(value.frequency))throw new TypeError("Invalid notification digest request");return value;}
function bounded(value:number,min:number,max:number){if(!Number.isInteger(value)||value<min||value>max)throw new TypeError(`batchSize must be ${min}-${max}`);return value;}
function object(value:unknown):Record<string,unknown>{if(value&&typeof value==="object"&&!Array.isArray(value))return value as Record<string,unknown>;if(typeof value==="string")return JSON.parse(value) as Record<string,unknown>;return {};}
function dateTime(value:unknown){return value instanceof Date?value.toISOString():new Date(String(value)).toISOString();}
