import { parseInstant } from "@athyper/platform-temporal";
import type { EntitlementPlan, EntitlementRepository, TenantEntitlementOverride } from "@athyper/server-contract-control-admin";
import { createExactPlaneRepositoryProvider, type ExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { HttpError } from "@athyper/server-runtime-http";
import { sql, type Kysely, type Transaction } from "kysely";

type Database = Record<string, never>;
type Row = Record<string, unknown>;
type Plane = "studio" | "neon" | "mesh";
type SaveInput = Parameters<EntitlementRepository["saveOverride"]>[0];
const planProjection = sql<Row>`SELECT p.code, p.entitlement_version AS version,
  p.entitlement_effective_from AS effective_from,
  coalesce((SELECT jsonb_agg(m.code ORDER BY m.code)
    FROM control.subscription_plan_module pm JOIN control.module m ON m.id = pm.module_id
    WHERE pm.subscription_plan_id = p.id AND pm.status = 'active'
      AND pm.entitlement_mode = 'included' AND m.status = 'active'), '[]'::jsonb) AS modules,
  coalesce((SELECT jsonb_object_agg(m.code, l.limit_value::text)
    FROM control.subscription_plan_usage_limit l JOIN control.usage_metric_catalog m ON m.id = l.usage_metric_id
    WHERE l.subscription_plan_id = p.id AND l.status = 'active' AND m.status = 'active'
      AND l.dimension_code = '*'), '{}'::jsonb) AS limits
  FROM control.subscription_plan p`;

/** Uses only its assigned database. Every tenant operation installs local RLS context. */
export class KyselyEntitlementRepository implements EntitlementRepository {
  constructor(private readonly db: Kysely<Database>, private readonly plane: Plane) {}

  async health(): Promise<{ status: "healthy" }> {
    await this.db.transaction().execute(async (tx) => {
      await this.assertPlane(tx);
      await sql`SELECT version, subscription_plan_id FROM control.tenant_usage_limit_override LIMIT 0`.execute(tx);
      await sql`SELECT version FROM control.tenant_module_entitlement_override LIMIT 0`.execute(tx);
      await sql`SELECT entitlement_version FROM control.subscription_plan LIMIT 0`.execute(tx);
      await sql`SELECT version FROM snapshot.subscription_plan_entitlement LIMIT 0`.execute(tx);
      await sql`SELECT payload FROM event.outbox LIMIT 0`.execute(tx);
      if (!(await sql`SELECT id FROM master.audit_event_contract WHERE code = 'control_entitlement_override'
        AND status = 'active' AND capture_mode = 'safe_values'`.execute(tx)).rows.length) throw failure(503, "ENTITLEMENT_AUDIT_UNAVAILABLE");
    });
    return { status: "healthy" };
  }

  async listPlans(): Promise<readonly EntitlementPlan[]> {
    return this.db.transaction().execute(async (tx) => {
      await this.assertPlane(tx);
      return (await sql<Row>`${planProjection} WHERE p.status = 'active' ORDER BY p.code`.execute(tx)).rows.map(planRow);
    });
  }

  async getPlan(code: string, at: string): Promise<EntitlementPlan | undefined> {
    instant(at);
    return this.db.transaction().execute(async (tx) => {
      await this.assertPlane(tx);
      const row = (await sql<Row>`SELECT * FROM control.entitlement_plan_at(${code}, ${at}::timestamptz)`.execute(tx)).rows[0];
      return row ? planRow(row) : undefined;
    });
  }

  async listModules(): Promise<readonly string[]> {
    return this.db.transaction().execute(async (tx) => {
      await this.assertPlane(tx);
      return (await sql<Row>`SELECT code FROM control.module WHERE status = 'active' ORDER BY code`.execute(tx)).rows.map(row => String(row["code"]));
    });
  }

  async getOverride(tenantId: string, id: string): Promise<TenantEntitlementOverride | undefined> {
    uuid(id);
    return this.tenantTransaction(tenantId, undefined, async (tx) => this.readOverride(tx, tenantId, id));
  }

  async saveOverride(input: SaveInput, actorId: string): Promise<TenantEntitlementOverride> {
    validate(input);
    return this.tenantTransaction(input.tenantId, actorId, async (tx) => {
      // A single lock namespace also prevents collisions between module and limit IDs.
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`control.entitlement:${input.id}`}, 0))`.execute(tx);
      const current = await this.readOverride(tx, input.tenantId, input.id);
      if ((current?.version ?? 0) !== input.expectedVersion) throw failure(409, "VERSION_CONFLICT");
      if (current?.status === "expired") throw failure(409, "LIFECYCLE_INVALID");
      // The existing usage schema seals metric coordinates. Apply the same rule to modules.
      if (current && (current.moduleCode !== input.moduleCode || current.limitCode !== input.limitCode)) {
        throw failure(409, "ENTITLEMENT_TARGET_IMMUTABLE");
      }
      // Serializable isolation validates against one consistent catalog snapshot.
      const plan = (await sql<Row>`SELECT * FROM control.entitlement_plan_at(${input.planCode}, ${input.effectiveFrom}::timestamptz)`.execute(tx)).rows[0];
      if (!plan) throw failure(404, "DEFINITION_NOT_FOUND");
      const planId = String(plan["id"]);
      const target = input.moduleCode !== undefined
        ? (await sql<Row>`SELECT id FROM control.module WHERE code = ${input.moduleCode} AND status = 'active'`.execute(tx)).rows[0]
        : (await sql<Row>`SELECT m.id FROM control.usage_metric_catalog m
            WHERE m.code = ${input.limitCode!} AND m.status = 'active'
              AND ${JSON.stringify(plan["limits"])}::jsonb ? ${input.limitCode!}`.execute(tx)).rows[0];
      if (!target) throw failure(404, "DEFINITION_NOT_FOUND");
      const module = input.moduleCode !== undefined;
      const table = sql.table(module ? "control.tenant_module_entitlement_override" : "control.tenant_usage_limit_override");
      const targetColumn = sql.ref(module ? "module_id" : "usage_metric_id");
      if (!current) {
        // Reject an ID already used by the other target type, including another tenant.
        // RLS hides other tenants; their collisions in the same table become a generic 409.
        const otherTable = sql.table(module ? "control.tenant_usage_limit_override" : "control.tenant_module_entitlement_override");
        if ((await sql<Row>`SELECT id FROM ${otherTable} WHERE tenant_id = ${input.tenantId}::uuid AND id = ${input.id}::uuid`.execute(tx)).rows[0]) throw failure(409, "VERSION_CONFLICT");
        await sql`INSERT INTO ${table} (id, tenant_id, subscription_plan_id, ${targetColumn},
          ${module ? sql`` : sql`limit_value,`} reason, effective_from, effective_until, version, created_by)
          VALUES (${input.id}::uuid, ${input.tenantId}::uuid, ${planId}::uuid, ${String(target["id"])}::uuid,
          ${module ? sql`` : sql`${input.limitValue!}::bigint,`} ${input.reason.trim()}, ${input.effectiveFrom}::timestamptz,
          ${input.effectiveUntil ?? null}::timestamptz, 1, ${actorId}::uuid)`.execute(tx);
      } else {
        const changed = await sql<Row>`UPDATE ${table} SET subscription_plan_id = ${planId}::uuid,
          ${module ? sql`` : sql`limit_value = ${input.limitValue!}::bigint,`}
          reason = ${input.reason.trim()}, effective_from = ${input.effectiveFrom}::timestamptz,
          effective_until = ${input.effectiveUntil ?? null}::timestamptz, version = version + 1,
          updated_at = clock_timestamp(), updated_by = ${actorId}::uuid
          WHERE tenant_id = ${input.tenantId}::uuid AND id = ${input.id}::uuid
            AND version = ${input.expectedVersion} AND status = 'active' RETURNING id`.execute(tx);
        if (!changed.rows.length) throw failure(409, "VERSION_CONFLICT");
      }
      const saved = (await this.readOverride(tx, input.tenantId, input.id))!;
      await this.evidence(tx, actorId, current, saved, current ? "updated" : "created");
      return saved;
    });
  }

  async expireOverride(tenantId: string, id: string, expectedVersion: number, actorId: string): Promise<TenantEntitlementOverride> {
    uuid(id);
    version(expectedVersion, 1);
    return this.tenantTransaction(tenantId, actorId, async (tx) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`control.entitlement:${id}`}, 0))`.execute(tx);
      const current = await this.readOverride(tx, tenantId, id);
      if (!current) throw failure(404, "NOT_FOUND");
      if (current.version !== expectedVersion) throw failure(409, "VERSION_CONFLICT");
      if (current.status === "expired") return current;
      const table = sql.table(current.moduleCode !== undefined ? "control.tenant_module_entitlement_override" : "control.tenant_usage_limit_override");
      const changed = await sql<Row>`UPDATE ${table} SET status = 'deprecated', version = version + 1,
        effective_until = CASE WHEN effective_from < statement_timestamp()
          THEN least(coalesce(effective_until, statement_timestamp()), statement_timestamp()) ELSE effective_until END,
        status_changed_at = clock_timestamp(), status_changed_by = ${actorId}::uuid,
        updated_at = clock_timestamp(), updated_by = ${actorId}::uuid
        WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid AND version = ${expectedVersion}
          AND status = 'active' RETURNING id`.execute(tx);
      if (!changed.rows.length) throw failure(409, "VERSION_CONFLICT");
      const expired = (await this.readOverride(tx, tenantId, id))!;
      await this.evidence(tx, actorId, current, expired, "expired");
      return expired;
    });
  }

  private async readOverride(tx: Transaction<Database>, tenantId: string, id: string): Promise<TenantEntitlementOverride | undefined> {
    const row = (await sql<Row>`SELECT o.id, o.tenant_id, p.code AS plan_code, m.code AS module_code,
        NULL::text AS limit_code, NULL::bigint AS limit_value, o.reason, o.effective_from, o.effective_until, o.version, o.status
      FROM control.tenant_module_entitlement_override o JOIN control.subscription_plan p ON p.id = o.subscription_plan_id
      JOIN control.module m ON m.id = o.module_id WHERE o.tenant_id = ${tenantId}::uuid AND o.id = ${id}::uuid
      UNION ALL
      SELECT o.id, o.tenant_id, p.code, NULL::text, m.code, o.limit_value, o.reason,
        o.effective_from, o.effective_until, o.version, o.status
      FROM control.tenant_usage_limit_override o JOIN control.subscription_plan p ON p.id = o.subscription_plan_id
      JOIN control.usage_metric_catalog m ON m.id = o.usage_metric_id
      WHERE o.tenant_id = ${tenantId}::uuid AND o.id = ${id}::uuid AND o.dimension_code = '*'`.execute(tx)).rows;
    if (row.length > 1) throw failure(409, "ENTITLEMENT_ID_CONFLICT");
    return row[0] ? overrideRow(row[0]) : undefined;
  }

  private async assertPlane(tx: Transaction<Database>): Promise<void> {
    const row = (await sql<Row>`SELECT current_setting('app.database_plane', true) AS plane`.execute(tx)).rows[0];
    if (row?.["plane"] !== this.plane) throw failure(503, "ENTITLEMENT_PLANE_MISMATCH");
  }

  private async tenantTransaction<T>(tenantId: string, actorId: string | undefined, work: (tx: Transaction<Database>) => Promise<T>): Promise<T> {
    uuid(tenantId);
    if (actorId !== undefined) uuid(actorId);
    try {
      return await this.db.transaction().setIsolationLevel("serializable").execute(async (tx) => {
        await this.assertPlane(tx);
        await sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true),
          set_config('app.current_principal_id', ${actorId ?? ""}, true),
          set_config('app.current_actor_type', 'user', true)`.execute(tx);
        return work(tx);
      });
    } catch (cause) {
      if (cause instanceof HttpError) throw cause;
      const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
      if (code === "23505" || code === "40001" || code === "40P01") throw failure(409, "VERSION_CONFLICT");
      if (code === "23P01") throw failure(409, "ENTITLEMENT_OVERLAP");
      // Constraint/audit failures remain failures: never acknowledge a partial write.
      throw cause;
    }
  }

  private async evidence(tx: Transaction<Database>, actorId: string, before: TenantEntitlementOverride | undefined,
    after: TenantEntitlementOverride, action: "created" | "updated" | "expired"): Promise<void> {
    const event = `control.entitlement_override.${action}`;
    const entityType = after.moduleCode !== undefined ? "control.tenant_module_entitlement_override" : "control.tenant_usage_limit_override";
    const cache = { namespace: "entitlements", tenantId: after.tenantId, keys: [...new Set([before?.planCode, after.planCode].filter((code): code is string => code !== undefined))] };
    const audit = (await sql<Row>`SELECT audit.append_event(
      p_event_code => ${event}, p_operation => ${action === "created" ? "create" : "update"}::audit.operation_d,
      p_entity_type => ${entityType}, p_entity_id => ${after.id}::uuid,
      p_old_values => ${before ? JSON.stringify(before) : null}::jsonb,
      p_new_values => ${JSON.stringify(after)}::jsonb,
      p_context => ${JSON.stringify({ source: "control-admin", plane: this.plane, cacheInvalidation: cache })}::jsonb
    ) AS id`.execute(tx)).rows[0];
    await sql`INSERT INTO event.outbox (tenant_id, topic, event_type, event_key, entity_type, entity_id,
      aggregate_type, aggregate_id, actor_id, source, partition_key, payload, created_by)
      VALUES (${after.tenantId}::uuid, 'control.entitlements', ${event}, ${`${after.id}:${after.version}`},
        ${entityType}, ${after.id}::uuid, 'control.entitlement_override', ${after.id}::uuid,
        ${actorId}::uuid, 'control-admin', ${after.tenantId},
        ${JSON.stringify({ schemaVersion: 1, plane: this.plane, actorId, auditEventId: String(audit?.["id"]), before: before ?? null, after, cacheInvalidation: cache })}::jsonb,
        ${actorId}::uuid)`.execute(tx);
  }
}

export function createKyselyEntitlementRepositories(databases: Readonly<Partial<Record<Plane, Kysely<Database>>>>): ExactPlaneRepositoryProvider<EntitlementRepository> {
  const registry: Partial<Record<Plane, KyselyEntitlementRepository>> = {};
  for (const plane of ["studio", "neon", "mesh"] as const) {
    const db = databases[plane];
    if (db) registry[plane] = new KyselyEntitlementRepository(db, plane);
  }
  return createExactPlaneRepositoryProvider<EntitlementRepository>(registry, {
    unavailableCode: "CONTROL_ADMIN_ENTITLEMENT_REPOSITORY_UNAVAILABLE",
    health: Object.fromEntries(Object.entries(registry).map(([plane, repository]) => [plane, () => repository.health()])),
  });
}

function planRow(row: Row): EntitlementPlan {
  const limits = Object.fromEntries(Object.entries(row["limits"] as Record<string, string | null>)
    .map(([code, value]) => [code, value === null ? null : safeLimit(value)]));
  return { code: String(row["code"]), version: Number(row["version"]), modules: row["modules"] as string[], limits, effectiveFrom: iso(row["effective_from"]),
    ...(row["effective_until"] == null ? {} : {effectiveUntil: iso(row["effective_until"])}) };
}
function overrideRow(row: Row): TenantEntitlementOverride {
  const limitValue = row["limit_value"] === null ? undefined : safeLimit(row["limit_value"]);
  return { id: String(row["id"]), tenantId: String(row["tenant_id"]), planCode: String(row["plan_code"]),
    ...(row["module_code"] !== null ? { moduleCode: String(row["module_code"]) } : { limitCode: String(row["limit_code"]), limitValue: limitValue! }),
    reason: String(row["reason"]), effectiveFrom: iso(row["effective_from"]),
    ...(row["effective_until"] === null ? {} : { effectiveUntil: iso(row["effective_until"]) }),
    version: Number(row["version"]), status: row["status"] === "active" ? "active" : "expired" };
}
function iso(value: unknown): string { return new Date(value instanceof Date ? value : String(value)).toISOString(); }
function failure(status: number, suffix: string): HttpError { const code = `CONTROL_ADMIN_${suffix}`; return new HttpError(status, code, code); }
function uuid(value: string): void { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw failure(400, "INVALID_COMMAND"); }
function instant(value: string): number { const result = parseInstant(value); if (!Number.isFinite(result)) throw failure(400, "INVALID_EFFECTIVE_RANGE"); return result; }
function version(value: number, minimum: number): void { if (!Number.isSafeInteger(value) || value < minimum || value >= 2147483647) throw failure(400, "INVALID_COMMAND"); }
function validate(input: SaveInput): void {
  uuid(input.id); version(input.expectedVersion, 0);
  const module = input.moduleCode !== undefined;
  if (!input.reason?.trim() || !input.planCode || module && (!input.moduleCode || input.limitCode !== undefined || input.limitValue !== undefined)
    || !module && (!input.limitCode || typeof input.limitValue !== "number" || !Number.isSafeInteger(input.limitValue) || input.limitValue < 0)) throw failure(400, "INVALID_COMMAND");
  const from = instant(input.effectiveFrom);
  if (input.effectiveUntil !== undefined && instant(input.effectiveUntil) <= from) throw failure(400, "INVALID_EFFECTIVE_RANGE");
}

function safeLimit(value: unknown): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw failure(500, "ENTITLEMENT_LIMIT_OUT_OF_RANGE");
  return result;
}
