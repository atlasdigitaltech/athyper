import { HttpError } from "@athyper/server-runtime-http";
import { sql, type Transaction } from "kysely";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type {
  NotificationPreference,
  NotificationPreferenceStore,
  PreferenceCapabilities,
  PreferenceChannel,
  PreferenceInvalidationPublisher,
  PreferencePlane,
} from "./notification-preferences.js";
type Tx = Transaction<Record<string, never>>;
type Scope = {
  tenantId: string;
  principalId: string;
  planeKey: PreferencePlane;
};
export function createKyselyNotificationPreferenceStore(
  transactions: PlaneTransactionCoordinator<Tx>,
): NotificationPreferenceStore {
  return {
    async get(s) {
      return transactions.run(s.planeKey, s, (tx) => read(tx, s));
    },
    async replace(s, items, expected) {
      return transactions.run(s.planeKey, s, async (tx) => {
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${s.tenantId}:${s.principalId}:notification-preferences`},0))`.execute(
          tx,
        );
        const current = await read(tx, s);
        if (current.version !== expected) return undefined;
        await sql`UPDATE master.principal_notification_preference SET status='inactive',status_changed_at=now(),status_changed_by=${s.principalId}::uuid,updated_at=now(),updated_by=${s.principalId}::uuid WHERE tenant_id=${s.tenantId}::uuid AND principal_id=${s.principalId}::uuid AND status='active' AND is_enabled IS TRUE`.execute(
          tx,
        );
        for (const item of items)
          for (const channel of item.channels)
            await sql`INSERT INTO master.principal_notification_preference(tenant_id,principal_id,event_code,channel,is_enabled,status,created_by) VALUES(${s.tenantId}::uuid,${s.principalId}::uuid,${item.eventCode},${channel},true,'active',${s.principalId}::uuid) ON CONFLICT (tenant_id,principal_id,event_code,channel) DO UPDATE SET is_enabled=true,status='active',status_changed_at=now(),status_changed_by=EXCLUDED.principal_id,updated_at=now(),updated_by=EXCLUDED.principal_id`.execute(
              tx,
            );
        await sql`INSERT INTO master.principal_notification_preference(tenant_id,principal_id,event_code,channel,is_enabled,status,created_by) VALUES(${s.tenantId}::uuid,${s.principalId}::uuid,'platform.preferences.version','in_app',false,'inactive',${s.principalId}::uuid) ON CONFLICT (tenant_id,principal_id,event_code,channel) DO UPDATE SET is_enabled=false,status='inactive',updated_at=now(),updated_by=EXCLUDED.principal_id`.execute(
          tx,
        );
        const snapshot = await read(tx, s);
        await writeInvalidation(tx, {
          type: "notification.preferences.invalidated",
          ...s,
          version: snapshot.version,
          occurredAt: new Date().toISOString(),
        });
        return snapshot;
      });
    },
  };
}
async function read(tx: Tx, s: Scope) {
  const rows = (
    await sql<
      Record<string, unknown>
    >`SELECT event_code,channel,status,is_enabled,xmin::text::bigint version FROM master.principal_notification_preference WHERE tenant_id=${s.tenantId}::uuid AND principal_id=${s.principalId}::uuid ORDER BY event_code,channel`.execute(
      tx,
    )
  ).rows;
  const grouped = new Map<
    string,
    { channels: PreferenceChannel[]; version: number }
  >();
  let version = 0;
  for (const r of rows) {
    version = Math.max(version, Number(r["version"]));
    if (r["status"] !== "active" || r["is_enabled"] !== true) continue;
    const key = String(r["event_code"]),
      g = grouped.get(key) ?? { channels: [], version: 0 };
    g.channels.push(r["channel"] as PreferenceChannel);
    g.version = Math.max(g.version, Number(r["version"]));
    grouped.set(key, g);
  }
  const preferences: NotificationPreference[] = [...grouped].map(
    ([eventCode, g]) => ({
      tenantId: s.tenantId,
      principalId: s.principalId,
      eventCode,
      channels: g.channels,
      version: g.version,
    }),
  );
  return { preferences, version };
}
export function createKyselyPreferenceCapabilities(
  transactions: PlaneTransactionCoordinator<Tx>,
): PreferenceCapabilities {
  return {
    async supports(s, c) {
      if (c === "in_app") return true;
      return transactions.run(s.planeKey, s, async (tx) => {
        if (c === "push")
          return (
            (
              await sql`SELECT 1 FROM event.push_subscription WHERE tenant_id=${s.tenantId}::uuid AND principal_id=${s.principalId}::uuid AND plane_key=${s.planeKey} AND is_active LIMIT 1`.execute(
                tx,
              )
            ).rows.length > 0
          );
        const types =
          c === "email"
            ? ["email"]
            : c === "sms"
              ? ["sms", "phone"]
              : ["whatsapp", "phone"];
        return (
          (
            await sql`SELECT 1 FROM master.contact_link l JOIN control.owner_type o ON o.id=l.owner_type_id WHERE l.tenant_id=${s.tenantId}::uuid AND l.owner_id=${s.principalId}::uuid AND o.code='principal' AND l.status='active' AND l.is_verified AND l.effective_from<=now() AND (l.effective_until IS NULL OR l.effective_until>now()) AND l.channel_type=ANY(${types}::text[]) LIMIT 1`.execute(
              tx,
            )
          ).rows.length > 0
        );
      });
    },
    async hasConsent(s, c) {
      if (c !== "whatsapp") return true;
      return transactions.run(
        s.planeKey,
        s,
        async (tx) =>
          (
            await sql`SELECT 1 FROM event.whatsapp_consent WHERE tenant_id=${s.tenantId}::uuid AND principal_id=${s.principalId}::uuid AND consent_status='opted_in' LIMIT 1`.execute(
              tx,
            )
          ).rows.length > 0,
      );
    },
  };
}
export function createPreferenceInvalidationPublisher(
  transactions: PlaneTransactionCoordinator<Tx>,
): PreferenceInvalidationPublisher {
  return {
    async publish(e) {
      await transactions.run(e.planeKey, e, (tx) => writeInvalidation(tx, e));
    },
  };
}
async function writeInvalidation(
  tx: Tx,
  e: Parameters<PreferenceInvalidationPublisher["publish"]>[0],
  actorId: string = e.principalId,
): Promise<void> {
  await sql`INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,aggregate_type,actor_id,source,payload,created_by) VALUES(${e.tenantId}::uuid,'platform.notifications.preferences',${e.type},${`${e.principalId}:${e.version}`},'principal_notification_preferences',${actorId}::uuid,'notifications',${JSON.stringify(e)}::jsonb,${actorId}::uuid) ON CONFLICT (tenant_id,event_key) WHERE event_key IS NOT NULL DO NOTHING`.execute(
    tx,
  );
}

