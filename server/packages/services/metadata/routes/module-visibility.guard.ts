import type { Kysely } from "kysely";
import { sql } from "kysely";

type AnyDb = Kysely<Record<string, any>>;

export interface EffectiveModuleAccess {
  moduleIds: string[];
  moduleCodes: string[];
  workspaceIds: string[];
  source: "role_binding" | "tenant_default";
}

/**
 * Distinguishes the request's intent against an entity's owning module:
 *   - "read_metadata": shape-only reads (compiled descriptor, runtime-options
 *     reference target probes, picker dictionaries). May bypass module access
 *     when the module's workspace is flagged as shared infrastructure.
 *   - "use" (default): records APIs, mutations, navigation, admin consoles.
 *     Always enforces normal module access; never bypassed.
 */
export type ModuleAccessMode = "read_metadata" | "use";

export interface ModuleAccessResolverOptions {
  planVersionId?: string;
  authEpoch?: number;
  cache?: unknown;
  mode?: ModuleAccessMode;
}

export type ModuleAccessResolver = (
  db: AnyDb,
  tenantId: string,
  principalId: string,
  options?: ModuleAccessResolverOptions,
) => Promise<EffectiveModuleAccess>;

interface Logger {
  warn(event: string, fields?: Record<string, unknown>): void;
}

export async function hasModuleAccess(
  db: AnyDb,
  tenantId: string | null,
  principalId: string | null,
  moduleId: string | null,
  resolver: ModuleAccessResolver | undefined,
  logger: Logger | undefined,
  options?: ModuleAccessResolverOptions,
): Promise<boolean> {
  if (!tenantId || !principalId || !moduleId || !resolver) return true;

  // Shared-infrastructure bypass — workspaces flagged with
  // `is_shared_infrastructure=true` (e.g. CORE), or individual modules whose
  // `config.is_shared_infrastructure=true` (e.g. PAY, which houses cross-module
  // lookup dictionaries like payment_term / payment_method / bank_party /
  // holiday_calendar), expose their descriptors universally so reference
  // targets resolve for every tenant principal without requiring an IAM grant
  // on that module. Only kicks in when the caller asks for a descriptor-class
  // read; "use" mode always enforces normal access.
  if (options?.mode === "read_metadata") {
    try {
      const row = await sql<{ is_shared_infrastructure: boolean }>`
        SELECT (
          w.is_shared_infrastructure
          OR coalesce((m.config->>'is_shared_infrastructure')::boolean, false)
        ) AS is_shared_infrastructure
        FROM shared.module m
        JOIN shared.workspace w ON w.id = m.workspace_id
        WHERE m.id = ${moduleId}::uuid
        LIMIT 1
      `.execute(db);
      if (row.rows[0]?.is_shared_infrastructure === true) return true;
    } catch (err) {
      logger?.warn("metadata_module_access_shared_infra_check_failed", {
        tenantId,
        principalId,
        moduleId,
        err: String(err),
      });
      // Fall through to the normal access check.
    }
  }

  try {
    const access = await resolver(db, tenantId, principalId, options);
    return access.moduleIds.includes(moduleId);
  } catch (err) {
    logger?.warn("metadata_module_access_check_failed", {
      tenantId,
      principalId,
      moduleId,
      err: String(err),
    });
    // Fail-open: preserve request availability if module checks are temporarily
    // degraded. Route-level 404 fallback stays reserved for hard negatives.
    return true;
  }
}

