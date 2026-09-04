import type { Transaction } from "kysely";
import { sql } from "kysely";
import { randomUUID } from "node:crypto";

type Db = Record<string, never>;
type Row = Record<string, unknown>;
export type ExternalWorkerIntentDisposition =
  "applied" | "replayed" | "stale" | "conflict";

export interface ExternalWorkerIdentityIntent {
  readonly schema: "athyper.trustiam.identity-projection-intent/1";
  readonly sourcePlane: "neon";
  readonly sourceTenantId: string;
  readonly authorityTenantId: string;
  readonly targetTenantId: string;
  readonly personId: string;
  readonly identifier: string;
  readonly displayName: string;
  readonly realmKey: string;
  readonly organizationId: string;
  readonly relationship: "external_worker" | "employer";
  readonly sourceRef: string;
  readonly desiredVersion: number;
  readonly desiredStatus: "active" | "suspended" | "deprovisioned";
  readonly applications: readonly {
    readonly plane: "neon";
    readonly targetTenantId: string;
    readonly roles: readonly {
      readonly roleCode: "workforce.external_worker" | "workforce.employee";
      readonly scopeKind: "legal_entity";
      readonly scopeTargetId: string;
    }[];
  }[];
  readonly desiredHash: string;
  readonly commandExecutionId: string;
}

export interface ExternalWorkerIdentityIntentEvent {
  readonly eventId: string;
  readonly eventType:
    | "workforce.external_worker.identity_projection.requested"
    | "workforce.employee.identity_projection.requested";
  readonly sourceTenantId: string;
  readonly payload: unknown;
}

export class ExternalWorkerIdentityIntentConsumer {
  constructor(
    private readonly repository: KyselyExternalWorkerIdentityIntentRepository,
  ) {}
  consume(event: ExternalWorkerIdentityIntentEvent): Promise<{
    disposition: ExternalWorkerIntentDisposition;
    identityId?: string;
  }> {
    return this.repository.consume({
      ...event,
      payload: validateExternalWorkerIdentityIntent(event),
    });
  }
}

export class KyselyExternalWorkerIdentityIntentRepository {
  constructor(
    private readonly run: <T>(
      work: (tx: Transaction<Db>) => Promise<T>,
    ) => Promise<T>,
    private readonly actorId: string,
  ) {}

