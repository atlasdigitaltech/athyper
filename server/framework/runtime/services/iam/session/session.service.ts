/**
 * IAM Session Service — v4.1
 *
 * Resolves a runtime session context from:
 *   1. KC JWT claims (org alias membership + workbench role validation)
 *   2. DB: tenant → principal → persona → permissions + modules + scope + delegations
 *
 * Cache key: `session:{sub}:{tenant}:{entity}:{workbench}` — TTL 300 s
 * Tenant in key prevents cross-tenant collision when same entity code
 * exists in multiple tenants (e.g. "ATHQ" in "athyper" and "athyper-hq1").
 *
 * Org alias format: "{tenant_code}--{entity_code_lowercase}"  e.g. "athyper--athq"
 * The entity_code from the alias is lowercase; session.resolve() calls
 * entity.toUpperCase() before the company_code lookup (DB stores codes in UPPERCASE).
 */

import { sql } from "kysely";
import type { Kysely } from "kysely";

import { jitProvisionPrincipal } from "../jit/jit.service.js";
import type {
  SessionQuery,
  SessionResponse,
  SessionModule,
  SessionScope,
  DelegationAvailable,
} from "./session.types.js";

const SESSION_CACHE_TTL_SEC = 300; // 5 min

// ─── Metrics interface ────────────────────────────────────────────────────────

/**
 * Tenant-level cache operation counters.
 * Implemented by the metrics module (server/src/metrics.ts) and injected via deps.
 * When omitted, all methods are no-ops — safe to leave unwired in tests.
 */
export interface CacheMetrics {
  /** Cache read returned a cached value — DB round-trip avoided. */
  hit(tenant: string): void;
  /** Cache read returned null — DB resolution required. */
  miss(tenant: string): void;
  /** A resolved value was written to cache. */
  write(tenant: string): void;
  /** One or more keys were deleted (explicit invalidate or outbox-driven). */
  invalidated(tenant: string, count: number): void;
}

// ─── Cache interface ──────────────────────────────────────────────────────────

export interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, exFlag: "EX", ttl: number): Promise<unknown>;
  del(key: string | string[]): Promise<unknown>;
  scan?(
    cursor: string,
    matchFlag: "MATCH",
    pattern: string,
    countFlag: "COUNT",
    count: number,
  ): Promise<[string, string[]]>;
  /** Add a member to a set and refresh the set's TTL. Used for per-principal key tracking. */
  sadd?(key: string, member: string): Promise<unknown>;
  /** Remove a member from a set. Used when a specific session key is explicitly deleted. */
  srem?(key: string, member: string): Promise<unknown>;
  /** Return all members of a set. Used for set-based bulk invalidation (P2 path). */
  smembers?(key: string): Promise<string[]>;
  /** Set a TTL on an existing key without modifying its value. */
  expire?(key: string, ttlSeconds: number): Promise<unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Record<string, any>;

// ─── Error ────────────────────────────────────────────────────────────────────

export class SessionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "SessionError";
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export interface SessionServiceDeps {
  db: Kysely<AnyDb>;
  cache: CacheClient;
  metrics?: CacheMetrics;
}

export interface SessionService {
  resolve(query: SessionQuery): Promise<SessionResponse>;
  invalidate(sub: string, tenant: string, entity: string, workbench: string): Promise<void>;
  /** Invalidate ALL cached sessions for a principal. Requires cache.scan (ioredis). */
  invalidateAll(sub: string): Promise<void>;
}

