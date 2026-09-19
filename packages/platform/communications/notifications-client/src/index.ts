import { parseInstant } from "@athyper/platform-temporal";
import { createOperation, encodePathSegment, type HttpClient } from "@athyper/platform-api-client";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";
export interface NotificationItem {
  readonly id: string; readonly tenantId: string; readonly principalId: string; readonly planeKey: string;
  readonly templateKey: string; readonly eventCode: string; readonly title: string; readonly body?: string;
  readonly priority: NotificationPriority; readonly entityType?: string; readonly entityId?: string; readonly href?: string;
  readonly subject?: string; readonly payload: Readonly<Record<string, unknown>>;
  readonly readAt?: string; readonly dismissedAt?: string; readonly createdAt: string;
}
export interface NotificationInboxPage { readonly notifications: readonly NotificationItem[]; readonly unreadCount: number; readonly nextCursor?: string; }
export interface NotificationCounts { readonly unread: number; }
export interface NotificationReadAllResult { readonly updated: number; readonly readAt: string; }
export interface NotificationStreamEvent { readonly type: "notification.created" | "notification.read" | "notification.refresh" | "notification.delivery"; readonly tenantId: string; readonly principalId: string; readonly notificationId?: string; readonly deliveryId?: string; readonly deliveryStatus?: "sent" | "delivered" | "bounced" | "failed"; readonly occurredAt: string; }
export type NotificationChannel="in_app"|"email"|"sms"|"push"|"whatsapp";
export interface NotificationPreference{readonly tenantId:string;readonly principalId:string;readonly eventCode:string;readonly channels:readonly NotificationChannel[];readonly version:number;}
export interface NotificationPreferenceInput{readonly eventCode:string;readonly channels:readonly NotificationChannel[];}
export interface NotificationPreferenceSnapshot{readonly preferences:readonly NotificationPreference[];readonly version:number;}
export interface NotificationPreferencePreview{readonly eventCode:string;readonly channels:readonly {readonly channel:NotificationChannel;readonly enabled:boolean;readonly supported:boolean;readonly consented:boolean;readonly reason:"enabled"|"unsupported"|"consent_required";}[];}
export interface PushSubscriptionInput{readonly platform:"web"|"android"|"ios";readonly deviceId:string;readonly endpoint:string;readonly p256dhKey?:string;readonly authKey?:string;readonly deviceToken?:string;}
export interface PushConfiguration{readonly webPush:{readonly available:boolean;readonly publicKey?:string;};}
export interface PushSubscriptionRecord{readonly id:string;readonly endpoint:string;readonly platform:"web"|"android"|"ios";}

export const notificationInboxOperation = createOperation<NotificationInboxPage>({ method: "GET", path: "/api/notifications/inbox", parse: parseInbox });
export const notificationCountsOperation = createOperation<NotificationCounts>({ method: "GET", path: "/api/notifications/counts", parse: parseCounts, requestClass: "background" });
export const notificationReadOperation = createOperation<void>({ method: "POST", path: ({ id }) => `/api/notifications/${encodePathSegment(id)}/read`, response: "void",idempotency:"required" });
export const notificationReadAllOperation = createOperation<NotificationReadAllResult>({ method: "POST", path: "/api/notifications/read-all", parse: parseReadAll,idempotency:"required" });
export const notificationDismissOperation = createOperation<void>({ method: "POST", path: ({ id }) => `/api/notifications/${encodePathSegment(id)}/dismiss`, response: "void",idempotency:"required" });
export const notificationPreferencesOperation=createOperation<NotificationPreferenceSnapshot>({method:"GET",path:"/api/notifications/preferences",parse:parsePreferences});
export const notificationPreferencesUpdateOperation=createOperation<NotificationPreferenceSnapshot,{readonly preferences:readonly NotificationPreferenceInput[]}>({method:"PATCH",path:"/api/notifications/preferences",parse:parsePreferences});
export const notificationPreferencesPreviewOperation=createOperation<{readonly previews:readonly NotificationPreferencePreview[]},{readonly preferences:readonly NotificationPreferenceInput[]}>({method:"POST",path:"/api/notifications/preferences/preview",parse:parsePreviews});
export const notificationPushConfigurationOperation=createOperation<PushConfiguration>({method:"GET",path:"/api/notifications/push-configuration",parse:parsePushConfiguration});
export const notificationPushSubscribeOperation=createOperation<PushSubscriptionRecord,PushSubscriptionInput>({method:"POST",path:"/api/notifications/push-subscriptions",parse:parsePushSubscription});
export const notificationPushUnsubscribeOperation=createOperation<void>({method:"DELETE",path:({id})=>`/api/notifications/push-subscriptions/${encodePathSegment(id)}`,response:"void"});