  consume(
    event: Omit<ExternalWorkerIdentityIntentEvent, "payload"> & {
      payload: ExternalWorkerIdentityIntent;
    },
  ): Promise<{
    disposition: ExternalWorkerIntentDisposition;
    identityId?: string;
  }> {
    return this.run(async (tx) => {
      const p = event.payload;
      const commandCode =
        p.relationship === "employer"
          ? "trustiam.internal_workforce.intent.consume"
          : "trustiam.external_worker.intent.consume";
      const prior = (
        await sql<Row>`SELECT request_fingerprint,status,result_payload FROM event.command_execution WHERE tenant_id=${p.authorityTenantId}::uuid AND command_code=${commandCode} AND idempotency_key=${event.eventId} FOR UPDATE`.execute(
          tx,
        )
      ).rows[0];
      if (prior) {
        if (String(prior["request_fingerprint"]) !== p.desiredHash)
          throw coded("EXTERNAL_WORKER_INTENT_EVENT_CONFLICT");
        if (prior["status"] !== "succeeded")
          throw coded("EXTERNAL_WORKER_INTENT_EVENT_INCOMPLETE");
        const result = object(prior["result_payload"]);
        return {
          disposition: String(
            result["disposition"],
          ) as ExternalWorkerIntentDisposition,
          ...(result["identityId"]
            ? { identityId: String(result["identityId"]) }
            : {}),
        };
      }
      const hash = (
        await sql<{
          value: string;
        }>`SELECT encode(public.digest(convert_to((${JSON.stringify(p)}::jsonb - 'desiredHash')::text,'UTF8'),'sha256'),'hex') value`.execute(
          tx,
        )
      ).rows[0]?.value;
      if (hash !== p.desiredHash)
        throw coded("EXTERNAL_WORKER_INTENT_HASH_INVALID");
      const organization = (
        await sql<Row>`SELECT id FROM trustiam.organization WHERE authority_tenant_id=${p.authorityTenantId}::uuid AND id=${p.organizationId}::uuid AND status='active'`.execute(
          tx,
        )
      ).rows[0];
      if (!organization)
        throw coded("EXTERNAL_WORKER_INTENT_ORGANIZATION_MISSING");
      const execution = (
        await sql<Row>`INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,actor_principal_id,source_service,started_at,status_changed_at,status_changed_by,created_by) VALUES(${p.authorityTenantId}::uuid,${commandCode},${event.eventId},${p.desiredHash},'processing',${this.actorId}::uuid,'studio.workforce-identity-intent',clock_timestamp(),clock_timestamp(),${this.actorId}::uuid,${this.actorId}::uuid) RETURNING id`.execute(
          tx,
        )
      ).rows[0]!;
      const current = (
        await sql<Row>`SELECT * FROM trustiam.identity_projection WHERE authority_tenant_id=${p.authorityTenantId}::uuid AND source_plane='neon' AND source_tenant_id=${p.sourceTenantId}::uuid AND relationship_kind=${p.relationship} AND source_ref=${p.sourceRef} FOR UPDATE`.execute(
          tx,
        )
      ).rows[0];
      let disposition: ExternalWorkerIntentDisposition;
      let identityId: string | undefined;
      if (!current) {
        identityId = randomUUID();
        await insertProjection(tx, identityId, p, this.actorId);
        disposition = "applied";
      } else {
        identityId = String(current["id"]);
        const version = Number(current["desired_version"]);
        const currentHash = String(current["desired_hash"]);
        if (version > p.desiredVersion) disposition = "stale";
        else if (version === p.desiredVersion)
          disposition = currentHash === p.desiredHash ? "replayed" : "conflict";
        else if (String(current["person_id"]) !== p.personId)
          disposition = "conflict";
        else {
          await sql`UPDATE trustiam.identity_projection SET organization_id=${p.organizationId}::uuid,realm_key=${p.realmKey},normalized_identifier=${p.identifier},display_name=${p.displayName},desired_version=${p.desiredVersion},desired_hash=${p.desiredHash},desired_status=${p.desiredStatus},desired_applications=${JSON.stringify(p.applications)}::jsonb,reconciliation_status='pending',last_error_code=NULL,updated_by=${this.actorId}::uuid WHERE id=${identityId}::uuid`.execute(
            tx,
          );
          disposition = "applied";
        }
      }
      const resultPayload = {
        disposition,
        ...(identityId ? { identityId } : {}),
        desiredVersion: p.desiredVersion,
        desiredHash: p.desiredHash,
      };
      const sourceType =
          p.relationship === "employer" ? "employment" : "worker_engagement",
        sourceId = p.sourceRef.slice(`${sourceType}:`.length);
      await sql`INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,event_version,actor_id,source,payload,created_by) VALUES(${p.authorityTenantId}::uuid,'trustiam-identity-intent',${`trustiam.${p.relationship}.identity_intent.${disposition}`},${`workforce-intent:${event.eventId}`},'trustiam.identity_projection',${identityId ?? null}::uuid,${sourceType},${sourceId}::uuid,${Math.min(p.desiredVersion, 2147483647)},${this.actorId}::uuid,'studio.workforce-identity-intent',${JSON.stringify({ eventId: event.eventId, sourceTenantId: p.sourceTenantId, sourceRef: p.sourceRef, ...resultPayload })}::jsonb,${this.actorId}::uuid)`.execute(
        tx,
      );
      await sql`UPDATE event.command_execution SET status='succeeded',result_payload=${JSON.stringify(resultPayload)}::jsonb,completed_at=clock_timestamp(),status_changed_at=clock_timestamp(),status_changed_by=${this.actorId}::uuid,updated_by=${this.actorId}::uuid WHERE id=${String(execution["id"])}::uuid AND status='processing'`.execute(
        tx,
      );
      return { disposition, ...(identityId ? { identityId } : {}) };
    });
  }
}

async function insertProjection(
  tx: Transaction<Db>,
  id: string,
  p: ExternalWorkerIdentityIntent,
  actorId: string,
) {
  await sql`INSERT INTO trustiam.identity_projection(id,authority_tenant_id,source_plane,source_tenant_id,person_id,organization_id,relationship_kind,source_ref,realm_key,normalized_identifier,display_name,desired_version,desired_hash,desired_status,desired_applications,reconciliation_status,created_by) VALUES(${id}::uuid,${p.authorityTenantId}::uuid,'neon',${p.sourceTenantId}::uuid,${p.personId}::uuid,${p.organizationId}::uuid,${p.relationship},${p.sourceRef},${p.realmKey},${p.identifier},${p.displayName},${p.desiredVersion},${p.desiredHash},${p.desiredStatus},${JSON.stringify(p.applications)}::jsonb,'pending',${actorId}::uuid)`.execute(
    tx,
  );
}

