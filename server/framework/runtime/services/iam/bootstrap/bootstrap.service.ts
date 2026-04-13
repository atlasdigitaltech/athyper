/**
 * IAM Bootstrap Service — v4.1
 *
 * Resolves the complete set of tenants and entities (company codes) accessible
 * to a principal, using the KC JWT org aliases as the tenant list and the DB
 * group_role model to resolve company_code access within each tenant.
 *
 * Cache key: `bootstrap:{sub}:{tenant_hash}` — TTL 300 s
 * tenant_hash = short hash of sorted orgAliases (cache busts when org set changes)
 *
 * DB resolution per tenant:
 *   principal_auth_binding → principal
 *   group_member → group_role → shared.role (persona_id, module_id)
 *   CTE: scope_all=true → all active company_codes; else explicit company_code_id bindings
 *   delegation_grant → delegation_count (non-revoked, non-expired, across all tenants)
 *
 * Schema note:
 *   - `group_role.scope = 'all'` maps to spec's `scope_all = true`
 *   - `group_role.company_code_id` (nullable FK) maps to spec's `group_role_company_code` junction
 *   - `shared.role` is the canonical role table (not `master.role`, which was dropped)
 */

import { sql } from "kysely";
import type { Kysely } from "kysely";

import type {
  BootstrapQuery,
  BootstrapResponse,
  BootstrapTenant,
  BootstrapEntity,
} from "../session/session.types.js";
import type { CacheClient, CacheMetrics } from "../session/session.service.js";

const BOOTSTRAP_CACHE_TTL_SEC = 300; // 5 min

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Record<string, any>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derive a short stable hash from a sorted list of org aliases.
 * Used as part of the cache key so the key busts when org membership changes.
 */
function tenantHash(aliases: string[]): string {
  // Simple djb2-style hash over the sorted concatenation — no crypto needed here.
  const str = [...aliases].sort().join("|");
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0; // keep unsigned 32-bit
  }
  return h.toString(16);
}

/**
 * Group org aliases by tenant code (the part before the first "--").
 * e.g. ["athyper--ATHQ", "athyper--ASAC", "pepsi--PEPSI"]
 *   → { athyper: ["ATHQ", "ASAC"], pepsi: ["PEPSI"] }
 */
function groupAliasesByTenant(aliases: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const alias of aliases) {
    const idx = alias.indexOf("--");
    if (idx < 1) continue;
    const tenantCode = alias.slice(0, idx);
    const entityCode = alias.slice(idx + 2);
    const existing = map.get(tenantCode);
    if (existing) {
      existing.push(entityCode);
    } else {
      map.set(tenantCode, [entityCode]);
    }
  }
  return map;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export interface BootstrapServiceDeps {
  db: Kysely<AnyDb>;
  cache: CacheClient;
  metrics?: CacheMetrics;
}

export interface BootstrapService {
  resolve(query: BootstrapQuery): Promise<BootstrapResponse>;
  invalidate(sub: string): Promise<void>;
}

// Bootstrap is cross-tenant by design — one cache key covers all org aliases.
// Metrics use "bootstrap" as the tenant label to indicate the layer; per-tenant
// breakdown comes from the session service which resolves one tenant at a time.
const METRICS_TENANT = "bootstrap";

