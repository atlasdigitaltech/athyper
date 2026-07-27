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
import { resolveParameterSnapshot } from "../parameters/parameter-resolver.service.js";
import { getEffectiveModuleAccess } from "../permission/module-access.service.js";
import { addTrackedKey } from "@athyper/svc-shared";
import type {
  SessionQuery,
  SessionResponse,
  SessionModule,
  SessionScope,
  DelegationAvailable,
  CachedSession,
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
  eval?(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
  incr?(key: string): Promise<number>;
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

const AUTH_EPOCH_CACHE_TTL_SEC = 15;

function authEpochKey(principalId: string): string {
  return `session:auth_epoch:${principalId}`;
}

async function resolveCurrentAuthEpoch(
  db: Kysely<AnyDb>,
  cache: CacheClient,
  principalId: string,
): Promise<number> {
  const epochCacheKey = authEpochKey(principalId);
  const cachedEpoch = await cache.get(epochCacheKey).catch(() => null);
  if (cachedEpoch !== null) {
    const parsed = Number(cachedEpoch);
    if (Number.isFinite(parsed)) return parsed;
    await cache.del(epochCacheKey).catch(() => undefined);
  }

  const epochRow = await db
    .selectFrom("master.principal as p")
    .select("p.auth_epoch")
    .where("p.id", "=", principalId)
    .executeTakeFirst();

  const dbEpoch = (epochRow?.auth_epoch as number | undefined) ?? 0;
  await cache.set(epochCacheKey, String(dbEpoch), "EX", AUTH_EPOCH_CACHE_TTL_SEC).catch(() => undefined);
  return dbEpoch;
}

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

  async function resolveMesh(query: SessionQuery): Promise<SessionResponse> {
    const { sub, realmKey, tenant, entity, workbench, username, name } = query;

    const key = cacheKey(sub, tenant, entity, workbench);
    const cached = await cache.get(key);
    if (cached) {
      metrics?.hit(tenant);
      return (JSON.parse(cached) as { response: SessionResponse }).response;
    }
    metrics?.miss(tenant);

    // ── Step 1: Resolve mesh principal via identity binding ───────────────────
    let meshPrincipalRow = await db
      .selectFrom("mesh.principal_identity_binding as pib")
      .innerJoin("mesh.principal as p", (join) =>
        join.onRef("p.id", "=", "pib.principal_id").on("p.status", "!=", "retired"),
      )
      .select(["pib.principal_id", "p.status as principal_status"])
      .where("pib.subject_id", "=", sub)
      .where("pib.realm_key", "=", realmKey)
      .where("pib.provider_code", "=", "keycloak")
      .executeTakeFirst();

    if (!meshPrincipalRow && username && name) {
      try {
        const principalCode = `mesh:${sub.slice(0, 24)}`;
        const principalId = await db.transaction().execute(async (trx) => {
          const inserted = await trx
            .insertInto("mesh.principal")
            .values({
              principal_code: principalCode,
              display_name: name,
              principal_type: "participant_user",
              created_by: "jit",
            })
            .returning("id")
            .executeTakeFirstOrThrow();

          await trx
            .insertInto("mesh.principal_identity_binding")
            .values({
              principal_id: inserted.id,
              realm_key: realmKey,
              provider_code: "keycloak",
              subject_id: sub,
              username: username ?? null,
              created_by: "jit",
            })
            .execute();

          return inserted.id as string;
        });

        meshPrincipalRow = { principal_id: principalId, principal_status: "active" };
      } catch (jitErr) {
        console.error(
          `[session] Mesh JIT provision failed for sub="${sub}":`,
          jitErr instanceof Error ? jitErr.message : String(jitErr),
        );
      }
    }

    if (!meshPrincipalRow) {
      throw new SessionError(
        "PRINCIPAL_NOT_FOUND",
        `No mesh principal binding for sub "${sub}"`,
        404,
      );
    }
    if (
      meshPrincipalRow.principal_status === "locked" ||
      meshPrincipalRow.principal_status === "inactive"
    ) {
      throw new SessionError("PRINCIPAL_DISABLED", "Mesh principal is disabled or locked", 403);
    }
    const principalId: string = meshPrincipalRow.principal_id;

    // ── Step 2: Resolve network account + grant ───────────────────────────────
    const grantRow = await db
      .selectFrom("mesh.network_account as na")
      .innerJoin("mesh.account_grant as ag", (join) =>
        join
          .onRef("ag.account_id", "=", "na.id")
          .on("ag.principal_id", "=", principalId)
          .on("ag.status", "=", "active"),
      )
      .select([
        "na.account_code",
        "na.display_name",
        "na.participant_type",
        "na.verification_status",
        "na.status as account_status",
        "na.tax_country",
        "ag.role_code",
      ])
      .where("na.account_code", "=", entity)
      .executeTakeFirst();

    if (!grantRow) {
      throw new SessionError(
        "ACCOUNT_NOT_FOUND",
        `No active account grant for account "${entity}" and current principal`,
        403,
      );
    }
    if (grantRow.account_status !== "active") {
      throw new SessionError(
        "ACCOUNT_INACTIVE",
        `Mesh account "${entity}" is not active`,
        403,
      );
    }

    // ── Step 3: Build permissions from role_code ──────────────────────────────
    const roleCode: string = grantRow.role_code;
    const isOwner = roleCode === "account_owner";
    const isAdmin = isOwner || roleCode === "account_admin";

    const permissions: Record<string, boolean> = {
      "MESH.ACCOUNT.VIEW":        true,
      "MESH.ACCOUNT.EDIT":        isAdmin,
      "MESH.ACCOUNT.MANAGE":      isOwner,
      "MESH.MEMBER.VIEW":         true,
      "MESH.MEMBER.INVITE":       isAdmin,
      "MESH.MEMBER.MANAGE":       isOwner,
      "MESH.CONNECTION.VIEW":     true,
      "MESH.CONNECTION.REQUEST":  isAdmin,
      "MESH.CONNECTION.MANAGE":   isOwner,
      "MESH.DOCUMENT.VIEW":       true,
      "MESH.DOCUMENT.SEND":       true,
      "MESH.DOCUMENT.RECEIVE":    true,
      "MESH.CATALOG.VIEW":        true,
      "MESH.CATALOG.MANAGE":      isAdmin,
      "MESH.BANK.VIEW":           isAdmin,
      "MESH.BANK.MANAGE":         isOwner,
      "MESH.CERT.VIEW":           true,
      "MESH.CERT.MANAGE":         isAdmin,
      "MESH.ANALYTICS.VIEW":      isAdmin,
    };

    // ── Step 4: Build and cache response ──────────────────────────────────────
    const response: SessionResponse = {
      persona: roleCode,
      workbench: "partner",
      entity: {
        code: grantRow.account_code as string,
        name: (grantRow.display_name as string) ?? grantRow.account_code,
        country: (grantRow.tax_country as string | null) ?? "",
      },
      modules: [],
      platform: [],
      permissions,
      scope: { all: true, company_codes: [], visibility: "all" },
      delegations_available: [],
    };

    const envelope = { response, principal_id: principalId };
    await cache.set(key, JSON.stringify(envelope), "EX", SESSION_CACHE_TTL_SEC);
    await addTrackedKey(cache, `principal_sessions:${sub}`, key, SESSION_CACHE_TTL_SEC);
    metrics?.write(tenant);

    return response;
  }

  async function resolve(query: SessionQuery): Promise<SessionResponse> {
    if (query.planeKey === "mesh") return resolveMesh(query);

    const {
      sub, realmKey, tenant, entity, workbench, orgAliases, workbenches, delegationId,
      username, name, email,
    } = query;

    // ── Cache hit ──────────────────────────────────────────────────────────────
    const key = cacheKey(sub, tenant, entity, workbench, delegationId);
    const cached = await cache.get(key);
    if (cached) {
      const envelope = JSON.parse(cached) as CachedSession;

      // auth_epoch guard: compare cached epoch with a short-lived Redis mirror.
      // A mismatch means a security-critical mutation occurred (principal locked,
      // deny grant created/revoked, delegation revoked) since this session was
      // cached. Force immediate re-resolution regardless of remaining TTL.
      const currentEpoch = await resolveCurrentAuthEpoch(db, cache, envelope.principal_id);
      if (currentEpoch !== envelope.auth_epoch) {
        // Stale cache — invalidate this key and fall through to full resolution.
        await cache.del(key);
        if (typeof cache.srem === "function") {
          await cache.srem(`principal_sessions:${sub}`, key);
        }
        metrics?.invalidated(tenant, 1);
        // Fall through to DB resolution below
      } else {
        metrics?.hit(tenant);
        return envelope.response;
      }
    }
    metrics?.miss(tenant);

    // ── Step 1: Validate org membership ────────────────────────────────────────
    const requiredAlias = `${tenant.toLowerCase()}--${entity.toLowerCase()}`;
    const normalizedAliases = orgAliases.map((alias) => alias.toLowerCase());
    if (!normalizedAliases.includes(requiredAlias)) {
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
      .selectFrom("master.tenant as t")
      .select(["t.id", "t.status"])
      .where("t.code", "=", tenant)
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
      .selectFrom("master.legal_entity as le")
      .innerJoin("master.company_code as cc", (join) =>
        join
          .onRef("cc.legal_entity_id", "=", "le.id")
          .onRef("cc.tenant_id", "=", "le.tenant_id")
          .on("cc.status", "=", "active"),
      )
      .select([
        "le.code as legal_entity_code",
        "le.name as legal_entity_name",
        "le.display_name as legal_entity_display_name",
        "le.country_code",
        "cc.code as company_code",
      ])
      .where("le.tenant_id", "=", tenantId)
      .where("le.code", "=", entity.toUpperCase())
      .where("le.status", "=", "active")
      .orderBy("cc.code")
      .executeTakeFirst();

    if (!entityRow) {
      throw new SessionError(
        "ENTITY_NOT_FOUND",
        `Legal entity "${entity}" not found or inactive in tenant "${tenant}"`,
        404,
      );
    }
    const entityCompanyCode = entityRow.company_code as string;

    // ── Step 5: Resolve principal via auth binding (with JIT fallback) ───────
    let bindingRow = await db
      .selectFrom("master.principal_identity_binding as pab")
      .innerJoin("master.principal as p", (join) =>
        join.onRef("p.id", "=", "pab.principal_id").on("p.tenant_id", "=", tenantId),
      )
      .select(["pab.principal_id", "p.is_active", "p.is_locked"])
      .where("pab.subject_id", "=", sub)
      .where("pab.realm_key", "=", realmKey)
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
            realm_key: realmKey,
          });

          if (jit) {
            // Re-query with the JOIN so is_active / is_locked come from the principal row.
            bindingRow = await db
              .selectFrom("master.principal_identity_binding as pab")
              .innerJoin("master.principal as p", (join) =>
                join.onRef("p.id", "=", "pab.principal_id").on("p.tenant_id", "=", tenantId),
              )
              .select(["pab.principal_id", "p.is_active", "p.is_locked"])
              .where("pab.subject_id", "=", sub)
              .where("pab.realm_key", "=", realmKey)
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

    // ── Fetch auth_epoch for cache envelope ───────────────────────────────────
    // Stored alongside the session response so every subsequent cache hit can
    // compare it against the DB value to detect security-critical mutations.
    const epochRow = await db
      .selectFrom("master.principal as p")
      .select("p.auth_epoch")
      .where("p.id", "=", principalId)
      .where("p.tenant_id", "=", tenantId)
      .executeTakeFirst();
    const currentAuthEpoch: number = (epochRow?.auth_epoch as number | undefined) ?? 0;

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

    // ── Step 8: Active modules for principal (role + plan intersect) ──────────
    const effectiveModules = await getEffectiveModuleAccess(
      db,
      tenantId,
      principalId,
      {
        cache,
        authEpoch: currentAuthEpoch,
      },
    );
    const modules: SessionModule[] = effectiveModules.moduleCodes.map((code) => ({
      code,
      name: code,
      level: "user" as const,
    }));

    // ── Step 9: Scope from auth_group_role (two-dimension model) ──────────────
    // assignment_scope_type: 'tenant' (all CCs) | 'company_code' | 'legal_entity'
    // visibility_scope:      'all' | 'team' | 'own'  — widest row-level filter
    //
    // A single raw-SQL CTE resolves all three assignment scope types in one
    // round-trip, expanding legal_entity scopes via fn_resolve_le_subtree_companies.
    const scopeResult = await sql<{
      has_tenant_scope: boolean;
      widest_visibility: string;
      cc_codes: string[] | null;
    }>`
      WITH effective_roles AS (
        SELECT
          gr.visibility_scope,
          gr.assignment_scope_type,
          gr.assignment_scope_ref_id,
          gr.include_descendants
        FROM master.auth_group_member gm
        JOIN master.auth_group_role gr
          ON  gr.group_id  = gm.group_id
          AND gr.tenant_id = gm.tenant_id
          AND gr.is_active = true
        WHERE gm.principal_id = ${principalId}
          AND gm.tenant_id    = ${tenantId}
      ),
      cc_scope AS (
        -- Direct company_code scope
        SELECT cc.code AS cc_code
        FROM effective_roles er
        JOIN master.company_code cc
          ON  cc.id        = er.assignment_scope_ref_id
          AND cc.is_active = true
        WHERE er.assignment_scope_type = 'company_code'

        UNION

        -- Legal entity — full descendant subtree
        SELECT cc.code AS cc_code
        FROM effective_roles er
        CROSS JOIN LATERAL master.fn_resolve_le_subtree_companies(${tenantId}, er.assignment_scope_ref_id) sub
        JOIN master.company_code cc
          ON  cc.id        = sub.company_code_id
          AND cc.is_active = true
        WHERE er.assignment_scope_type = 'legal_entity'
          AND er.include_descendants   = true

        UNION

        -- Legal entity — direct CCs only (no subtree)
        SELECT cc.code AS cc_code
        FROM effective_roles er
        JOIN master.company_code cc
          ON  cc.legal_entity_id = er.assignment_scope_ref_id
          AND cc.tenant_id       = ${tenantId}
          AND cc.is_active       = true
        WHERE er.assignment_scope_type = 'legal_entity'
          AND er.include_descendants   = false
      )
      SELECT
        coalesce(
          (SELECT bool_or(assignment_scope_type = 'tenant') FROM effective_roles),
          false
        ) AS has_tenant_scope,
        coalesce(
          (SELECT
            CASE
              WHEN bool_or(visibility_scope = 'all')  THEN 'all'
              WHEN bool_or(visibility_scope = 'team') THEN 'team'
              ELSE 'own'
            END
           FROM effective_roles),
          'own'
        ) AS widest_visibility,
        (SELECT array_agg(DISTINCT cc_code) FROM cc_scope) AS cc_codes
    `.execute(db);

    const scopeRow = scopeResult.rows[0];
    const hasTenantScope = scopeRow?.has_tenant_scope ?? false;
    const scope: SessionScope = {
      all: hasTenantScope,
      company_codes: hasTenantScope ? [] : (scopeRow?.cc_codes ?? []),
      visibility: ((scopeRow?.widest_visibility ?? "own") as "all" | "own" | "team"),
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
        target.scope_ref !== entityCompanyCode
      ) {
        throw new SessionError(
          "DELEGATION_SCOPE_MISMATCH",
          `Delegation is scoped to company code "${target.scope_ref}", ` +
            `but the current entity resolves to "${entityCompanyCode}"`,
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
        code: entityRow.legal_entity_code,
        name: entityRow.legal_entity_display_name ?? entityRow.legal_entity_name,
        country: entityRow.country_code,
      },
      modules,
      platform: [], // First-pass: platform workspace codes not yet implemented
      permissions,
      scope,
      delegations_available,
      active_delegation,
    };

    // Store the CachedSession envelope — auth_epoch enables stale-detection on
    // every subsequent cache hit without requiring a full DB re-resolution.
    const envelope: CachedSession = {
      auth_epoch: currentAuthEpoch,
      principal_id: principalId,
      response,
    };
    const sessionCacheTtlSec = await resolveNumericParameter(
      tenantId,
      "runtime.session.cache_ttl_seconds",
      SESSION_CACHE_TTL_SEC,
    );
    await cache.set(key, JSON.stringify(envelope), "EX", sessionCacheTtlSec);
    await cache.set(authEpochKey(principalId), String(currentAuthEpoch), "EX", AUTH_EPOCH_CACHE_TTL_SEC).catch(() => undefined);
    metrics?.write(tenant);

    // P2: Track this key in the per-principal set so the outbox worker can use
    // SMEMBERS instead of SCAN for bulk invalidation. The set TTL is refreshed
    // on every write so it stays alive as long as any session for this sub is active.
    await addTrackedKey(cache, `principal_sessions:${sub}`, key, sessionCacheTtlSec);

    return response;
  }

  async function resolveNumericParameter(tenantId: string, code: string, fallback: number): Promise<number> {
    try {
      const namespace = code.split(".").slice(0, 2).join(".");
      const snapshot = await resolveParameterSnapshot(db, cache, tenantId, namespace);
      const raw = snapshot.values[code];
      const value = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(value) && value > 0 ? value : fallback;
    } catch {
      return fallback;
    }
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