export interface NotificationClient {
  list(options?: { readonly limit?: number; readonly cursor?: string; readonly unreadOnly?: boolean; readonly signal?: AbortSignal }): Promise<NotificationInboxPage>;
  counts(signal?: AbortSignal): Promise<NotificationCounts>;
  markRead(id: string, signal?: AbortSignal): Promise<void>;
  markAllRead(signal?: AbortSignal): Promise<NotificationReadAllResult>;
  dismiss(id: string, signal?: AbortSignal): Promise<void>;
  stream(signal?: AbortSignal): Promise<ReadableStream<Uint8Array>>;
  preferences(signal?:AbortSignal):Promise<NotificationPreferenceSnapshot>;
  updatePreferences(input:readonly NotificationPreferenceInput[],version:number,signal?:AbortSignal):Promise<NotificationPreferenceSnapshot>;
  previewPreferences(input:readonly NotificationPreferenceInput[],signal?:AbortSignal):Promise<readonly NotificationPreferencePreview[]>;
  pushConfiguration(signal?:AbortSignal):Promise<PushConfiguration>;
  subscribePush(input:PushSubscriptionInput,signal?:AbortSignal):Promise<PushSubscriptionRecord>;
  unsubscribePush(id:string,signal?:AbortSignal):Promise<void>;
}
export function createNotificationClient(client: HttpClient): NotificationClient { const implementation:NotificationClient={
  list: (options = {}) => client.request(notificationInboxOperation, { signal: options.signal, query: { limit: options.limit ?? 50, cursor: options.cursor, unread: options.unreadOnly } }),
  counts: (signal) => client.request(notificationCountsOperation, { signal }),
  markRead: (id, signal) => client.request(notificationReadOperation, { params: { id },idempotencyKey:`notification-read:${id}`, signal }),
  markAllRead: (signal) => client.request(notificationReadAllOperation, { idempotencyKey:`notification-read-all:${Date.now()}`,signal }),
  dismiss: (id, signal) => client.request(notificationDismissOperation, { params: { id },idempotencyKey:`notification-dismiss:${id}`, signal }),
  stream: (signal) => client.requestStream("/api/notifications/stream", { signal }),
  preferences:(signal)=>client.request(notificationPreferencesOperation,{signal}),
  updatePreferences:(preferences,version,signal)=>client.request(notificationPreferencesUpdateOperation,{body:{preferences},headers:{"If-Match":`"${version}"`},signal}),
  previewPreferences:async(preferences,signal)=>(await client.request(notificationPreferencesPreviewOperation,{body:{preferences},signal})).previews,
  pushConfiguration:(signal)=>client.request(notificationPushConfigurationOperation,{signal}),
  subscribePush:(input,signal)=>client.request(notificationPushSubscribeOperation,{body:input,signal}),
  unsubscribePush:(id,signal)=>client.request(notificationPushUnsubscribeOperation,{params:{id},signal}),
};return Object.freeze(implementation); }

export async function consumeNotificationStream(stream: ReadableStream<Uint8Array>, onEvent: (event: NotificationStreamEvent) => void, signal?: AbortSignal): Promise<void> {
  const reader=stream.getReader(),decoder=new TextDecoder();let buffer="";const abort=()=>void reader.cancel(signal?.reason);signal?.addEventListener("abort",abort,{once:true});
  try { while(!signal?.aborted){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true}).replace(/\r\n/g,"\n");let boundary=buffer.indexOf("\n\n");while(boundary>=0){const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const data=block.split("\n").filter((line)=>line.startsWith("data:")).map((line)=>line.slice(5).trimStart()).join("\n");if(data){try{onEvent(parseStreamEvent(JSON.parse(data)));}catch{/* a later event or poll heals malformed input */}}boundary=buffer.indexOf("\n\n");}} }
  finally { signal?.removeEventListener("abort",abort);reader.releaseLock(); }
}

