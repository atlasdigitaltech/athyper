import { sql, type Kysely } from "kysely";

import {
  createMeshAuthorizationRuntime,
  createNeonAuthorizationRuntime,
  type AuthorizationSessionV2,
  type CanonicalAuthorizationRuntime,
} from "../authorization-runtime/index.js";
import type { SessionQuery } from "./session.types.js";
import { createIdentityAdmissionCutoverRepository } from "../identity/identity-admission-cutover.js";
import { SqlIdentityShadowSink } from "../identity/sql-identity-shadow-sink.js";
import type { PlaneDatabaseRegistry } from "../runtime/plane-database-registry.js";
import {
  SessionCutoverResolver,
  sessionCutoverMode,
  type CanonicalSessionResolver,
} from "./session-cutover.js";
import { SqlSessionShadowSink } from "./sql-session-shadow-sink.js";
import {
  projectionAllowsExactScope,
  SqlOrganizationProjectionRepository,
  type OrganizationProjectionRepository,
} from "../organization-projection/organization-projection.repository.js";

export interface CacheMetrics {
  hit(tenant: string): void;
  miss(tenant: string): void;
  write(tenant: string): void;
  invalidated(tenant: string, count: number): void;
}

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
  sadd?(key: string, member: string): Promise<unknown>;
  srem?(key: string, member: string): Promise<unknown>;
  smembers?(key: string): Promise<string[]>;
  expire?(key: string, ttlSeconds: number): Promise<unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

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

export interface SessionServiceDeps {
  readonly planeDatabases: PlaneDatabaseRegistry;
  readonly cache: CacheClient;
  readonly metrics?: CacheMetrics;
  readonly projections?: OrganizationProjectionRepository;
  readonly legacySessions?: Partial<Record<SessionQuery["planeKey"], CanonicalSessionResolver<any>>>;
}

export interface SessionService {
  resolve(query: SessionQuery): Promise<AuthorizationSessionV2>;
  invalidate(
    sub: string,
    tenant: string,
    entity: string,
    workbench: string,
  ): Promise<void>;
  invalidateAll(sub: string): Promise<void>;
}

