import { randomUUID } from "node:crypto";
import { parseInstant } from "@athyper/platform-temporal";
import type {
  ParameterDefinition,
  ParameterRepository,
  TenantParameterValue,
} from "@athyper/server-contract-control-admin";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { HttpError } from "@athyper/server-runtime-http";
import { sql, type Kysely, type Transaction } from "kysely";
import { validateParameterValue } from "./parameter-control.js";
type DB = Record<string, never>;
type Row = Record<string, unknown>;
type Plane = "studio" | "neon" | "mesh";
type Input = Parameters<ParameterRepository["saveValue"]>[0];
export class KyselyParameterRepository implements ParameterRepository {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly plane: Plane,
  ) {}
  async health() {
    await this.run(undefined, undefined, async (tx) => {
      await sql`SELECT revision FROM control.parameter_definition LIMIT 0`.execute(
        tx,
      );
      await sql`SELECT version FROM control.tenant_parameter_value LIMIT 0`.execute(
        tx,
      );
      await sql`SELECT payload FROM event.outbox LIMIT 0`.execute(tx);
      if (
        !(
          await sql`SELECT id FROM master.audit_event_contract WHERE code='control_parameter_value' AND status='active' AND capture_mode='safe_values'`.execute(
            tx,
          )
        ).rows.length
      )
        throw error(503, "PARAMETER_AUDIT_UNAVAILABLE");
    });
    return { status: "healthy" as const };
  }
  async getDefinition(code: string) {
    return this.run(undefined, undefined, async (tx) => {
      const row = (
        await sql<Row>`SELECT * FROM control.parameter_definition WHERE code=${code} AND NOT is_sensitive`.execute(
          tx,
        )
      ).rows[0];
      return row ? definition(row) : undefined;
    });
  }
  async listDefinitions() {
    return this.run(undefined, undefined, async (tx) =>
      (
        await sql<Row>`SELECT * FROM control.parameter_definition WHERE NOT is_sensitive ORDER BY code`.execute(
          tx,
        )
      ).rows.map(definition),
    );
  }
  async getValue(
    tenantId: string,
    definitionId: string,
    at = new Date().toISOString(),
  ) {
    uuid(definitionId);
    instant(at);
    return this.run(tenantId, undefined, (tx) =>
      this.effective(tx, tenantId, definitionId, at),
    );
  }
  async readEffective(tenantId: string, code: string, at: string) {
    instant(at);
    return this.run(tenantId, undefined, async (tx) => {
      const row = (
        await sql<Row>`SELECT * FROM control.parameter_definition WHERE code=${code} AND NOT is_sensitive`.execute(
          tx,
        )
      ).rows[0];
      if (!row) return undefined;
      const d = definition(row),
        v =
          d.tenantCanOverride && d.status === "active"
            ? await this.effective(tx, tenantId, d.id, at)
            : undefined;
      return { definition: d, ...(v ? { value: v } : {}) };
    });
  }
  private async effective(
    tx: Transaction<DB>,
    tenantId: string,
    id: string,
    at: string,
  ) {
    const row = (
      await sql<Row>`SELECT v.* FROM control.tenant_parameter_value v JOIN control.parameter_definition d ON d.id=v.parameter_definition_id
 WHERE v.tenant_id=${tenantId}::uuid AND v.parameter_definition_id=${id}::uuid AND NOT d.is_sensitive AND v.status='active' AND v.effective_from<=${at}::timestamptz AND (v.effective_until IS NULL OR v.effective_until>${at}::timestamptz)`.execute(
        tx,
      )
    ).rows[0];
    return row ? value(row) : undefined;
  }
  async saveValue(input: Input, actorId: string) {
    version(input.expectedVersion, 0);
    uuid(input.parameterDefinitionId);
    if (input.expectedVersion > 0 && !input.id)
      throw error(400, "INVALID_COMMAND");
    const id = input.id ?? randomUUID();
    uuid(id);
    const from = instant(input.effectiveFrom);
    if (
      input.effectiveUntil !== undefined &&
      instant(input.effectiveUntil) <= from
    )
      throw error(400, "INVALID_EFFECTIVE_RANGE");
    if (
      input.reason !== undefined &&
      (typeof input.reason !== "string" ||
        !input.reason.trim() ||
        input.reason.length > 2000)
    )
      throw error(400, "INVALID_COMMAND");
    return this.run(input.tenantId, actorId, async (tx) => {
      const current = (
        await sql<Row>`SELECT * FROM control.tenant_parameter_value WHERE tenant_id=${input.tenantId}::uuid AND id=${id}::uuid FOR UPDATE`.execute(
          tx,
        )
      ).rows[0];
      if (!current && input.expectedVersion > 0) throw error(404, "NOT_FOUND");
      if (current && Number(current["version"]) !== input.expectedVersion)
        throw error(409, "VERSION_CONFLICT");
      if (
        current &&
        (current["parameter_definition_id"] !== input.parameterDefinitionId ||
          current["status"] !== "active")
      )
        throw error(409, "LIFECYCLE_INVALID");
      const d = (
        await sql<Row>`SELECT * FROM control.lock_parameter_definition(${input.parameterDefinitionId}::uuid)`.execute(
          tx,
        )
      ).rows[0];
      if (!d || d["status"] !== "active")
        throw error(404, "DEFINITION_NOT_FOUND");
      if (!d["tenant_can_override"]) throw error(403, "OVERRIDE_NOT_ALLOWED");
      validateParameterValue(definition(d), input.value);
      const result = current
        ? await sql<Row>`UPDATE control.tenant_parameter_value SET value=${JSON.stringify(input.value)}::jsonb,reason=${input.reason?.trim() ?? null},effective_from=${input.effectiveFrom}::timestamptz,effective_until=${input.effectiveUntil ?? null}::timestamptz,updated_at=clock_timestamp(),updated_by=${actorId}::uuid
    WHERE tenant_id=${input.tenantId}::uuid AND id=${id}::uuid AND version=${input.expectedVersion} AND status='active' RETURNING *`.execute(
            tx,
          )
        : await sql<Row>`INSERT INTO control.tenant_parameter_value(id,tenant_id,parameter_definition_id,value,reason,effective_from,effective_until,created_by)
    VALUES(${id}::uuid,${input.tenantId}::uuid,${input.parameterDefinitionId}::uuid,${JSON.stringify(input.value)}::jsonb,${input.reason?.trim() ?? null},${input.effectiveFrom}::timestamptz,${input.effectiveUntil ?? null}::timestamptz,${actorId}::uuid) RETURNING *`.execute(
            tx,
          );
      if (!result.rows[0]) throw error(409, "VERSION_CONFLICT");
      const saved = value(result.rows[0]);
      await this.evidence(
        tx,
        actorId,
        String(d["code"]),
        current ? value(current) : undefined,
        saved,
        current ? "updated" : "created",
      );
      return saved;
    });
  }
  async expireValue(
    tenantId: string,
    id: string,
    expectedVersion: number,
    actorId: string,
  ) {
    uuid(id);
    version(expectedVersion, 1);
    return this.run(tenantId, actorId, async (tx) => {
      const current = (
        await sql<Row>`SELECT * FROM control.tenant_parameter_value WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid FOR UPDATE`.execute(
          tx,
        )
      ).rows[0];
      if (!current) throw error(404, "NOT_FOUND");
      if (Number(current["version"]) !== expectedVersion)
        throw error(409, "VERSION_CONFLICT");
      const d = (
        await sql<Row>`SELECT code,is_sensitive FROM control.lock_parameter_definition(${String(current["parameter_definition_id"])}::uuid)`.execute(
          tx,
        )
      ).rows[0];
      if (!d || d["is_sensitive"]) throw error(404, "NOT_FOUND");
      const before = value(current);
      if (before.status === "expired") return before;
      const result =
        await sql<Row>`UPDATE control.tenant_parameter_value SET status='deprecated',effective_until=CASE WHEN effective_from<statement_timestamp() THEN least(coalesce(effective_until,statement_timestamp()),statement_timestamp()) ELSE effective_until END,
  status_changed_at=clock_timestamp(),status_changed_by=${actorId}::uuid,updated_at=clock_timestamp(),updated_by=${actorId}::uuid
  WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid AND version=${expectedVersion} AND status='active' RETURNING *`.execute(
          tx,
        );
      if (!result.rows[0]) throw error(409, "VERSION_CONFLICT");
      const saved = value(result.rows[0]);
      await this.evidence(
        tx,
        actorId,
        String(d["code"]),
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
            throw error(503, "PARAMETER_PLANE_MISMATCH");
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
      if (code === "40001" || code === "40P01" || code === "23505")
        throw error(409, "VERSION_CONFLICT");
      if (code === "23P01") throw error(409, "PARAMETER_OVERLAP");
      throw cause;
    }
  }
  private async evidence(
    tx: Transaction<DB>,
    actorId: string,
    code: string,
    before: TenantParameterValue | undefined,
    after: TenantParameterValue,
    action: "created" | "updated" | "expired",
  ) {
    // Values never enter audit/outbox payloads, even for subsequently sensitive definitions.
    const redact = (v: TenantParameterValue) => {
      const { value: _value, ...metadata } = v;
      return metadata;
    };
    const event = `control.parameter_value.${action}`,
      cacheInvalidation = {
        namespace: "parameters",
        tenantId: after.tenantId,
        keys: [code],
      };
    const old = before ? redact(before) : null,
      next = redact(after);
    const audit = (
      await sql<Row>`SELECT audit.append_event(p_event_code=>${event},p_operation=>${action === "created" ? "create" : "update"}::audit.operation_d,p_entity_type=>'control.tenant_parameter_value',p_entity_id=>${after.id}::uuid,p_old_values=>${old ? JSON.stringify(old) : null}::jsonb,p_new_values=>${JSON.stringify(next)}::jsonb,p_context=>${JSON.stringify({ plane: this.plane, cacheInvalidation })}::jsonb) AS id`.execute(
        tx,
      )
    ).rows[0];
    await sql`INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,actor_id,source,partition_key,payload,created_by)
  VALUES(${after.tenantId}::uuid,'control.parameters',${event},${`${after.id}:${after.version}`},'control.tenant_parameter_value',${after.id}::uuid,'control.tenant_parameter_value',${after.id}::uuid,${actorId}::uuid,'control-admin',${after.tenantId},${JSON.stringify({ schemaVersion: 1, plane: this.plane, actorId, auditEventId: String(audit?.["id"]), before: old, after: next, cacheInvalidation })}::jsonb,${actorId}::uuid)`.execute(
      tx,
    );
  }
}
export function createKyselyParameterRepositories(
  databases: Readonly<Partial<Record<Plane, Kysely<DB>>>>,
) {
  const registry: Partial<Record<Plane, KyselyParameterRepository>> = {};
  for (const plane of ["studio", "neon", "mesh"] as const)
    if (databases[plane])
      registry[plane] = new KyselyParameterRepository(databases[plane], plane);
  return createExactPlaneRepositoryProvider<ParameterRepository>(registry, {
    unavailableCode: "CONTROL_ADMIN_PARAMETER_REPOSITORY_UNAVAILABLE",
    health: Object.fromEntries(
      Object.entries(registry).map(([plane, repo]) => [
        plane,
        () => repo.health(),
      ]),
    ),
  });
}
function definition(r: Row): ParameterDefinition {
  return {
    id: String(r["id"]),
    code: String(r["code"]),
    revision: Number(r["revision"]),
    valueType: r["value_type"] as ParameterDefinition["valueType"],
    defaultValue: r["default_value"] as ParameterDefinition["defaultValue"],
    ...(r["min_value"] == null ? {} : { minValue: Number(r["min_value"]) }),
    ...(r["max_value"] == null ? {} : { maxValue: Number(r["max_value"]) }),
    ...(r["allowed_values"] == null
      ? {}
      : {
          allowedValues: r[
            "allowed_values"
          ] as ParameterDefinition["allowedValues"],
        }),
    tenantCanOverride: r["tenant_can_override"] === true,
    reloadMode: r["reload_mode"] as ParameterDefinition["reloadMode"],
    cacheTtlSeconds: Number(r["cache_ttl_seconds"]),
    status: r["status"] === "active" ? "active" : "retired",
  };
}
function value(r: Row): TenantParameterValue {
  return {
    id: String(r["id"]),
    version: Number(r["version"]),
    tenantId: String(r["tenant_id"]),
    parameterDefinitionId: String(r["parameter_definition_id"]),
    value: r["value"] as TenantParameterValue["value"],
    ...(r["reason"] == null ? {} : { reason: String(r["reason"]) }),
    effectiveFrom: new Date(String(r["effective_from"])).toISOString(),
    ...(r["effective_until"] == null
      ? {}
      : {
          effectiveUntil: new Date(String(r["effective_until"])).toISOString(),
        }),
    status: r["status"] === "active" ? "active" : "expired",
  };
}
function uuid(v: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  )
    throw error(400, "INVALID_COMMAND");
}
function version(v: number, min: number) {
  if (!Number.isSafeInteger(v) || v < min || v >= 2147483647)
    throw error(400, "INVALID_COMMAND");
}
function instant(v: string) {
  const n = parseInstant(v);
  if (!Number.isFinite(n)) throw error(400, "INVALID_EFFECTIVE_RANGE");
  return n;
}
function error(status: number, code: string) {
  return new HttpError(status, `CONTROL_ADMIN_${code}`, code);
}