export function createBootstrapService(deps: BootstrapServiceDeps): BootstrapService {
  const { db, cache, metrics } = deps;

  async function resolve(query: BootstrapQuery): Promise<BootstrapResponse> {
    const { sub, realmKey, name, email, orgAliases, workbenches } = query;

    // ── Cache check ────────────────────────────────────────────────────────────
    const hash = tenantHash(orgAliases);
    const cacheKey = `bootstrap:${sub}:${hash}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      metrics?.hit(METRICS_TENANT);
      return JSON.parse(cached) as BootstrapResponse;
    }
    metrics?.miss(METRICS_TENANT);

    // ── Group aliases by tenant ────────────────────────────────────────────────
    const aliasByTenant = groupAliasesByTenant(orgAliases);

    // ── Resolve each tenant in parallel ───────────────────────────────────────
    const tenantResults = await Promise.all(
      [...aliasByTenant.entries()].map(([tenantCode]) =>
        resolveTenant(sub, tenantCode, realmKey, workbenches, db),
      ),
    );

    // Filter out tenants that couldn't be resolved (not in DB, inactive)
    const tenants = tenantResults.filter((t): t is BootstrapTenant => t !== null);
    tenants.sort((a, b) => a.code.localeCompare(b.code));

    // ── Total delegation count across all tenants ──────────────────────────────
    // Aggregate non-revoked, non-expired grants where the user is the delegate.
    // We query per resolved tenantId to stay within the principal's scope.
    let delegation_count = 0;
    for (const tenant of tenants) {
      const tenantRow = await db
        .selectFrom("master.tenant")
        .select("id")
        .where("realm_key", "=", realmKey)
        .where("code", "=", tenant.code)
        .executeTakeFirst();
      if (!tenantRow) continue;

      const principalRow = await db
        .selectFrom("master.principal_auth_binding as pab")
        .select("pab.principal_id")
        .where("pab.subject_id", "=", sub)
        .where("pab.provider_code", "=", "keycloak")
        .where("pab.tenant_id", "=", tenantRow.id)
        .executeTakeFirst();
      if (!principalRow) continue;

      const countRow = await db
        .selectFrom("master.delegation_grant")
        .select((eb) => [eb.fn.countAll<number>().as("cnt")])
        .where("delegate_id", "=", principalRow.principal_id)
        .where("tenant_id", "=", tenantRow.id)
        .where("is_revoked", "=", false)
        .where("expires_at", ">", sql`now()`)
        .executeTakeFirst();
      delegation_count += countRow?.cnt ?? 0;
    }

    const response: BootstrapResponse = {
      principal: { id: sub, name, email },
      tenants,
      delegation_count,
    };

    await cache.set(cacheKey, JSON.stringify(response), "EX", BOOTSTRAP_CACHE_TTL_SEC);
    metrics?.write(METRICS_TENANT);

    // P2: Track in per-principal set for SMEMBERS-based bulk invalidation.
    // Set TTL is refreshed on every write so it lives as long as any bootstrap
    // entry for this sub remains active.
    if (typeof cache.sadd === "function" && typeof cache.expire === "function") {
      await cache.sadd(`bootstrap_keys:${sub}`, cacheKey);
      await cache.expire(`bootstrap_keys:${sub}`, BOOTSTRAP_CACHE_TTL_SEC);
    }

    return response;
  }

  async function invalidate(sub: string): Promise<void> {
    const setKey = `bootstrap_keys:${sub}`;

    // P2 path: use per-principal set
    if (typeof cache.smembers === "function") {
      const keys = await cache.smembers(setKey);
      if (keys.length > 0) {
        await cache.del([...keys, setKey]);
        metrics?.invalidated(METRICS_TENANT, keys.length);
        return;
      }
      // Fall through to SCAN if set is empty (pre-migration entries)
    }

    // Fallback: SCAN for entries written before P2 migration
    if (typeof cache.scan !== "function") return;
    const pattern = `bootstrap:${sub}:*`;
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [nextCursor, found] = await cache.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      keys.push(...found);
    } while (cursor !== "0");
    if (keys.length > 0) {
      await cache.del(keys);
      metrics?.invalidated(METRICS_TENANT, keys.length);
    }
  }

  return { resolve, invalidate };
}

// ─── Per-tenant resolution ────────────────────────────────────────────────────

async function resolveTenant(
  sub: string,
  tenantCode: string,
  realmKey: string,
  workbenches: string[],
  db: Kysely<AnyDb>,
): Promise<BootstrapTenant | null> {
  // Look up the tenant
  const tenantRow = await db
    .selectFrom("master.tenant")
    .select(["id", "name", "display_name", "status"])
    .where("realm_key", "=", realmKey)
    .where("code", "=", tenantCode)
    .executeTakeFirst();

  if (!tenantRow || tenantRow.status !== "active") return null;
  const tenantId: string = tenantRow.id;

  // Resolve the principal in this tenant
  const principalRow = await db
    .selectFrom("master.principal_auth_binding as pab")
    .innerJoin("master.principal as p", (join) =>
      join.onRef("p.id", "=", "pab.principal_id").on("p.tenant_id", "=", tenantId),
    )
    .select(["pab.principal_id", "p.is_active", "p.is_locked"])
    .where("pab.subject_id", "=", sub)
    .where("pab.provider_code", "=", "keycloak")
    .where("pab.tenant_id", "=", tenantId)
    .executeTakeFirst();

  if (!principalRow || !principalRow.is_active || principalRow.is_locked) return null;
  const principalId: string = principalRow.principal_id;

  // ── Entity CTE via raw SQL ─────────────────────────────────────────────────
  // Adapted from spec query:
  //   - scope_all = (scope = 'all')
  //   - group_role_company_code → group_role.company_code_id directly
  //   - master.role → shared.role
  //
  // Returns one row per {company_code, persona} for this principal in this tenant.
  const entityRows = await sql<{
    entity_code: string;
    entity_name: string;
    entity_type: string;
    country_code: string;
    legal_entity_code: string;
    persona_code: string;
    module_count: number;
  }>`
    WITH principal_roles AS (
      SELECT
        gr.id            AS group_role_id,
        (gr.scope = 'all') AS scope_all,
        r.persona_id,
        r.module_id,
        gr.company_code_id
      FROM master.group_member  gm
      JOIN master.group_role    gr
        ON  gr.group_id   = gm.group_id
        AND gr.tenant_id  = gm.tenant_id
        AND gr.is_active  = true
      JOIN shared.role          r
        ON  r.id = gr.role_id
      WHERE gm.principal_id = ${principalId}
        AND gm.tenant_id    = ${tenantId}
    ),
    accessible_company_codes AS (
      -- Explicit company_code grants (scope_all = false)
      SELECT DISTINCT company_code_id AS id
      FROM principal_roles
      WHERE scope_all = false
        AND company_code_id IS NOT NULL

      UNION

      -- scope_all = true → every active company_code in this tenant
      SELECT cc.id
      FROM master.company_code cc
      WHERE cc.tenant_id = ${tenantId}
        AND cc.is_active  = true
        AND EXISTS (SELECT 1 FROM principal_roles WHERE scope_all = true)
    )
    SELECT
      cc.code                     AS entity_code,
      cc.name                     AS entity_name,
      le.entity_type,
      le.country_code,
      le.code                     AS legal_entity_code,
      p.code                      AS persona_code,
      COUNT(DISTINCT pr.module_id)::int AS module_count
    FROM accessible_company_codes acc
    JOIN master.company_code   cc ON cc.id = acc.id
    JOIN master.legal_entity   le ON le.id = cc.legal_entity_id
    JOIN principal_roles       pr ON (pr.scope_all = true OR pr.company_code_id = acc.id)
    JOIN shared.persona         p ON p.id = pr.persona_id
    GROUP BY cc.code, cc.name, le.entity_type, le.country_code, le.code, p.code
    ORDER BY cc.code
  `.execute(db);

  const entities: BootstrapEntity[] = entityRows.rows.map((r) => ({
    code: r.entity_code,
    name: r.entity_name,
    type: r.entity_type,
    country: r.country_code,
    legal_entity: r.legal_entity_code,
    workbenches: workbenches as ("user" | "partner" | "admin")[],
    persona_summary: r.persona_code,
    module_count: Number(r.module_count),
  }));

  return {
    code: tenantCode,
    name: tenantRow.display_name ?? tenantRow.name,
    workbenches: workbenches as ("user" | "partner" | "admin")[],
    entities,
  };
}