export function createSessionService(deps: SessionServiceDeps): SessionService {
  const { db, cache, metrics } = deps;

  function cacheKey(
    sub: string,
    tenant: string,
    entity: string,
    wb: string,
    delegationId?: string,
  ): string {
    const base = `session:${sub}:${tenant}:${entity}:${wb}`;
    return delegationId ? `${base}:d:${delegationId}` : base;
  }

  async function resolve(query: SessionQuery): Promise<SessionResponse> {
    const {
      sub, realmKey, tenant, entity, workbench, orgAliases, workbenches, delegationId,
      username, name, email,
    } = query;

    // ── Cache hit ──────────────────────────────────────────────────────────────
    const key = cacheKey(sub, tenant, entity, workbench, delegationId);
    const cached = await cache.get(key);
    if (cached) {
      metrics?.hit(tenant);
      return JSON.parse(cached) as SessionResponse;
    }
    metrics?.miss(tenant);

    // ── Step 1: Validate org membership ────────────────────────────────────────
    const requiredAlias = `${tenant}--${entity}`;
    if (!orgAliases.includes(requiredAlias)) {
      throw new SessionError(
        "ORG_NOT_IN_TOKEN",
        `Org "${requiredAlias}" is not in the user's KC org memberships`,
        403,
      );
    }

    // ── Step 2: Validate workbench ─────────────────────────────────────────────
    if (!workbenches.includes(workbench)) {
      throw new SessionError(
        "WORKBENCH_NOT_ALLOWED",
        `Workbench "${workbench}" is not granted. Allowed: [${workbenches.join(", ")}]`,
        403,
      );
    }

    // ── Step 3: Resolve tenant ─────────────────────────────────────────────────
    const tenantRow = await db
      .selectFrom("master.tenant")
      .select(["id", "status"])
      .where("realm_key", "=", realmKey)
      .where("code", "=", tenant)
      .executeTakeFirst();

    if (!tenantRow) {
      throw new SessionError("TENANT_NOT_FOUND", `Tenant "${tenant}" not found`, 404);
    }
    if (tenantRow.status !== "active") {
      throw new SessionError("TENANT_INACTIVE", `Tenant "${tenant}" is inactive`, 403);
    }
    const tenantId: string = tenantRow.id;

    // ── Step 4: Resolve entity (company_code + legal_entity) ──────────────────
    const entityRow = await db
      .selectFrom("master.company_code as cc")
      .innerJoin("master.legal_entity as le", "le.id", "cc.legal_entity_id")
      .select(["cc.name as cc_name", "le.country_code"])
      .where("cc.tenant_id", "=", tenantId)
      .where("cc.code", "=", entity.toUpperCase())
      .where("cc.status", "=", "active")
      .executeTakeFirst();

    if (!entityRow) {
      throw new SessionError(
        "ENTITY_NOT_FOUND",
        `Company code "${entity}" not found or inactive in tenant "${tenant}"`,
        404,
      );
    }

    // ── Step 5: Resolve principal via auth binding (with JIT fallback) ───────
    let bindingRow = await db
      .selectFrom("master.principal_auth_binding as pab")
      .innerJoin("master.principal as p", (join) =>
        join.onRef("p.id", "=", "pab.principal_id").on("p.tenant_id", "=", tenantId),
      )
      .select(["pab.principal_id", "p.is_active", "p.is_locked"])
      .where("pab.subject_id", "=", sub)
      .where("pab.provider_code", "=", "keycloak")
      .where("pab.tenant_id", "=", tenantId)
      .executeTakeFirst();

    if (!bindingRow) {
      // ── JIT provisioning — first-time login for this user in this tenant ──
      // Attempt to create principal + profile + auth binding from the JWT claims
      // forwarded by the BFF. If successful, re-query the binding so the rest
      // of the resolution path proceeds identically to a pre-seeded user.
      if (username && name) {
        try {
          const jit = await jitProvisionPrincipal(db, {
            sub,
            username,
            display_name: name,
            email,
            tenant_id: tenantId,
          });

          if (jit) {
            // Re-query with the JOIN so is_active / is_locked come from the principal row.
            bindingRow = await db
              .selectFrom("master.principal_auth_binding as pab")
              .innerJoin("master.principal as p", (join) =>
                join.onRef("p.id", "=", "pab.principal_id").on("p.tenant_id", "=", tenantId),
              )
              .select(["pab.principal_id", "p.is_active", "p.is_locked"])
              .where("pab.subject_id", "=", sub)
              .where("pab.provider_code", "=", "keycloak")
              .where("pab.tenant_id", "=", tenantId)
              .executeTakeFirst();
          }
        } catch (jitErr) {
          // JIT failure must not mask the real error — fall through to NOT_FOUND.
          console.error(
            `[session] JIT provision failed for sub="${sub}" tenant="${tenant}":`,
            jitErr instanceof Error ? jitErr.message : String(jitErr),
          );
        }
      }

      // Still not found after JIT attempt → hard failure.
      if (!bindingRow) {
        throw new SessionError(
          "PRINCIPAL_NOT_FOUND",
          `No principal binding for sub "${sub}" in tenant "${tenant}"`,
          404,
        );
      }
    }

    if (!bindingRow.is_active || bindingRow.is_locked) {
      throw new SessionError("PRINCIPAL_DISABLED", "Principal is inactive or locked", 403);
    }
    const principalId: string = bindingRow.principal_id;

    // ── Step 6: Resolve persona ────────────────────────────────────────────────
    const personaRow = await db
      .selectFrom("master.principal_persona as pp")
      .innerJoin("shared.persona as ps", "ps.id", "pp.persona_id")
      .select(["ps.id as persona_id", "ps.code as persona_code"])
      .where("pp.tenant_id", "=", tenantId)
      .where("pp.principal_id", "=", principalId)
      .executeTakeFirst();

    const personaCode: string = personaRow?.persona_code ?? "default";
    const personaId: string = personaRow?.persona_id ?? "00000000-0000-0000-0000-000000000000";

    // ── Step 7: Permissions — all known permissions as boolean map ─────────────
    // Fetch every active permission; mark those granted to this persona as true.
    const allPermRows = await db
      .selectFrom("shared.permission as p")
      .leftJoin("shared.persona_permission as pp", (join) =>
        join.onRef("pp.permission_id", "=", "p.id").on("pp.persona_id", "=", personaId),
      )
      .select(["p.code", "pp.is_granted"])
      .where("p.status", "=", "active")
      .orderBy("p.code")
      .execute();

    const permissions: Record<string, boolean> = {};
    for (const row of allPermRows) {
      permissions[row.code] = row.is_granted === true;
    }

    // ── Step 8: Active modules for tenant ─────────────────────────────────────
    const moduleRows = await db
      .selectFrom("master.tenant_module_subscription as tms")
      .innerJoin("shared.module as m", "m.id", "tms.module_id")
      .select(["m.code", "m.name"])
      .where("tms.tenant_id", "=", tenantId)
      .where("tms.status", "=", "active")
      .execute();

    const modules: SessionModule[] = moduleRows.map(
      (r: { code: string; name: string }) => ({
        code: r.code,
        name: r.name,
        level: "user" as const, // shared.module has no level column; default "user"
      }),
    );

    // ── Step 9: Scope from group_role ──────────────────────────────────────────
    // scope='all' → principal covers the entire tenant (no company_code filter)
    // other scopes → collect the specific company_codes from group_role bindings
    const groupRoleRows = await db
      .selectFrom("master.group_member as gm")
      .innerJoin("master.group_role as gr", (join) =>
        join
          .onRef("gr.group_id", "=", "gm.group_id")
          .onRef("gr.tenant_id", "=", "gm.tenant_id")
          .on("gr.is_active", "=", true),
      )
      .leftJoin("master.company_code as cc", "cc.id", "gr.company_code_id")
      .select(["gr.scope", "cc.code as cc_code"])
      .where("gm.principal_id", "=", principalId)
      .where("gm.tenant_id", "=", tenantId)
      .execute();

    const hasAllScope = groupRoleRows.some((r: { scope: string }) => r.scope === "all");
    const scope: SessionScope = {
      all: hasAllScope,
      company_codes: hasAllScope
        ? []
        : [
            ...new Set(
              groupRoleRows
                .filter((r: { cc_code: string | null }) => r.cc_code != null)
                .map((r: { cc_code: string }) => r.cc_code),
            ),
          ],
    };

    // ── Step 10: Delegations available ────────────────────────────────────────
    // Fetch all non-revoked, non-expired grants where current user is the delegate.
    // Includes scope_type/scope_ref for display and activation validation.
    const delegRows = await db
      .selectFrom("master.delegation_grant as dg")
      .innerJoin("master.principal as dp", (join) =>
        join.onRef("dp.id", "=", "dg.delegator_id").on("dp.tenant_id", "=", tenantId),
      )
      .leftJoin("master.principal_persona as dppp", (join) =>
        join
          .onRef("dppp.principal_id", "=", "dg.delegator_id")
          .on("dppp.tenant_id", "=", tenantId),
      )
      .leftJoin("shared.persona as dps", "dps.id", "dppp.persona_id")
      .select([
        "dg.id as delegation_id",
        "dp.name as delegator_name",
        "dps.code as delegator_persona",
        "dg.permissions",
        "dg.expires_at",
        "dg.scope_type",
        "dg.scope_ref",
      ])
      .where("dg.delegate_id", "=", principalId)
      .where("dg.tenant_id", "=", tenantId)
      .where("dg.is_revoked", "=", false)
      .where("dg.expires_at", ">", sql`now()`)
      .execute();

    const delegations_available: DelegationAvailable[] = delegRows.map(
      (r: {
        delegation_id: string;
        delegator_name: string;
        delegator_persona: string | null;
        permissions: string[] | unknown;
        expires_at: Date | string;
        scope_type: string;
        scope_ref: string | null;
      }) => ({
        delegation_id: r.delegation_id,
        delegator_name: r.delegator_name,
        delegator_persona: r.delegator_persona ?? "default",
        permissions: Array.isArray(r.permissions) ? r.permissions : [],
        expires_at:
          r.expires_at instanceof Date ? r.expires_at.toISOString() : String(r.expires_at),
        scope_type: r.scope_type,
        scope_ref: r.scope_ref,
      }),
    );

    // ── Step 11: Activate delegation (if requested) ───────────────────────────
    // If the caller passes ?delegation={uuid}, find it in delegations_available,
    // validate scope compatibility with the current entity, merge its permissions
    // (union — delegation only adds, never removes), and populate active_delegation.
    let active_delegation: import("./session.types.js").ActiveDelegation | undefined;

    if (delegationId) {
      const target = delegations_available.find(
        (d) => d.delegation_id === delegationId,
      );

      if (!target) {
        throw new SessionError(
          "DELEGATION_NOT_FOUND",
          `Delegation "${delegationId}" not found, is revoked, or has expired`,
          404,
        );
      }

      // Scope enforcement: company_code scope must match the requested entity.
      // Other scope types (module, task, entity, workflow) are permitted without
      // further restriction at the session level — callers enforce fine-grained scope.
      if (
        target.scope_type === "company_code" &&
        target.scope_ref !== null &&
        target.scope_ref !== entity
      ) {
        throw new SessionError(
          "DELEGATION_SCOPE_MISMATCH",
          `Delegation is scoped to entity "${target.scope_ref}", ` +
            `but the current entity is "${entity}"`,
          403,
        );
      }

      // Merge: union of own permissions + delegated permissions.
      // Existing `true` values are never downgraded.
      for (const permCode of target.permissions) {
        permissions[permCode] = true;
      }

      // Build active_delegation — merged_permissions is the full granted set after merge.
      active_delegation = {
        delegation_id: target.delegation_id,
        delegator_name: target.delegator_name,
        merged_permissions: Object.keys(permissions).filter((k) => permissions[k] === true),
      };
    }

    // ── Step 12: Build and cache ──────────────────────────────────────────────
    const response: SessionResponse = {
      persona: personaCode,
      workbench: workbench as "user" | "partner" | "admin",
      entity: {
        code: entity,
        name: entityRow.cc_name,
        country: entityRow.country_code,
      },
      modules,
      platform: [], // First-pass: platform workspace codes not yet implemented
      permissions,
      scope,
      delegations_available,
      active_delegation,
    };

    await cache.set(key, JSON.stringify(response), "EX", SESSION_CACHE_TTL_SEC);
    metrics?.write(tenant);

    // P2: Track this key in the per-principal set so the outbox worker can use
    // SMEMBERS instead of SCAN for bulk invalidation. The set TTL is refreshed
    // on every write so it stays alive as long as any session for this sub is active.
    if (typeof cache.sadd === "function" && typeof cache.expire === "function") {
      await cache.sadd(`principal_sessions:${sub}`, key);
      await cache.expire(`principal_sessions:${sub}`, SESSION_CACHE_TTL_SEC);
    }

    return response;
  }

  async function invalidate(
    sub: string,
    tenant: string,
    entity: string,
    workbench: string,
  ): Promise<void> {
    const key = cacheKey(sub, tenant, entity, workbench);
    await cache.del(key);
    if (typeof cache.srem === "function") {
      await cache.srem(`principal_sessions:${sub}`, key);
    }
    metrics?.invalidated(tenant, 1);
  }

  async function invalidateAll(sub: string): Promise<void> {
    const setKey = `principal_sessions:${sub}`;

    // P2 path: use per-principal set (avoids O(N) keyspace SCAN)
    if (typeof cache.smembers === "function") {
      const keys = await cache.smembers(setKey);
      if (keys.length > 0) {
        await cache.del([...keys, setKey]);
        metrics?.invalidated("*", keys.length);
        return;
      }
      // Fall through to SCAN if the set is empty (pre-migration sessions)
    }

    // Fallback: SCAN for sessions written before the P2 per-principal set was introduced
    if (typeof cache.scan !== "function") {
      console.warn(`[session] invalidateAll: neither smembers nor scan available for sub="${sub}"`);
      return;
    }
    const pattern = `session:${sub}:*`;
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [nextCursor, found] = await cache.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      keys.push(...found);
    } while (cursor !== "0");
    if (keys.length > 0) {
      await cache.del(keys);
      metrics?.invalidated("*", keys.length);
    }
  }

  return { resolve, invalidate, invalidateAll };
}
