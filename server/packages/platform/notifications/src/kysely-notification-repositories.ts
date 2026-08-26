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
        return directInApp(notification,row.id,dateTime(row.created_at));
      });
    },
    async list(input) {
      return transactions.run(input.planeKey, actor(input), async (transaction) => {
        const position=input.cursor?decodeCursor(input.cursor):undefined;
        const result = await sql<Record<string,unknown>>`
          SELECT m.id,m.tenant_id,inbox.principal_id,m.plane_key,m.event_code,m.template_key,m.subject,m.payload,
            m.priority,m.entity_type,m.entity_id,m.created_at,inbox.read_at,inbox.dismissed_at,d.channel_detail
          FROM event.notification_inbox_state inbox
          JOIN event.notification_message m ON m.tenant_id=inbox.tenant_id AND m.id=inbox.message_id
          JOIN event.notification_delivery d ON d.tenant_id=inbox.tenant_id AND d.id=inbox.delivery_id
          WHERE inbox.tenant_id=${input.tenantId}::uuid AND inbox.principal_id=${input.principalId}::uuid
            AND inbox.dismissed_at IS NULL
            ${input.unreadOnly?sql`AND inbox.read_at IS NULL`:sql``}
            ${position?sql`AND (m.created_at,m.id)<(${position.createdAt}::timestamptz,${position.id}::uuid)`:sql``}
          ORDER BY m.created_at DESC,m.id DESC LIMIT ${bounded(input.limit ?? 50,1,100)}`.execute(transaction);
        return result.rows.map(inApp);
      });
    },
    async countUnread(input) {
      return transactions.run(input.planeKey,actor(input),async transaction=>Number((await sql<{count:string}>`SELECT count(*)::text count FROM event.notification_inbox_state WHERE tenant_id=${input.tenantId}::uuid AND principal_id=${input.principalId}::uuid AND read_at IS NULL AND dismissed_at IS NULL`.execute(transaction)).rows[0]?.count??0));
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
    async markAllRead(input) {
      return transactions.run(input.planeKey,actor(input),async transaction=>Number((await sql`UPDATE event.notification_inbox_state SET read_at=${input.readAt}::timestamptz,read_by=${input.principalId}::uuid,updated_at=now(),updated_by=${input.principalId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND principal_id=${input.principalId}::uuid AND read_at IS NULL AND dismissed_at IS NULL`.execute(transaction)).numAffectedRows));
    },
    async dismiss(input) {
      return transactions.run(input.planeKey,actor(input),async transaction=>Number((await sql`UPDATE event.notification_inbox_state SET dismissed_at=COALESCE(dismissed_at,${input.dismissedAt}::timestamptz),dismissed_by=COALESCE(dismissed_by,${input.principalId}::uuid),updated_at=now(),updated_by=${input.principalId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND principal_id=${input.principalId}::uuid AND message_id=${input.notificationId}::uuid`.execute(transaction)).numAffectedRows)>0);
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
function inApp(row:Record<string,unknown>):InAppNotification{const payload=object(row["payload"]),rendered=object(row["channel_detail"]),subject=string(row["subject"])??string(rendered["subject"]),body=string(rendered["renderedText"])??string(payload["renderedText"])??string(payload["body"])??string(payload["detail"]),href=safeHref(string(rendered["href"])??string(object(rendered["data"])["entity_url"])??string(payload["entity_url"]));return{id:String(row["id"]),tenantId:String(row["tenant_id"]),principalId:String(row["principal_id"]),planeKey:row["plane_key"] as InAppNotification["planeKey"],eventCode:String(row["event_code"]),templateKey:String(row["template_key"]),title:subject??humanize(String(row["template_key"])),...(body?{body}:{}),priority:priority(row["priority"]),...(string(row["entity_type"])?{entityType:string(row["entity_type"])}:{}),...(string(row["entity_id"])?{entityId:string(row["entity_id"])}:{}),...(href?{href}:{}),...(subject?{subject}:{}),payload,createdAt:dateTime(row["created_at"]),...(row["read_at"]?{readAt:dateTime(row["read_at"])}:{}),...(row["dismissed_at"]?{dismissedAt:dateTime(row["dismissed_at"])}:{})};}
function directInApp(notification:Parameters<InAppNotificationRepository["create"]>[0],id:string,createdAt:string):InAppNotification{const body=string(notification.payload["renderedText"])??string(notification.payload["body"]);return{id,tenantId:notification.tenantId,principalId:notification.principalId,planeKey:notification.planeKey,eventCode:"notification.direct",templateKey:notification.templateKey,title:notification.subject??humanize(notification.templateKey),...(body?{body}:{}),priority:"normal",...(notification.subject!==undefined?{subject:notification.subject}:{}),payload:notification.payload,createdAt};}
function pushSubscription(row:Record<string,unknown>):PushSubscription{return {id:String(row["id"]),tenantId:String(row["tenant_id"]),principalId:String(row["principal_id"]),planeKey:row["plane_key"] as PushSubscription["planeKey"],platform:row["platform"] as PushSubscription["platform"],endpoint:String(row["endpoint"]),...(typeof row["p256dh_key"]==="string"?{p256dhKey:row["p256dh_key"]}:{}),...(typeof row["auth_key"]==="string"?{authKey:row["auth_key"]}:{}),...(typeof row["device_token"]==="string"?{deviceToken:row["device_token"]}:{})};}
function object(value:unknown):Readonly<Record<string,unknown>>{if(value&&typeof value==="object"&&!Array.isArray(value))return value as Record<string,unknown>;if(typeof value==="string"){const parsed=JSON.parse(value) as unknown;if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))return parsed as Record<string,unknown>;}return {};}
function string(value:unknown):string|undefined{return typeof value==="string"&&value.trim()?value.trim():undefined;}
function priority(value:unknown):InAppNotification["priority"]{return ["low","normal","high","urgent"].includes(String(value))?value as InAppNotification["priority"]:"normal";}
function humanize(value:string){return value.replace(/[._-]+/g," ").replace(/\b\w/g,character=>character.toUpperCase());}
function safeHref(value:string|undefined){return value&&value.startsWith("/")&&!value.startsWith("//")?value:undefined;}
function decodeCursor(value:string){try{const parsed=JSON.parse(Buffer.from(value,"base64url").toString("utf8")) as Record<string,unknown>;return typeof parsed["createdAt"]==="string"&&typeof parsed["id"]==="string"?{createdAt:parsed["createdAt"],id:parsed["id"]}:undefined;}catch{return undefined;}}
function validatePush(input:{platform:string;p256dhKey?:string;authKey?:string;deviceToken?:string}){if(input.platform==="web"&&(!input.p256dhKey||!input.authKey))throw new TypeError("Web Push requires p256dh and auth keys");if(input.platform!=="web"&&!input.deviceToken)throw new TypeError("Mobile push requires a device token");}
