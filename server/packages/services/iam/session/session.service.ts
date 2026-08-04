import { sql, type Kysely } from "kysely";

import {
  createMeshAuthorizationRuntime,
  createNeonAuthorizationRuntime,
  type AuthorizationSessionV2,
  type CanonicalAuthorizationRuntime,
} from "../authorization-runtime/index.js";
import type { SessionQuery } from "./session.types.js";
import { SqlIdentityAdmissionRepository } from "../identity/identity-admission.repository.js";
import type { PlaneDatabaseRegistry } from "../runtime/plane-database-registry.js";

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
  const identities = new SqlIdentityAdmissionRepository(deps.planeDatabases);
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

  return {
    async resolve(query): Promise<AuthorizationSessionV2> {
      if (!query.workbenches.includes(query.workbench)) {
        throw new SessionError(
          "WORKBENCH_DENIED",
          "The selected workbench is not present in the verified identity.",
          403,
        );
      }
      const admissions = await identities.resolveCandidates({
        planeKey: query.planeKey,
        tenantIds: query.orgAliases,
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
      const tenantOrAccountId = query.planeKey === "mesh"
        ? await resolveMeshAccountId(meshDb, admission.tenantId, admission.principalId, query.entity)
        : admission.tenantId;
      if (!tenantOrAccountId) {
        throw new SessionError(
          "ACCOUNT_DENIED",
          "The selected network account is not an authorized scope for this identity.",
          403,
        );
      }
      if (query.planeKey !== "mesh" && query.orgAliases.length > 0) {
        if (!query.orgAliases.some((alias) => alias.toLowerCase() === admission.tenantId.toLowerCase())) {
          throw new SessionError(
            "ORGANIZATION_DENIED",
            "The selected organization is not present in the verified identity.",
            403,
          );
        }
      }
      return runtimes[query.planeKey].sessions.resolve({
        externalSubjectId: query.sub,
        realmKey: query.realmKey,
        tenantId: admission.tenantId,
        tenantOrAccountId,
        plane: query.planeKey,
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

async function resolveMeshAccountId(
  db: AnyDb,
  tenantId: string,
  principalId: string,
  accountCodeOrId: string,
): Promise<string | null> {
  return db.transaction().execute(async (trx) => {
    await sql`
      SELECT
        set_config('app.current_tenant_id', ${tenantId}, true),
        set_config('app.current_principal_id', ${principalId}, true)
    `.execute(trx);
    const result = await sql<{ id: string }>`
      SELECT account.id::text
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
    return result.rows[0]?.id ?? null;
  });
}
