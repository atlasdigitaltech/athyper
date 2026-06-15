import { sql } from "kysely";
import type { Kysely } from "kysely";

type AnyDb = Record<string, any>;

const MODULE_ACCESS_CACHE_TTL_SEC = 60;

export interface EffectiveModuleAccess {
  moduleIds: string[];
  moduleCodes: string[];
  workspaceIds: string[];
  source: "role_binding" | "tenant_default";
}

interface ModuleAccessCacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, exFlag: "EX", ttl: number): Promise<unknown>;
}

export interface GetEffectiveModuleAccessOptions {
  cache?: ModuleAccessCacheClient;
  authEpoch?: number;
  planVersionId?: string;
}

interface CachePayload extends EffectiveModuleAccess {
  cache_version: 1;
}

const dedupeStrings = (values: Array<string | null>): string[] => {
  return [...new Set(values.filter((value): value is string => value !== null && value !== ""))];
};

function moduleAccessCacheKey(
  tenantId: string,
  principalId: string,
  planVersionId: string,
  authEpoch: number,
): string {
  return `iam:module-access:${tenantId}:${principalId}:${planVersionId}:${authEpoch}`;
}

function parseModuleAccessCache(raw: string | null): EffectiveModuleAccess | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CachePayload>;
    if (parsed.cache_version !== 1) return null;
    if (!parsed.moduleIds || !parsed.moduleCodes || !parsed.workspaceIds || !parsed.source) return null;
    return {
      moduleIds: dedupeStrings(parsed.moduleIds),
      moduleCodes: dedupeStrings(parsed.moduleCodes),
      workspaceIds: dedupeStrings(parsed.workspaceIds),
      source: parsed.source === "tenant_default" ? "tenant_default" : "role_binding",
    };
  } catch {
    return null;
  }
}

async function resolveTenantPlanVersion(
  db: Kysely<AnyDb>,
  tenantId: string,
): Promise<string | null> {
  const row = await sql<{ plan_version_id: string | null }>`
    SELECT spv.id::text AS plan_version_id
    FROM master.tenant t
    JOIN shared.subscription_plan sp
      ON sp.code = t.subscription
    JOIN shared.subscription_plan_version spv
      ON spv.plan_id = sp.id
     AND spv.valid_to IS NULL
     AND spv.status = 'active'
    WHERE t.id = ${tenantId}
    LIMIT 1
  `.execute(db);

  return row.rows[0]?.plan_version_id ?? null;
}

export async function getEffectiveModuleAccess(
  db: Kysely<AnyDb>,
  tenantId: string,
  principalId: string,
  options: GetEffectiveModuleAccessOptions = {},
): Promise<EffectiveModuleAccess> {
  const cache = options.cache;
  const authEpoch = options.authEpoch ?? 0;
  const planVersionId = options.planVersionId ?? await resolveTenantPlanVersion(db, tenantId);
  if (!planVersionId) {
    return {
      moduleIds: [],
      moduleCodes: [],
      workspaceIds: [],
      source: "tenant_default",
    };
  }

  if (cache) {
    const cacheKey = moduleAccessCacheKey(tenantId, principalId, planVersionId, authEpoch);
    const cached = await cache.get(cacheKey).catch(() => null);
    const parsed = parseModuleAccessCache(cached);
    if (parsed) return parsed;
  }

    const rows = await sql<{
      module_id: string | null;
      module_code: string | null;
      workspace_id: string | null;
      from_role_binding: boolean;
    }>`
    WITH group_role_modules AS (
      SELECT DISTINCT r.module_id, r.workspace_id
      FROM master.auth_group_member gm
      JOIN master.auth_group_role gr
        ON gr.group_id = gm.group_id
       AND gr.tenant_id = gm.tenant_id
       AND gr.status = 'active'
       AND (gr.expires_at IS NULL OR gr.expires_at > now())
      JOIN shared.role r
        ON r.id = gr.role_id
       AND r.status = 'active'
      WHERE gm.tenant_id = ${tenantId}
        AND gm.principal_id = ${principalId}
        AND r.module_id IS NOT NULL
    ),
    plan_modules AS (
      SELECT DISTINCT
        m.id AS module_id,
        m.code::text AS module_code,
        m.workspace_id::text AS workspace_id
      FROM shared.plan_module_access pma
      JOIN shared.module m
        ON m.id = pma.module_id
     WHERE pma.plan_version_id = ${planVersionId}::uuid
       AND pma.is_included = true
       AND m.status = 'active'
    ),
    role_bound_modules AS (
      SELECT
        grm.module_id,
        grm.workspace_id::text AS workspace_id,
        m.code::text AS module_code
      FROM group_role_modules grm
      JOIN shared.module m
        ON m.id = grm.module_id
      JOIN plan_modules pm
        ON pm.module_id = grm.module_id
      WHERE m.status = 'active'
    ),
    resolved_modules AS (
      SELECT
        rbm.module_id::text AS module_id,
        rbm.module_code,
        rbm.workspace_id,
        true AS from_role_binding
      FROM role_bound_modules rbm
      UNION ALL
      SELECT
        pm.module_id::text AS module_id,
        pm.module_code,
        pm.workspace_id,
        false AS from_role_binding
      FROM plan_modules pm
      WHERE NOT EXISTS (SELECT 1 FROM role_bound_modules)
    )
    SELECT
      r.module_id::text AS module_id,
      r.module_code,
      r.workspace_id::text AS workspace_id,
      r.from_role_binding
    FROM resolved_modules r
    ORDER BY r.module_code NULLS LAST;
  `.execute(db);

  const moduleRows = rows.rows.filter((row) => row.module_id !== null);
  const roleBoundModuleRows = moduleRows.filter((row) => row.from_role_binding);
  const moduleIds = dedupeStrings(moduleRows.map((row) => row.module_id));
  const moduleCodes = dedupeStrings(moduleRows.map((row) => row.module_code));
  const workspaceIds = dedupeStrings(moduleRows.map((row) => row.workspace_id));

  const result: EffectiveModuleAccess = {
    moduleIds,
    moduleCodes,
    workspaceIds,
    source: roleBoundModuleRows.length > 0 ? "role_binding" : "tenant_default",
  };

  if (cache) {
    const cacheKey = moduleAccessCacheKey(tenantId, principalId, planVersionId, authEpoch);
    await cache.set(
      cacheKey,
      JSON.stringify({ cache_version: 1, ...result }),
      "EX",
      MODULE_ACCESS_CACHE_TTL_SEC,
    ).catch(() => undefined);
  }

  return result;
}