export function createSessionService(
  deps: SessionServiceDeps,
): SessionService {
  const adminDb = deps.planeDatabases.forPlane("admin").db;
  const neonDb = deps.planeDatabases.forPlane("neon").db;
  const meshDb = deps.planeDatabases.forPlane("mesh").db;
  const identities = createIdentityAdmissionCutoverRepository(deps.planeDatabases, {
    workflow: "session",
    sink: new SqlIdentityShadowSink(deps.planeDatabases),
  });
  const projections = deps.projections ?? new SqlOrganizationProjectionRepository(deps.planeDatabases);
  const evaluatorRevision =
    process.env["AUTHORIZATION_EVALUATOR_REVISION"] ?? "unpublished";
  const runtimes: Record<SessionQuery["planeKey"], CanonicalAuthorizationRuntime> = {
    neon: createNeonAuthorizationRuntime({
      db: neonDb as never,
      plane: "neon",
      expectedDatabaseName: "athyper_neon",
      evaluatorRevision,
    }),
    admin: createNeonAuthorizationRuntime({
      db: adminDb as never,
      plane: "admin",
      expectedDatabaseName: "athyper_platform",
      evaluatorRevision,
    }),
    mesh: createMeshAuthorizationRuntime({
      meshDb: meshDb as never,
      expectedDatabaseName: "athyper_mesh",
      evaluatorRevision,
    }),
  };
  const sessionMode = sessionCutoverMode();
  const sessionSink = new SqlSessionShadowSink(deps.planeDatabases);
  const sessions = Object.fromEntries(
    (["admin", "neon", "mesh"] as const).map((plane) => [
      plane,
      new SessionCutoverResolver(
        deps.legacySessions?.[plane],
        runtimes[plane].sessions,
        sessionMode,
        sessionSink,
      ),
    ]),
  ) as unknown as Record<SessionQuery["planeKey"], CanonicalSessionResolver<any>>;

  return {
    async resolve(query): Promise<AuthorizationSessionV2> {
      if (!query.workbenches.includes(query.workbench)) {
        throw new SessionError(
          "WORKBENCH_DENIED",
          "The selected workbench is not present in the verified identity.",
          403,
        );
      }
      const activeProjections = await projections.resolveActive({
        planeKey: query.planeKey,
        realmKey: query.realmKey,
        externalOrganizationIds: query.externalOrganizationIds,
      });
      if (activeProjections.length === 0) {
        throw new SessionError(
          "IAM_PROJECTION_MISSING",
          "No active organization projection exists for this plane and realm.",
          403,
        );
      }
      const admissions = await identities.resolveCandidates({
        planeKey: query.planeKey,
        tenantIds: activeProjections.map((projection) => projection.tenantId),
        providerCode: "keycloak",
        realmKey: query.realmKey,
        subjectId: query.sub,
      });
      const admission = admissions.find((candidate) =>
        candidate.tenantId.toLowerCase() === query.tenant.toLowerCase()
        || candidate.tenantCode.toLowerCase() === query.tenant.toLowerCase()
      );
      if (!admission) {
        throw new SessionError(
          "ORGANIZATION_DENIED",
          "The selected tenant is not an active plane membership for this identity.",
          403,
        );
      }
      const selectedScope = query.planeKey === "mesh"
        ? await resolveMeshAccount(meshDb, admission.tenantId, admission.principalId, query.entity)
        : await resolveGrantedScope(
            deps.planeDatabases.forPlane(query.planeKey).db,
            admission.tenantId,
            admission.principalId,
            query.entity,
          );
      if (!selectedScope) {
        throw new SessionError(
          "ACCOUNT_DENIED",
          "The selected application scope is not an active grant for this identity.",
          403,
        );
      }
      const matchingProjections = activeProjections.filter((projection) =>
        projection.tenantId === admission.tenantId
        && projectionAllowsExactScope(
          projection,
          selectedScope.scopeTargetId,
          selectedScope.networkRole,
        )
      );
      if (matchingProjections.length === 0) {
        throw new SessionError(
          "IAM_SCOPE_OUTSIDE_CEILING",
          "The selected application scope is outside the organization projection ceiling.",
          403,
        );
      }
      if (matchingProjections.length > 1) {
        throw new SessionError(
          "IAM_PROJECTION_AMBIGUOUS",
          "More than one organization projection can activate the selected scope.",
          403,
        );
      }
      const projection = matchingProjections[0]!;
      const tenantOrAccountId = selectedScope.tenantOrAccountId;
      return sessions[query.planeKey].resolve({
        externalSubjectId: query.sub,
        realmKey: query.realmKey,
        tenantId: admission.tenantId,
        tenantOrAccountId,
        plane: query.planeKey,
        organizationId: projection.externalOrganizationId,
        projectionId: projection.projectionId,
        projectionVersion: projection.sourceVersion,
        projectionHash: projection.sourceHash,
        mfaSatisfied: query.mfaSatisfied,
        sodSatisfied: query.sodSatisfied,
      });
    },

    async invalidate(sub, tenant, entity, workbench): Promise<void> {
      const key = `session:${sub}:${tenant}:${entity}:${workbench}`;
      await deps.cache.del(key);
      deps.metrics?.invalidated(tenant, 1);
    },

    async invalidateAll(sub): Promise<void> {
      if (!deps.cache.scan) return;
      let cursor = "0";
      let count = 0;
      do {
        const [next, keys] = await deps.cache.scan(
          cursor,
          "MATCH",
          `session:${sub}:*`,
          "COUNT",
          200,
        );
        cursor = next;
        if (keys.length > 0) {
          await deps.cache.del(keys);
          count += keys.length;
        }
      } while (cursor !== "0");
      deps.metrics?.invalidated("all", count);
    },
  };
}

