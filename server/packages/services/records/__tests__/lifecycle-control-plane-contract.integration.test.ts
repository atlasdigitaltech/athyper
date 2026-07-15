import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveLifecycleCommand } from "../routes/lifecycle-command.registry.js";

const LIVE_DATABASE_URL = process.env["WORKFLOW_RUNTIME_INTEGRATION_DATABASE_URL"]
  ?? process.env["DATABASE_URL"];
const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

const CONTROL_PLANE_LIFECYCLES = [
  "purchase_requisition",
  "purchase_order_confirmation",
  "delivery_note",
  "receipt",
  "service_sheet",
  "purchase_invoice",
  "payment_entry",
  "commitment",
] as const;

interface QueryablePool {
  query<T extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
  end(): Promise<void>;
}

interface MetadataCommandRow extends Record<string, unknown> {
  entity_code: string;
  permission_code: string;
  handler_target: string | null;
  execution_target: string;
}

interface MatrixEntry {
  lifecycleCode: string;
  fromState: string;
  toState: string;
  expectedConfig: Record<string, string>;
}

let pool: QueryablePool | undefined;

maybeDescribe("lifecycle control-plane live database contract", () => {
  beforeAll(async () => {
    const pgModule = await import("pg");
    const Pool = (pgModule.default as { Pool?: unknown } | undefined)?.Pool
      ?? (pgModule as { Pool?: unknown }).Pool;
    if (!Pool) throw new Error("The pg package is required for lifecycle contract integration tests");
    pool = new (Pool as new (config: Record<string, unknown>) => QueryablePool)({
      connectionString: LIVE_DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 10_000,
    });
    await pool.query("select 1");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("resolves every active metadata execution target to one server command", async () => {
    const { rows } = await db().query<MetadataCommandRow>(`
      SELECT entity_name AS entity_code, permission_code, handler_target, execution_target
        FROM control.entity_operation
       WHERE is_enabled = true
         AND execution_target IS NOT NULL
       ORDER BY tenant_id NULLS FIRST, entity_name, permission_code
    `);
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      const [namespace, operationCode] = row.execution_target.split(":", 2);
      expect(namespace, `unknown execution namespace for ${row.entity_code}.${row.permission_code}`)
        .toBe("lifecycle");
      expect(operationCode).toBeTruthy();
      const flowCode = row.handler_target?.startsWith("flow:")
        ? row.handler_target.slice("flow:".length)
        : undefined;
      expect(() => resolveLifecycleCommand(row.entity_code, operationCode!, flowCode)).not.toThrow();
    }
  });

  it("gives every active lifecycle command exactly one transition", async () => {
    const { rows } = await db().query(`
      SELECT eo.tenant_id, eo.entity_name, eo.permission_code, eo.execution_target,
             count(lt.id)::int AS transition_count
        FROM control.entity_operation eo
        LEFT JOIN LATERAL (
          SELECT el.lifecycle_id
            FROM control.entity_lifecycle el
           WHERE el.entity_name = eo.entity_name
             AND (el.tenant_id IS NULL OR el.tenant_id = eo.tenant_id)
           ORDER BY CASE WHEN el.tenant_id = eo.tenant_id THEN 0 ELSE 1 END,
                    el.priority, el.id
           LIMIT 1
        ) binding ON true
        LEFT JOIN control.lifecycle lc
          ON lc.id = binding.lifecycle_id AND lc.is_active = true
        LEFT JOIN control.lifecycle_transition lt
          ON lt.lifecycle_id = lc.id
         AND lt.is_active = true
         AND lower(lt.operation_code) = split_part(eo.execution_target, ':', 2)
       WHERE eo.is_enabled = true
         AND eo.execution_target LIKE 'lifecycle:%'
       GROUP BY eo.id
      HAVING count(lt.id) <> 1
       ORDER BY eo.entity_name, eo.permission_code
    `);
    expect(rows).toEqual([]);
  });

  it("enforces hook cardinality, idempotency slots, registries, and permissions", async () => {
    const { rows } = await db().query(`
      WITH scoped_transitions AS (
        SELECT lt.id, lower(lt.operation_code) AS operation_code,
               lc.code AS lifecycle_code, fs.code AS from_state, ts.code AS to_state
          FROM control.lifecycle_transition lt
          JOIN control.lifecycle lc ON lc.id = lt.lifecycle_id
          JOIN control.lifecycle_state fs ON fs.id = lt.from_state_id
          JOIN control.lifecycle_state ts ON ts.id = lt.to_state_id
         WHERE lc.tenant_id IS NULL AND lc.is_active = true
           AND lt.tenant_id IS NULL AND lt.is_active = true
           AND lc.code = ANY($1::text[])
      ), tenant_scopes AS (
        SELECT NULL::uuid AS tenant_id
        UNION
        SELECT DISTINCT h.tenant_id
          FROM control.lifecycle_transition_hook h
          JOIN scoped_transitions st ON st.id = h.transition_id
         WHERE h.tenant_id IS NOT NULL AND h.is_active = true
      ), effective_hooks AS (
        SELECT s.tenant_id AS scope_tenant_id, st.id AS transition_id,
               st.lifecycle_code, st.from_state, st.to_state, st.operation_code, h.action
          FROM tenant_scopes s
          CROSS JOIN scoped_transitions st
          LEFT JOIN LATERAL control.resolve_effective_lifecycle_hooks(s.tenant_id, st.id) h
            ON true
      ), findings AS (
        SELECT 'activity cardinality' AS contract, lifecycle_code, from_state, to_state,
               scope_tenant_id::text AS detail
          FROM effective_hooks
         GROUP BY scope_tenant_id, transition_id, lifecycle_code, from_state, to_state
        HAVING count(*) FILTER (WHERE action = 'activity_log.write') <> 1
        UNION ALL
        SELECT 'notification cardinality', lifecycle_code, from_state, to_state,
               scope_tenant_id::text
          FROM effective_hooks
         GROUP BY scope_tenant_id, transition_id, lifecycle_code, from_state, to_state
        HAVING count(*) FILTER (WHERE action = 'notification.publish') > 1
        UNION ALL
        SELECT 'duplicate idempotency slot', lifecycle_code, from_state, to_state,
               concat(coalesce(scope_tenant_id::text, 'platform'), ':', action)
          FROM effective_hooks
         WHERE action IS NOT NULL
         GROUP BY scope_tenant_id, transition_id, lifecycle_code, from_state, to_state, action
        HAVING count(*) > 1
        UNION ALL
        SELECT 'unregistered hook action', st.lifecycle_code, st.from_state, st.to_state, h.action
          FROM control.lifecycle_transition_hook h
          JOIN scoped_transitions st ON st.id = h.transition_id
         WHERE h.is_active = true
           AND NOT EXISTS (
             SELECT 1 FROM control.hook_action_registry r
              WHERE r.action_key = h.action AND r.is_active = true
                AND (r.tenant_id IS NULL OR r.tenant_id = h.tenant_id)
           )
        UNION ALL
        SELECT 'missing operation permission', eo.entity_name, eo.permission_code, '', eo.tenant_id::text
          FROM control.entity_operation eo
         WHERE eo.is_enabled = true
           AND NOT EXISTS (
             SELECT 1 FROM shared.permission p
              WHERE p.code = eo.permission_code AND p.is_active = true
           )
        UNION ALL
        SELECT 'transaction-flow cardinality', lifecycle_code, from_state, to_state,
               scope_tenant_id::text
          FROM effective_hooks
         WHERE operation_code IN ('post', 'reverse', 'void')
         GROUP BY scope_tenant_id, transition_id, lifecycle_code, from_state, to_state
        HAVING count(*) FILTER (WHERE action = 'transaction_flow.dispatch') <> 1
      )
      SELECT * FROM findings ORDER BY contract, lifecycle_code, from_state, to_state
    `, [CONTROL_PLANE_LIFECYCLES]);
    expect(rows).toEqual([]);
  });

  it("materializes every required snapshot and dispatch matrix slot exactly once", async () => {
    for (const action of ["snapshot.capture", "transaction_flow.dispatch"] as const) {
      const matrix = readHookMatrix(action);
      const { rows } = await db().query(`
        WITH expected AS (
          SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
            "lifecycleCode" text, "fromState" text, "toState" text, "expectedConfig" jsonb
          )
        )
        SELECT e."lifecycleCode", e."fromState", e."toState",
               count(h.id)::int AS hook_count,
               count(h.id) FILTER (WHERE h.config @> e."expectedConfig")::int AS matching_config_count
          FROM expected e
          LEFT JOIN control.lifecycle lc
            ON lc.code = e."lifecycleCode" AND lc.tenant_id IS NULL AND lc.is_active = true
          LEFT JOIN control.lifecycle_state fs
            ON fs.lifecycle_id = lc.id AND fs.code = e."fromState"
          LEFT JOIN control.lifecycle_state ts
            ON ts.lifecycle_id = lc.id AND ts.code = e."toState"
          LEFT JOIN control.lifecycle_transition lt
            ON lt.lifecycle_id = lc.id AND lt.from_state_id = fs.id AND lt.to_state_id = ts.id
           AND lt.tenant_id IS NULL AND lt.is_active = true
          LEFT JOIN control.lifecycle_transition_hook h
            ON h.transition_id = lt.id AND h.tenant_id IS NULL AND h.is_active = true
           AND h.action = $2
         GROUP BY e."lifecycleCode", e."fromState", e."toState"
        HAVING count(h.id) <> 1
            OR count(h.id) FILTER (WHERE h.config @> e."expectedConfig") <> 1
         ORDER BY e."lifecycleCode", e."fromState", e."toState"
      `, [JSON.stringify(matrix), action]);
      expect(rows).toEqual([]);
    }
  });
});

function db(): QueryablePool {
  if (!pool) throw new Error("Lifecycle contract database pool is not initialized");
  return pool;
}

function readHookMatrix(action: "snapshot.capture" | "transaction_flow.dispatch"): MatrixEntry[] {
  const source = readFileSync(resolve(
    process.cwd(),
    "db/seed/platform/003_control/072p_p2p_runtime_contract.sql",
  ), "utf8");
  const start = source.indexOf(`${action === "snapshot.capture" ? "3" : "4"}. ${action}`);
  const end = source.indexOf("INSERT INTO control.lifecycle_transition_hook", start);
  if (start < 0 || end <= start) throw new Error(`Could not locate ${action} seed matrix`);

  const entries: MatrixEntry[] = [];
  const tuplePattern = /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'(?:,\s*'([^']+)')?\)/g;
  for (const match of source.slice(start, end).matchAll(tuplePattern)) {
    const [, lifecycleCode, fromState, toState, firstConfig, secondConfig] = match;
    if (!lifecycleCode || !fromState || !toState || !firstConfig) continue;
    entries.push({
      lifecycleCode,
      fromState,
      toState,
      expectedConfig: action === "snapshot.capture"
        ? { gate_event_kind: firstConfig }
        : { event_code: firstConfig, flow_code: secondConfig! },
    });
  }
  if (entries.length === 0) throw new Error(`${action} seed matrix is empty`);
  return entries;
}