function parseInbox(value:unknown):NotificationInboxPage{const body=record(value,"notification inbox");if(!Array.isArray(body.notifications))throw new TypeError("notifications must be an array");const nextCursor=optional(body.nextCursor);return Object.freeze({notifications:Object.freeze(body.notifications.map(parseNotification)),unreadCount:nonNegative(body.unreadCount,"unreadCount"),...(nextCursor?{nextCursor}:{})});}
function parseNotification(value:unknown):NotificationItem{const body=record(value,"notification"),priority=body.priority;if(!["low","normal","high","urgent"].includes(String(priority)))throw new TypeError("Invalid notification priority");return Object.freeze({id:required(body.id,"id"),tenantId:required(body.tenantId,"tenantId"),principalId:required(body.principalId,"principalId"),planeKey:required(body.planeKey,"planeKey"),templateKey:required(body.templateKey,"templateKey"),eventCode:required(body.eventCode,"eventCode"),title:required(body.title,"title"),priority:priority as NotificationPriority,payload:record(body.payload,"payload"),...(optional(body.subject)?{subject:optional(body.subject)}:{}),createdAt:date(body.createdAt,"createdAt"),...optionals(body,["body","entityType","entityId","href","readAt","dismissedAt"] as const)});}
function parseCounts(value:unknown):NotificationCounts{return Object.freeze({unread:nonNegative(record(value,"notification counts").unread,"unread")});}
function parseReadAll(value:unknown):NotificationReadAllResult{const body=record(value,"read-all result");return Object.freeze({updated:nonNegative(body.updated,"updated"),readAt:date(body.readAt,"readAt")});}
function parsePreferences(value:unknown):NotificationPreferenceSnapshot{const body=record(value,"notification preferences");if(!Array.isArray(body.preferences))throw new TypeError("preferences must be an array");return Object.freeze({preferences:Object.freeze(body.preferences.map((value)=>{const item=record(value,"preference");return Object.freeze({tenantId:required(item.tenantId,"tenantId"),principalId:required(item.principalId,"principalId"),eventCode:required(item.eventCode,"eventCode"),channels:channels(item.channels),version:nonNegative(item.version,"version")});})),version:nonNegative(body.version,"version")});}
function parsePreviews(value:unknown):{readonly previews:readonly NotificationPreferencePreview[]}{const body=record(value,"preference previews");if(!Array.isArray(body.previews))throw new TypeError("previews must be an array");return Object.freeze({previews:Object.freeze(body.previews.map((value)=>{const preview=record(value,"preference preview");if(!Array.isArray(preview.channels))throw new TypeError("preview channels must be an array");return Object.freeze({eventCode:required(preview.eventCode,"eventCode"),channels:Object.freeze(preview.channels.map((value)=>{const item=record(value,"channel preview"),channel=channels([item.channel])[0]!,reason=item.reason;if(!["enabled","unsupported","consent_required"].includes(String(reason)))throw new TypeError("Invalid preview reason");return Object.freeze({channel,enabled:Boolean(item.enabled),supported:Boolean(item.supported),consented:Boolean(item.consented),reason:reason as NotificationPreferencePreview["channels"][number]["reason"]});}))});}))});}
function parsePushConfiguration(value:unknown):PushConfiguration{const body=record(value,"push configuration"),webPush=record(body.webPush,"webPush configuration"),available=webPush.available;if(typeof available!=="boolean")throw new TypeError("webPush.available must be a boolean");const publicKey=optional(webPush.publicKey);if(available&&!publicKey)throw new TypeError("Available Web Push configuration requires a public key");return Object.freeze({webPush:Object.freeze({available,...(publicKey?{publicKey}:{})})});}
function parsePushSubscription(value:unknown):PushSubscriptionRecord{const body=record(value,"push subscription"),platform=required(body.platform,"platform");if(!["web","android","ios"].includes(platform))throw new TypeError("Invalid push subscription platform");return Object.freeze({id:required(body.id,"id"),endpoint:required(body.endpoint,"endpoint"),platform:platform as PushSubscriptionRecord["platform"]});}
function channels(value:unknown):readonly NotificationChannel[]{if(!Array.isArray(value))throw new TypeError("channels must be an array");return Object.freeze(value.map((channel)=>{if(!["in_app","email","sms","push","whatsapp"].includes(String(channel)))throw new TypeError("Invalid notification channel");return channel as NotificationChannel;}));}
function parseStreamEvent(value:unknown):NotificationStreamEvent{const body=record(value,"stream event"),type=body.type;if(!["notification.created","notification.read","notification.refresh","notification.delivery"].includes(String(type)))throw new TypeError("Invalid stream event");const notificationId=optional(body.notificationId),deliveryId=optional(body.deliveryId),deliveryStatus=optional(body.deliveryStatus);if(type==="notification.delivery"&&(!deliveryId||!["sent","delivered","bounced","failed"].includes(deliveryStatus??"")))throw new TypeError("Invalid notification delivery stream event");return Object.freeze({type:type as NotificationStreamEvent["type"],tenantId:required(body.tenantId,"tenantId"),principalId:required(body.principalId,"principalId"),occurredAt:date(body.occurredAt,"occurredAt"),...(notificationId?{notificationId}:{}),...(deliveryId?{deliveryId}:{}),...(deliveryStatus?{deliveryStatus:deliveryStatus as NotificationStreamEvent["deliveryStatus"]}:{})});}
function record(value:unknown,name:string):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw new TypeError(`${name} must be an object`);return value as Record<string,unknown>;}
function required(value:unknown,name:string):string{if(typeof value!=="string"||!value.trim())throw new TypeError(`${name} must be a non-empty string`);return value;}
function optional(value:unknown):string|undefined{return typeof value==="string"&&value.trim()?value:undefined;}
function nonNegative(value:unknown,name:string):number{if(!Number.isSafeInteger(value)||Number(value)<0)throw new TypeError(`${name} must be a non-negative integer`);return Number(value);}
function date(value:unknown,name:string):string{const result=required(value,name);if(!Number.isFinite(parseInstant(result)))throw new TypeError(`${name} must be an ISO date`);return result;}
function optionals<const K extends readonly string[]>(body:Record<string,unknown>,keys:K):Partial<Record<K[number],string>>{return Object.fromEntries(keys.flatMap((key)=>optional(body[key])?[[key,optional(body[key])]]:[])) as Partial<Record<K[number],string>>;}
