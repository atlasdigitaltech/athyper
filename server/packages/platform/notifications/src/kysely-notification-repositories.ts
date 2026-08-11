import { randomUUID } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type {
  InAppNotification,
  InAppNotificationRepository,
  PrincipalNotificationAddressDirectory,
  PushSubscription,
  PushSubscriptionRepository,
  NotificationDeliveryLedger,
  WhatsAppConsentRepository,
} from "@athyper/server-contract-notifications";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";

export type NotificationTransaction = Transaction<Record<string, never>>;
export interface KyselyNotificationRepositories extends InAppNotificationRepository,
  PrincipalNotificationAddressDirectory, WhatsAppConsentRepository, PushSubscriptionRepository, NotificationDeliveryLedger {}

export function createKyselyNotificationRepositories(
  transactions: PlaneTransactionCoordinator<NotificationTransaction>,
): KyselyNotificationRepositories {
  return {
    async create(notification) {
      return transactions.run(notification.planeKey, actor(notification), async (transaction) => {
        const eventId = randomUUID();
        const message = await sql<{id:string;created_at:Date}>`
          INSERT INTO event.notification_message
            (tenant_id,plane_key,event_id,event_code,template_key,subject,payload,priority,
             channels,recipient_count,delivered_count,status,completed_at,created_by)
          VALUES (${notification.tenantId}::uuid,${notification.planeKey},${eventId},
             'notification.direct',${notification.templateKey},${notification.subject ?? null},
             ${JSON.stringify(notification.payload)}::jsonb,'normal',ARRAY['in_app']::text[],1,1,
             'completed',now(),${notification.principalId}::uuid)
          RETURNING id,created_at`.execute(transaction);
        const row = required(message.rows[0], "notification message");
        const delivery = await sql<{id:string}>`
          INSERT INTO event.notification_delivery
            (tenant_id,message_id,recipient_id,recipient_addr,channel,status,attempt_count,
             max_attempts,sent_at,delivered_at,created_by)
          VALUES (${notification.tenantId}::uuid,${row.id}::uuid,${notification.principalId}::uuid,
             ${notification.principalId},'in_app','delivered',1,1,now(),now(),${notification.principalId}::uuid)
          RETURNING id`.execute(transaction);
        const deliveryId = required(delivery.rows[0], "notification delivery").id;
        await sql`INSERT INTO event.notification_inbox_state
          (tenant_id,message_id,delivery_id,principal_id,channel_code,created_by)
          VALUES (${notification.tenantId}::uuid,${row.id}::uuid,${deliveryId}::uuid,
            ${notification.principalId}::uuid,'in_app',${notification.principalId}::uuid)`.execute(transaction);
        return {...notification,id:row.id,createdAt:dateTime(row.created_at)};
      });
    },
    async list(input) {
      return transactions.run(input.planeKey, actor(input), async (transaction) => {
        const result = await sql<Record<string,unknown>>`
          SELECT m.id,m.tenant_id,inbox.principal_id,m.plane_key,m.template_key,m.subject,m.payload,m.created_at
          FROM event.notification_inbox_state inbox
          JOIN event.notification_message m ON m.tenant_id=inbox.tenant_id AND m.id=inbox.message_id
          WHERE inbox.tenant_id=${input.tenantId}::uuid AND inbox.principal_id=${input.principalId}::uuid
            AND inbox.dismissed_at IS NULL
          ORDER BY m.created_at DESC LIMIT ${bounded(input.limit ?? 50,1,100)}`.execute(transaction);
        return result.rows.map(inApp);
      });
    },
    async markRead(input) {
      return transactions.run(input.planeKey, actor(input), async (transaction) => {
        const result = await sql<{id:string}>`UPDATE event.notification_inbox_state
          SET read_at=COALESCE(read_at,${input.readAt}::timestamptz),
              read_by=COALESCE(read_by,${input.principalId}::uuid),updated_at=now(),updated_by=${input.principalId}::uuid
          WHERE tenant_id=${input.tenantId}::uuid AND principal_id=${input.principalId}::uuid
            AND message_id=${input.notificationId}::uuid RETURNING id`.execute(transaction);
        return result.rows.length > 0;
      });
    },
    async find(input) {
      return transactions.run(input.planeKey, actor(input), async (transaction) => {
        const result = await sql<Record<string,unknown>>`
          SELECT channel.value,channel.channel_type FROM master.contact_link channel
          JOIN control.owner_type owner_type ON owner_type.id=channel.owner_type_id
          WHERE channel.tenant_id=${input.tenantId}::uuid AND channel.owner_id=${input.principalId}::uuid
            AND owner_type.code='principal' AND channel.status='active'
            AND channel.channel_type IN ('email','phone','sms','whatsapp')
          ORDER BY channel.is_verified DESC,channel.is_primary DESC,channel.created_at ASC`.execute(transaction);
        const email=result.rows.find(row=>row["channel_type"]==="email")?.["value"];
        const phone=result.rows.find(row=>["phone","sms","whatsapp"].includes(String(row["channel_type"])))?.["value"];
        return {...(typeof email==="string"?{email}:{}),...(typeof phone==="string"?{phoneE164:phone}:{})};
      });
    },
    async findOptedIn(input) {
      return transactions.run(input.planeKey, actor(input), async (transaction) => {
        const result=await sql<{phone_e164:string}>`SELECT phone_e164 FROM event.whatsapp_consent
          WHERE tenant_id=${input.tenantId}::uuid AND principal_id=${input.principalId}::uuid
            AND consent_status='opted_in' ORDER BY consented_at DESC LIMIT 1`.execute(transaction);
        return result.rows[0]?{phoneE164:result.rows[0].phone_e164,status:"opted_in" as const}:undefined;
      });
    },
    async listActive(input) {
      return transactions.run(input.planeKey, actor(input), async (transaction) => {
        const result=await sql<Record<string,unknown>>`SELECT * FROM event.push_subscription
          WHERE tenant_id=${input.tenantId}::uuid AND principal_id=${input.principalId}::uuid
            AND plane_key=${input.planeKey} AND is_active AND (expires_at IS NULL OR expires_at>now())
          ORDER BY created_at`.execute(transaction);
        return result.rows.map(pushSubscription);
      });
    },
    async upsert(input) {
      validatePush(input);
      return transactions.run(input.planeKey, actor(input), async (transaction) => {
        const result=await sql<Record<string,unknown>>`INSERT INTO event.push_subscription
          (tenant_id,principal_id,plane_key,platform,device_id,endpoint,p256dh_key,auth_key,device_token,user_agent,created_by)
          VALUES (${input.tenantId}::uuid,${input.principalId}::uuid,${input.planeKey},${input.platform},${input.deviceId},
            ${input.endpoint},${input.p256dhKey??null},${input.authKey??null},${input.deviceToken??null},${input.userAgent??null},${input.principalId}::uuid)
          ON CONFLICT (tenant_id,principal_id,plane_key,platform,device_id) DO UPDATE SET
            endpoint=EXCLUDED.endpoint,p256dh_key=EXCLUDED.p256dh_key,auth_key=EXCLUDED.auth_key,
            device_token=EXCLUDED.device_token,user_agent=EXCLUDED.user_agent,is_active=true,
            last_used_at=now(),updated_at=now(),updated_by=EXCLUDED.principal_id
          RETURNING *`.execute(transaction);
        return pushSubscription(required(result.rows[0],"push subscription"));
      });
    },
    async deactivate(input) {
      const principalId=input.principalId;
      if(!principalId) throw new Error("Push subscription deactivation requires principalId");
      await transactions.run(input.planeKey,{tenantId:input.tenantId,principalId},transaction=>sql`
        UPDATE event.push_subscription SET is_active=false,updated_at=now(),updated_by=${principalId}::uuid,
          metadata=jsonb_set(metadata,'{deactivation_reason}',to_jsonb(${input.reason}::text),true)
        WHERE tenant_id=${input.tenantId}::uuid AND principal_id=${principalId}::uuid AND id=${input.subscriptionId}::uuid`.execute(transaction).then(()=>undefined));
    },
    async record(delivery) {
      // In-app creation persists its message, delivery and inbox projection atomically.
      if(delivery.channel==="in_app") return;
      await transactions.run(delivery.planeKey,actor(delivery),transaction=>sql`INSERT INTO event.notification_delivery
        (tenant_id,recipient_id,recipient_addr,channel,status,attempt_count,max_attempts,external_id,last_error,created_by)
        VALUES (${delivery.tenantId}::uuid,${delivery.principalId}::uuid,${delivery.principalId},${delivery.channel},
          ${delivery.status==="delivered"?"delivered":delivery.status==="failed"?"failed":"cancelled"},1,1,
          ${delivery.externalId??null},${delivery.error??null},${delivery.principalId}::uuid)`.execute(transaction).then(()=>undefined));
    },
  };
}
function actor(input:{tenantId:string;principalId:string}){return {tenantId:input.tenantId,principalId:input.principalId};}
function required<T>(value:T|undefined,name:string):T{if(!value)throw new Error(`Failed to persist ${name}`);return value;}
function bounded(value:number,min:number,max:number){if(!Number.isInteger(value)||value<min||value>max)throw new TypeError(`Value must be between ${min} and ${max}`);return value;}
function dateTime(value:unknown){return value instanceof Date?value.toISOString():new Date(String(value)).toISOString();}
function inApp(row:Record<string,unknown>):InAppNotification{return {id:String(row["id"]),tenantId:String(row["tenant_id"]),principalId:String(row["principal_id"]),planeKey:row["plane_key"] as InAppNotification["planeKey"],templateKey:String(row["template_key"]),...(row["subject"]!==null?{subject:String(row["subject"])}:{}),payload:object(row["payload"]),createdAt:dateTime(row["created_at"])};}
function pushSubscription(row:Record<string,unknown>):PushSubscription{return {id:String(row["id"]),tenantId:String(row["tenant_id"]),principalId:String(row["principal_id"]),planeKey:row["plane_key"] as PushSubscription["planeKey"],platform:row["platform"] as PushSubscription["platform"],endpoint:String(row["endpoint"]),...(typeof row["p256dh_key"]==="string"?{p256dhKey:row["p256dh_key"]}:{}),...(typeof row["auth_key"]==="string"?{authKey:row["auth_key"]}:{}),...(typeof row["device_token"]==="string"?{deviceToken:row["device_token"]}:{})};}
function object(value:unknown):Readonly<Record<string,unknown>>{if(value&&typeof value==="object"&&!Array.isArray(value))return value as Record<string,unknown>;if(typeof value==="string"){const parsed=JSON.parse(value) as unknown;if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))return parsed as Record<string,unknown>;}return {};}
function validatePush(input:{platform:string;p256dhKey?:string;authKey?:string;deviceToken?:string}){if(input.platform==="web"&&(!input.p256dhKey||!input.authKey))throw new TypeError("Web Push requires p256dh and auth keys");if(input.platform!=="web"&&!input.deviceToken)throw new TypeError("Mobile push requires a device token");}
