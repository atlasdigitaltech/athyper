import type { Redis } from "ioredis";
import type { NotificationEventPublisher,NotificationEventSubscriber,NotificationStreamEvent,NotificationStreamListener } from "@athyper/server-contract-notifications";

export interface RedisNotificationEventBus extends NotificationEventPublisher,NotificationEventSubscriber { close():Promise<void>; }

/** Cross-replica fan-out only. PostgreSQL event.notification_inbox_state remains authoritative. */
export function createRedisNotificationEventBus(client:Redis,namespace="athyper:notifications"):RedisNotificationEventBus{
  const subscriber=client.duplicate({keyPrefix:""});
  const listeners=new Map<string,Set<NotificationStreamListener>>();
  const pattern=`${namespace}:*`;
  let closed=false;
  const ready=(async()=>{if(subscriber.status==="wait")await subscriber.connect();await subscriber.psubscribe(pattern);})();
  subscriber.on("pmessage",(_pattern,channel,message)=>{const scoped=listeners.get(channel);if(!scoped)return;let event:NotificationStreamEvent;try{event=parse(message);}catch{return;}void Promise.allSettled([...scoped].map(listener=>listener(event)));});
  return {
    async publish(event){if(closed)return;await ready;await client.publish(key(namespace,event.tenantId,event.principalId),JSON.stringify(event));},
    subscribe(scope,listener){if(closed)throw new Error("Notification event bus is closed");const channel=key(namespace,scope.tenantId,scope.principalId);const scoped=listeners.get(channel)??new Set();scoped.add(listener);listeners.set(channel,scoped);let active=true;return()=>{if(!active)return;active=false;scoped.delete(listener);if(scoped.size===0)listeners.delete(channel);};},
    async close(){if(closed)return;closed=true;listeners.clear();await ready.catch(()=>undefined);await subscriber.punsubscribe(pattern).catch(()=>undefined);subscriber.disconnect();},
  };
}
function key(namespace:string,tenantId:string,principalId:string){return `${namespace}:${tenantId}:${principalId}`;}
function parse(raw:string):NotificationStreamEvent{const value=JSON.parse(raw) as Partial<NotificationStreamEvent>;if((value.type!=="notification.created"&&value.type!=="notification.read")||typeof value.tenantId!=="string"||typeof value.principalId!=="string"||typeof value.notificationId!=="string"||typeof value.occurredAt!=="string")throw new Error("Invalid notification stream event");return value as NotificationStreamEvent;}