interface SelectedApplicationScope {
  readonly tenantOrAccountId: string;
  readonly scopeTargetId: string;
  readonly networkRole?: string;
}

async function resolveMeshAccount(
  db: AnyDb,
  tenantId: string,
  principalId: string,
  accountCodeOrId: string,
): Promise<SelectedApplicationScope | null> {
  return db.transaction().execute(async (trx) => {
    await sql`
      SELECT
        set_config('app.current_tenant_id', ${tenantId}, true),
        set_config('app.current_principal_id', ${principalId}, true)
    `.execute(trx);
    const result = await sql<{ id: string; scope_target_id: string; network_role: string }>`
      SELECT account.id::text, scope.id::text AS scope_target_id, account.network_role::text
      FROM mesh.network_account AS account
      JOIN authz.scope_target AS scope
        ON scope.tenant_id = account.tenant_id
       AND scope.scope_kind = 'network_account'
       AND scope.target_id = account.id
       AND scope.status = 'active'
      JOIN authz.group_role AS group_role
        ON group_role.tenant_id = scope.tenant_id
       AND group_role.scope_target_id = scope.id
       AND group_role.status = 'active'
       AND group_role.effective_from <= statement_timestamp()
       AND (group_role.effective_until IS NULL OR group_role.effective_until > statement_timestamp())
      JOIN authz.group_member AS member
        ON member.tenant_id = group_role.tenant_id
       AND member.group_id = group_role.group_id
       AND member.principal_id = ${principalId}::uuid
       AND member.status = 'active'
       AND member.effective_from <= statement_timestamp()
       AND (member.effective_until IS NULL OR member.effective_until > statement_timestamp())
      WHERE account.tenant_id = ${tenantId}::uuid
        AND (account.id::text = ${accountCodeOrId} OR account.account_code = ${accountCodeOrId})
        AND account.status = 'active'
      LIMIT 1
    `.execute(trx);
    const row = result.rows[0];
    return row ? {
      tenantOrAccountId: row.id,
      scopeTargetId: row.scope_target_id,
      networkRole: row.network_role.toLowerCase(),
    } : null;
  });
}

async function resolveGrantedScope(
  db: AnyDb,
  tenantId: string,
  principalId: string,
  scopeKeyOrId: string,
): Promise<SelectedApplicationScope | null> {
  return db.transaction().execute(async (trx) => {
    await sql`
      SELECT
        set_config('app.current_tenant_id', ${tenantId}, true),
        set_config('app.current_principal_id', ${principalId}, true)
    `.execute(trx);
    const result = await sql<{ scope_target_id: string }>`
      SELECT DISTINCT scope.id::text AS scope_target_id
      FROM authz.scope_target AS scope
      JOIN authz.group_role AS group_role
        ON group_role.tenant_id = scope.tenant_id
       AND group_role.scope_target_id = scope.id
       AND group_role.status = 'active'
       AND group_role.effective_from <= statement_timestamp()
       AND (group_role.effective_until IS NULL OR group_role.effective_until > statement_timestamp())
      JOIN authz.group_member AS member
        ON member.tenant_id = group_role.tenant_id
       AND member.group_id = group_role.group_id
       AND member.principal_id = ${principalId}::uuid
       AND member.status = 'active'
       AND member.effective_from <= statement_timestamp()
       AND (member.effective_until IS NULL OR member.effective_until > statement_timestamp())
      WHERE scope.tenant_id = ${tenantId}::uuid
        AND (scope.id::text = ${scopeKeyOrId} OR scope.scope_key = ${scopeKeyOrId})
        AND scope.status = 'active'
      LIMIT 1
    `.execute(trx);
    const row = result.rows[0];
    return row ? {
      tenantOrAccountId: tenantId,
      scopeTargetId: row.scope_target_id,
    } : null;
  });
}