/** Owning-service invariants used by the shared Entity Framework mutation policy
 * registry. Uses the caller's transaction and actor; never impersonates the owner. */
export function createNotificationPreferenceRecordPolicy() {
  type Context={tenantId:string;principalId:string;planeKey:PreferencePlane};
  type Descriptor={storage:{schema:string;object:string}};
  const assertStorage=(descriptor:Descriptor)=>{
    if(descriptor.storage.schema!=="master"||descriptor.storage.object!=="principal_notification_preference")throw Error("NOTIFICATION_PREFERENCE_STORAGE_MISMATCH");
  };
  return {
    async validate({context,descriptor,values}:{context:Context;descriptor:Descriptor;values:Readonly<Record<string,unknown>>},tx:Tx){
      assertStorage(descriptor);
      const principalId=String(values["principal_id"]??"");
      if(!/^[0-9a-f-]{36}$/i.test(principalId))throw Error("NOTIFICATION_PREFERENCE_OWNER_REQUIRED");
      const eventCode=String(values["event_code"]??""),channel=String(values["channel"]??"");
      if(eventCode==="platform.preferences.version"||! /^[a-z][a-z0-9_.:-]{1,126}$/.test(eventCode)||!["in_app","email","sms","push","whatsapp"].includes(channel))
        throw new HttpError(400,"INVALID_NOTIFICATION_PREFERENCE","Choose a supported notification event and channel.");
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${principalId}:notification-preferences`},0))`.execute(tx);
      const scope={tenantId:context.tenantId,principalId,planeKey:context.planeKey};
      const capabilities=createKyselyPreferenceCapabilities({run:async(_plane,_actor,work)=>work(tx)});
      if(values["is_enabled"]===true && values["status"]!=="inactive"){
        if(!await capabilities.supports(scope,channel as PreferenceChannel)||!await capabilities.hasConsent(scope,channel as PreferenceChannel))
          throw new HttpError(400,"INVALID_NOTIFICATION_PREFERENCE","This channel requires a verified contact or consent for the selected user.");
      }
    },
    async committed({context,descriptor,record}:{context:Context;descriptor:Descriptor;record:Readonly<Record<string,unknown>>},tx:Tx){
      assertStorage(descriptor);
      const scope={tenantId:context.tenantId,principalId:String(record["principal_id"]),planeKey:context.planeKey};
      const snapshot=await read(tx,scope);
      await writeInvalidation(tx,{type:"notification.preferences.invalidated",...scope,version:snapshot.version,occurredAt:new Date().toISOString()},context.principalId);
    },
  };
}
