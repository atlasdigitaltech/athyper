import { sql } from "kysely";

import type { AdmittedIdentity,IdentityAdmissionRepository } from "../identity/identity-admission.repository.js";
import { createIdentityAdmissionCutoverRepository } from "../identity/identity-admission-cutover.js";
import { SqlIdentityShadowSink } from "../identity/sql-identity-shadow-sink.js";
import type { PlaneDatabaseRegistry } from "../runtime/plane-database-registry.js";
import type {
  BootstrapQuery,
  BootstrapResponse,
  BootstrapTenant,
} from "../session/session.types.js";
import type { CacheClient, CacheMetrics } from "../session/session.service.js";

export interface BootstrapServiceDeps {
  readonly planeDatabases: PlaneDatabaseRegistry;
  readonly cache: CacheClient;
  readonly metrics?: CacheMetrics;
  readonly identities?: IdentityAdmissionRepository;
  readonly loadScopes?: (
    admission: AdmittedIdentity,
    planeKey: BootstrapQuery["planeKey"],
  ) => Promise<readonly BootstrapScopeRow[]>;
}

interface BootstrapScopeRow {
  readonly target_id: string;
  readonly scope_kind: string;
  readonly scope_key: string;
  readonly display_name: string;
}

export interface BootstrapService {
  resolve(query: BootstrapQuery): Promise<BootstrapResponse>;
  invalidate(sub: string): Promise<void>;
}

export function createBootstrapService(deps: BootstrapServiceDeps): BootstrapService {
  const identities = deps.identities ?? createIdentityAdmissionCutoverRepository(deps.planeDatabases, {
    workflow: "session",
    sink: new SqlIdentityShadowSink(deps.planeDatabases),
  });
  return {
    async resolve(query): Promise<BootstrapResponse> {
      const cacheKey = bootstrapCacheKey(query);
      const cached = await deps.cache.get(cacheKey);
      if (cached) {
        deps.metrics?.hit(query.planeKey);
        return JSON.parse(cached) as BootstrapResponse;
      }
      deps.metrics?.miss(query.planeKey);

      const admissions = await identities.resolveCandidates({
        planeKey: query.planeKey,
        tenantIds: query.orgAliases,
        providerCode: "keycloak",
        realmKey: query.realmKey,
        subjectId: query.sub,
      });
      const db = deps.planeDatabases.forPlane(query.planeKey).db;
      const tenants = await Promise.all(admissions.map(async (admission): Promise<BootstrapTenant> => {
        const scopeRows = deps.loadScopes
          ? await deps.loadScopes(admission, query.planeKey)
          : await db.transaction().execute(async (trx) => {
          await sql`
            SELECT
              set_config('app.current_tenant_id', ${admission.tenantId}, true),
              set_config('app.current_principal_id', ${admission.principalId}, true)
          `.execute(trx);
          const scopes = await sql<{
            target_id: string;
            scope_kind: string;
            scope_key: string;
            display_name: string;
          }>`
            SELECT DISTINCT
              scope.target_id::text,
              scope.scope_kind::text,
              scope.scope_key,
              scope.display_name
            FROM authz.group_member AS member
            JOIN authz.group_role AS group_role
              ON group_role.tenant_id = member.tenant_id
             AND group_role.group_id = member.group_id
             AND group_role.status = 'active'
             AND group_role.effective_from <= statement_timestamp()
             AND (group_role.effective_until IS NULL OR group_role.effective_until > statement_timestamp())
            JOIN authz.scope_target AS scope
              ON scope.tenant_id = group_role.tenant_id
             AND scope.id = group_role.scope_target_id
             AND scope.status = 'active'
            WHERE member.tenant_id = ${admission.tenantId}::uuid
              AND member.principal_id = ${admission.principalId}::uuid
              AND member.status = 'active'
              AND member.effective_from <= statement_timestamp()
              AND (member.effective_until IS NULL OR member.effective_until > statement_timestamp())
              AND scope.scope_kind = ANY(${query.planeKey === "mesh"
                ? sql`ARRAY['network_account']::authz.scope_kind_d[]`
                : sql`ARRAY['workspace','legal_entity','operating_organization','company_code']::authz.scope_kind_d[]`})
            ORDER BY scope.display_name, scope.scope_key
          `.execute(trx);
          return scopes.rows;
        });
        const entities = scopeRows.map((scope) => ({
            code: scope.scope_key,
            name: scope.display_name,
            type: scope.scope_kind,
            country: "",
            legal_entity: scope.scope_key,
            workbenches: normalizeWorkbenches(query.workbenches),
            module_count: 0,
          }));
        return {
          code: admission.tenantId,
          name: admission.tenantName,
          workbenches: normalizeWorkbenches(query.workbenches),
          entities,
        };
      }));
      const response: BootstrapResponse = {
        principal: { id: query.sub, name: query.name, email: query.email },
        tenants,
      };
      await deps.cache.set(cacheKey, JSON.stringify(response), "EX", 300);
      deps.metrics?.write(query.planeKey);
      return response;
    },

    async invalidate(sub): Promise<void> {
      if (!deps.cache.scan) return;
      let cursor = "0";
      do {
        const [next, keys] = await deps.cache.scan(cursor, "MATCH", `bootstrap:${sub}:*`, "COUNT", 200);
        cursor = next;
        if (keys.length > 0) await deps.cache.del(keys);
      } while (cursor !== "0");
    },
  };
}

function bootstrapCacheKey(query: BootstrapQuery): string {
  const aliases = [...new Set(query.orgAliases.map((value) => value.trim().toLowerCase()))].sort();
  return `bootstrap:${query.sub}:${query.planeKey}:${query.realmKey.toLowerCase()}:${Buffer.from(JSON.stringify(aliases)).toString("base64url") || "empty"}`;
}

function normalizeWorkbenches(values: readonly string[]): Array<"user" | "partner" | "admin"> {
  return values.filter((value): value is "user" | "partner" | "admin" =>
    value === "user" || value === "partner" || value === "admin",
  );
}
