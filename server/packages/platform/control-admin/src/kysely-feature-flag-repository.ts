import { randomUUID } from "node:crypto";
import { parseInstant } from "@athyper/platform-temporal";
import type {
  FeatureFlagDefinition,
  FeatureFlagOverride,
  FeatureFlagRepository,
} from "@athyper/server-contract-control-admin";
import {
  createExactPlaneRepositoryProvider,
  type ExactPlaneRepositoryProvider,
} from "@athyper/server-foundation/transaction";
import { HttpError } from "@athyper/server-runtime-http";
import { sql, type Kysely, type Transaction } from "kysely";
type DB = Record<string, never>;
type Row = Record<string, unknown>;
type Plane = "studio" | "neon" | "mesh";
type Input = Parameters<FeatureFlagRepository["saveOverride"]>[0];

export class KyselyFeatureFlagRepository implements FeatureFlagRepository {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly plane: Plane,
  ) {}
  async health() {
    await this.run(undefined, undefined, async (tx) => {
      await sql`SELECT version FROM control.feature_flag_override LIMIT 0`.execute(
        tx,
      );
      await sql`SELECT cohort_strategy, cohort_revision FROM control.feature_flag_catalog LIMIT 0`.execute(
        tx,
      );
      await sql`SELECT payload FROM event.outbox LIMIT 0`.execute(tx);
      if (
        !(
          await sql`SELECT id FROM master.audit_event_contract WHERE code='control_feature_override' AND status='active' AND capture_mode='safe_values'`.execute(
            tx,
          )
        ).rows.length
      )
        throw error(503, "FEATURE_AUDIT_UNAVAILABLE");
    });
    return { status: "healthy" as const };
  }
  async getDefinition(code: string) {
    return this.run(undefined, undefined, async (tx) => {
      const row = (
        await sql<Row>`SELECT * FROM control.feature_flag_catalog WHERE code=${code}`.execute(
          tx,
        )
      ).rows[0];
      return row ? definition(row) : undefined;
    });
  }
  async readEvaluation(tenantId:string,code:string,at:string){
    instant(at);
    return this.run(tenantId,undefined,async tx=>{
      const row=(await sql<Row>`SELECT * FROM control.feature_flag_catalog WHERE code=${code}`.execute(tx)).rows[0];
      if(!row)return undefined;
      const selected=(await sql<Row>`SELECT * FROM control.feature_flag_override WHERE tenant_id=${tenantId}::uuid AND feature_flag_id=${String(row["id"])}::uuid AND status='active' AND effective_from<=${at}::timestamptz AND (effective_until IS NULL OR effective_until>${at}::timestamptz)`.execute(tx)).rows[0];
      return {definition:definition(row),...(selected?{override:override(selected)}:{})};
    });
  }
  async listDefinitions() {
    return this.run(undefined, undefined, async (tx) =>
      (
        await sql<Row>`SELECT * FROM control.feature_flag_catalog ORDER BY code`.execute(
          tx,
        )
      ).rows.map(definition),
    );
  }
  async getOverride(
    tenantId: string,
    featureFlagId: string,
    at = new Date().toISOString(),
  ) {
    uuid(featureFlagId);
    instant(at);
    return this.run(tenantId, undefined, async (tx) => {
      const row = (
        await sql<Row>`SELECT * FROM control.feature_flag_override WHERE tenant_id=${tenantId}::uuid AND feature_flag_id=${featureFlagId}::uuid
      AND status='active' AND effective_from<=${at}::timestamptz AND (effective_until IS NULL OR effective_until>${at}::timestamptz)`.execute(
          tx,
        )
      ).rows[0];
      return row ? override(row) : undefined;
    });
  }
  async saveOverride(
    input: Input,
    actorId: string,
  ): Promise<FeatureFlagOverride> {
    validate(input);
    const id = input.id ?? randomUUID();
    uuid(id);
    uuid(input.featureFlagId);
    return this.run(input.tenantId, actorId, async (tx) => {
      const current = (
        await sql<Row>`SELECT * FROM control.feature_flag_override WHERE tenant_id=${input.tenantId}::uuid AND id=${id}::uuid FOR UPDATE`.execute(
          tx,
        )
      ).rows[0];
      if (Number(current?.["version"] ?? 0) !== input.expectedVersion)
        throw error(409, "VERSION_CONFLICT");
      if (
        current &&
        (current["status"] !== "active" ||
          current["feature_flag_id"] !== input.featureFlagId)
      )
        throw error(409, "LIFECYCLE_INVALID");
      const flag = (
        await sql<Row>`SELECT code FROM control.feature_flag_catalog WHERE id=${input.featureFlagId}::uuid AND status='active'`.execute(
          tx,
        )
      ).rows[0];
      if (!flag) throw error(404, "DEFINITION_NOT_FOUND");
      const result = current
        ? await sql<Row>`UPDATE control.feature_flag_override SET is_enabled=${input.enabled},reason=${input.reason.trim()},effective_from=${input.effectiveFrom}::timestamptz,
        effective_until=${input.effectiveUntil ?? null}::timestamptz,version=version+1,updated_at=clock_timestamp(),updated_by=${actorId}::uuid
        WHERE tenant_id=${input.tenantId}::uuid AND id=${id}::uuid AND version=${input.expectedVersion} AND status='active' RETURNING *`.execute(
            tx,
          )
        : await sql<Row>`INSERT INTO control.feature_flag_override(id,tenant_id,feature_flag_id,is_enabled,reason,effective_from,effective_until,created_by)
        VALUES(${id}::uuid,${input.tenantId}::uuid,${input.featureFlagId}::uuid,${input.enabled},${input.reason.trim()},${input.effectiveFrom}::timestamptz,${input.effectiveUntil ?? null}::timestamptz,${actorId}::uuid) RETURNING *`.execute(
            tx,
          );
      if (!result.rows[0]) throw error(409, "VERSION_CONFLICT");
      const saved = override(result.rows[0]);
      await this.evidence(
        tx,
        actorId,
        String(flag["code"]),
        current ? override(current) : undefined,
        saved,
        current ? "updated" : "created",
      );
      return saved;
    });
  }
  async expireOverride(
    tenantId: string,
    id: string,
    expectedVersion: number,
    actorId: string,
  ) {
    uuid(id);
    version(expectedVersion, 1);
    return this.run(tenantId, actorId, async (tx) => {
      const current = (
        await sql<Row>`SELECT * FROM control.feature_flag_override WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid FOR UPDATE`.execute(
          tx,
        )
      ).rows[0];
      if (!current) throw error(404, "NOT_FOUND");
      if (Number(current["version"]) !== expectedVersion)
        throw error(409, "VERSION_CONFLICT");
      const before = override(current);
      if (before.status === "expired") return before;
      const result =
        await sql<Row>`UPDATE control.feature_flag_override SET status='deprecated',version=version+1,
        effective_until=CASE WHEN effective_from<statement_timestamp() THEN least(coalesce(effective_until,statement_timestamp()),statement_timestamp()) ELSE effective_until END,
        status_changed_at=clock_timestamp(),status_changed_by=${actorId}::uuid,updated_at=clock_timestamp(),updated_by=${actorId}::uuid
        WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid AND version=${expectedVersion} AND status='active' RETURNING *`.execute(
          tx,
        );
      if (!result.rows[0]) throw error(409, "VERSION_CONFLICT");
      const saved = override(result.rows[0]);
      const flag = (
        await sql<Row>`SELECT code FROM control.feature_flag_catalog WHERE id=${before.featureFlagId}::uuid`.execute(
          tx,
        )
      ).rows[0]!;
      await this.evidence(
        tx,
        actorId,
        String(flag["code"]),
        before,
        saved,
        "expired",
      );
      return saved;
    });
  }
  private async run<T>(
    tenantId: string | undefined,
    actorId: string | undefined,
    work: (tx: Transaction<DB>) => Promise<T>,
  ): Promise<T> {
    if (tenantId !== undefined) uuid(tenantId);
    if (actorId !== undefined) uuid(actorId);
    try {
      return await this.db
        .transaction()
        .setIsolationLevel("serializable")
        .execute(async (tx) => {
          if (
            (
              await sql<Row>`SELECT current_setting('app.database_plane',true) AS plane`.execute(
                tx,
              )
            ).rows[0]?.["plane"] !== this.plane
          )
            throw error(503, "FEATURE_PLANE_MISMATCH");
          if (tenantId !== undefined)
            await sql`SELECT set_config('app.current_tenant_id',${tenantId},true),set_config('app.current_principal_id',${actorId ?? ""},true),set_config('app.current_actor_type','user',true)`.execute(
              tx,
            );
          return work(tx);
        });
    } catch (cause) {
      if (cause instanceof HttpError) throw cause;
      const code =
        cause && typeof cause === "object" && "code" in cause
          ? cause.code
          : undefined;
      if (code === "23505" || code === "40001" || code === "40P01")
        throw error(409, "VERSION_CONFLICT");
      if (code === "23P01") throw error(409, "FEATURE_OVERLAP");
      throw cause;
    }
  }
  private async evidence(
    tx: Transaction<DB>,
    actorId: string,
    code: string,
    before: FeatureFlagOverride | undefined,
    after: FeatureFlagOverride,
    action: "created" | "updated" | "expired",
  ) {
    const event = `control.feature_override.${action}`,
      cacheInvalidation = {
        namespace: "features",
        tenantId: after.tenantId,
        keys: [code],
      };
    const audit = (
      await sql<Row>`SELECT audit.append_event(p_event_code=>${event},p_operation=>${action === "created" ? "create" : "update"}::audit.operation_d,
      p_entity_type=>'control.feature_flag_override',p_entity_id=>${after.id}::uuid,p_old_values=>${before ? JSON.stringify(before) : null}::jsonb,p_new_values=>${JSON.stringify(after)}::jsonb,
      p_context=>${JSON.stringify({ plane: this.plane, cacheInvalidation })}::jsonb) AS id`.execute(
        tx,
      )
    ).rows[0];
    await sql`INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,actor_id,source,partition_key,payload,created_by)
      VALUES(${after.tenantId}::uuid,'control.features',${event},${`${after.id}:${after.version}`},'control.feature_flag_override',${after.id}::uuid,'control.feature_flag_override',${after.id}::uuid,
      ${actorId}::uuid,'control-admin',${after.tenantId},${JSON.stringify({ schemaVersion: 1, plane: this.plane, actorId, auditEventId: String(audit?.["id"]), before: before ?? null, after, cacheInvalidation })}::jsonb,${actorId}::uuid)`.execute(
      tx,
    );
  }
}
export function createKyselyFeatureFlagRepositories(
  databases: Readonly<Partial<Record<Plane, Kysely<DB>>>>,
): ExactPlaneRepositoryProvider<FeatureFlagRepository> {
  const registry: Partial<Record<Plane, KyselyFeatureFlagRepository>> = {};
  for (const plane of ["studio", "neon", "mesh"] as const) {
    if (databases[plane])
      registry[plane] = new KyselyFeatureFlagRepository(
        databases[plane],
        plane,
      );
  }
  return createExactPlaneRepositoryProvider<FeatureFlagRepository>(registry, {
    unavailableCode: "CONTROL_ADMIN_FEATURE_REPOSITORY_UNAVAILABLE",
    health: Object.fromEntries(
      Object.entries(registry).map(([plane, repo]) => [
        plane,
        () => repo.health(),
      ]),
    ),
  });
}
function definition(row: Row): FeatureFlagDefinition {
  return {
    id: String(row["id"]),
    code: String(row["code"]),
    cohortStrategy: row[
      "cohort_strategy"
    ] as FeatureFlagDefinition["cohortStrategy"],
    cohortRevision: Number(row["cohort_revision"]),
    kind: row["flag_kind"] as FeatureFlagDefinition["kind"] & string,
    defaultEnabled: row["default_enabled"] === true,
    ...(row["rollout_pct"] == null
      ? {}
      : { rolloutPct: Number(row["rollout_pct"]) }),
    status: row["status"] === "active" ? "active" : "retired",
    ...dates(row),
  };
}
function override(row: Row): FeatureFlagOverride {
  return {
    id: String(row["id"]),
    tenantId: String(row["tenant_id"]),
    featureFlagId: String(row["feature_flag_id"]),
    enabled: row["is_enabled"] === true,
    version: Number(row["version"]),
    reason: String(row["reason"]),
    status: row["status"] === "active" ? "active" : "expired",
    ...dates(row),
  };
}
function dates(row: Row) {
  return {
    effectiveFrom: new Date(String(row["effective_from"])).toISOString(),
    ...(row["effective_until"] == null
      ? {}
      : {
          effectiveUntil: new Date(
            String(row["effective_until"]),
          ).toISOString(),
        }),
  };
}
function error(status: number, suffix: string) {
  const code = `CONTROL_ADMIN_${suffix}`;
  return new HttpError(status, code, code);
}
function uuid(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw error(400, "INVALID_COMMAND");
}
function version(value: number, min: number) {
  if (!Number.isSafeInteger(value) || value < min || value >= 2147483647)
    throw error(400, "INVALID_COMMAND");
}
function instant(value: string) {
  const at = parseInstant(value);
  if (!Number.isFinite(at)) throw error(400, "INVALID_EFFECTIVE_RANGE");
  return at;
}
function validate(input: Input) {
  version(input.expectedVersion, 0);
  if (
    typeof input.enabled !== "boolean" ||
    typeof input.reason !== "string" ||
    !input.reason.trim() ||
    input.reason.length > 2000 ||
    (input.expectedVersion > 0 && !input.id)
  )
    throw error(400, "INVALID_COMMAND");
  const from = instant(input.effectiveFrom);
  if (
    input.effectiveUntil !== undefined &&
    instant(input.effectiveUntil) <= from
  )
    throw error(400, "INVALID_EFFECTIVE_RANGE");
}