export function validateExternalWorkerIdentityIntent(
  event: ExternalWorkerIdentityIntentEvent,
): ExternalWorkerIdentityIntent {
  if (
    ![
      "workforce.external_worker.identity_projection.requested",
      "workforce.employee.identity_projection.requested",
    ].includes(event.eventType) ||
    !event.payload ||
    typeof event.payload !== "object" ||
    Array.isArray(event.payload)
  )
    throw coded("EXTERNAL_WORKER_INTENT_INVALID");
  if (
    event.eventId.trim() !== event.eventId ||
    event.eventId.length < 8 ||
    event.eventId.length > 200 ||
    !uuid(event.sourceTenantId)
  )
    throw coded("EXTERNAL_WORKER_INTENT_EVENT_INVALID");
  if (Buffer.byteLength(JSON.stringify(event.payload), "utf8") > 32768)
    throw coded("EXTERNAL_WORKER_INTENT_TOO_LARGE");
  const p = event.payload as Record<string, unknown>,
    allowed = new Set([
      "schema",
      "sourcePlane",
      "sourceTenantId",
      "authorityTenantId",
      "targetTenantId",
      "personId",
      "identifier",
      "displayName",
      "realmKey",
      "organizationId",
      "relationship",
      "sourceRef",
      "desiredVersion",
      "desiredStatus",
      "applications",
      "desiredHash",
      "commandExecutionId",
    ]);
  const relationship = p["relationship"],
    external = relationship === "external_worker",
    employer = relationship === "employer";
  if (
    Object.keys(p).some((key) => !allowed.has(key)) ||
    p["schema"] !== "athyper.trustiam.identity-projection-intent/1" ||
    p["sourcePlane"] !== "neon" ||
    (!external && !employer) ||
    event.eventType !==
      (external
        ? "workforce.external_worker.identity_projection.requested"
        : "workforce.employee.identity_projection.requested")
  )
    throw coded("EXTERNAL_WORKER_INTENT_CONTRACT_INVALID");
  for (const key of [
    "sourceTenantId",
    "authorityTenantId",
    "targetTenantId",
    "personId",
    "organizationId",
    "commandExecutionId",
  ] as const)
    if (!uuid(p[key]))
      throw coded(`EXTERNAL_WORKER_INTENT_${key.toUpperCase()}_INVALID`);
  if (
    p["sourceTenantId"] !== event.sourceTenantId ||
    p["authorityTenantId"] !== event.sourceTenantId ||
    p["targetTenantId"] !== event.sourceTenantId
  )
    throw coded("EXTERNAL_WORKER_INTENT_TENANT_MISMATCH");
  const sourcePrefix = external ? "worker_engagement:" : "employment:";
  if (
    typeof p["sourceRef"] !== "string" ||
    !p["sourceRef"].startsWith(sourcePrefix) ||
    !uuid(p["sourceRef"].slice(sourcePrefix.length))
  )
    throw coded("EXTERNAL_WORKER_INTENT_SOURCE_INVALID");
  if (
    !Number.isSafeInteger(p["desiredVersion"]) ||
    Number(p["desiredVersion"]) < 1 ||
    typeof p["desiredHash"] !== "string" ||
    !/^[a-f0-9]{64}$/.test(p["desiredHash"])
  )
    throw coded("EXTERNAL_WORKER_INTENT_VERSION_INVALID");
  if (
    !["active", "suspended", "deprovisioned"].includes(
      String(p["desiredStatus"]),
    ) ||
    typeof p["identifier"] !== "string" ||
    p["identifier"].trim() !== p["identifier"] ||
    !p["identifier"] ||
    p["identifier"].length > 320 ||
    typeof p["displayName"] !== "string" ||
    !p["displayName"].trim() ||
    typeof p["realmKey"] !== "string" ||
    !/^[a-z][a-z0-9_.-]{1,62}$/.test(p["realmKey"])
  )
    throw coded("EXTERNAL_WORKER_INTENT_STATE_INVALID");
  const apps = p["applications"];
  if (!Array.isArray(apps) || apps.length !== 1)
    throw coded("EXTERNAL_WORKER_INTENT_APPLICATION_INVALID");
  const app = apps[0] as Record<string, unknown>,
    roles = app?.["roles"];
  if (
    Object.keys(app).some(
      (key) => !new Set(["plane", "targetTenantId", "roles"]).has(key),
    ) ||
    app?.["plane"] !== "neon" ||
    app["targetTenantId"] !== event.sourceTenantId ||
    !Array.isArray(roles) ||
    roles.length !== 1
  )
    throw coded("EXTERNAL_WORKER_INTENT_APPLICATION_INVALID");
  const role = roles[0] as Record<string, unknown>;
  if (
    Object.keys(role).some(
      (key) => !new Set(["roleCode", "scopeKind", "scopeTargetId"]).has(key),
    ) ||
    role?.["roleCode"] !==
      (external ? "workforce.external_worker" : "workforce.employee") ||
    role["scopeKind"] !== "legal_entity" ||
    role["scopeTargetId"] !== p["organizationId"]
  )
    throw coded("EXTERNAL_WORKER_INTENT_SCOPE_INVALID");
  return p as unknown as ExternalWorkerIdentityIntent;
}
function uuid(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function coded(code: string): Error {
  return Object.assign(new Error(code), { code });
}
