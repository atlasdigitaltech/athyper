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

/** Thrown when hasModuleAccess is called without a resolver wired — always a bug in middleware setup. */
export class ModuleAccessMisconfiguredError extends Error {
  constructor() {
    super("ModuleAccessResolver not provided — middleware mounted without a resolver");
    this.name = "ModuleAccessMisconfiguredError";
  }
}

/** Thrown when the resolver call fails due to a transient infrastructure error. Callers should return 503. */
export class ModuleAccessDegradedError extends Error {
  readonly retryAfterSeconds: number;
  constructor(cause: unknown, retryAfterSeconds = 5) {
    super("Module access service temporarily unavailable");
    this.name = "ModuleAccessDegradedError";
    this.retryAfterSeconds = retryAfterSeconds;
    if (cause instanceof Error) this.cause = cause;
  }
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
  if (resolver === undefined) {
    throw new ModuleAccessMisconfiguredError();
  }
  if (!tenantId || !principalId || !moduleId) return false;

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
        FROM control.module m
        JOIN control.workspace_module wm
          ON wm.module_id = m.id
         AND wm.is_primary
         AND wm.status = 'active'
        JOIN control.workspace w ON w.id = wm.workspace_id
        WHERE m.id::text = ${moduleId}
           OR lower(m.code) = lower(${moduleId})
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
    // v2 catalog contracts carry the stable module code (for example `acc`),
    // while legacy entity rows and IAM projections may carry the UUID. Accept
    // both representations at this boundary so the contract does not leak
    // storage identity requirements into runtime consumers.
    const normalizedModuleId = moduleId.toLowerCase();
    return access.moduleIds.includes(moduleId)
      || access.moduleIds.some((id) => id.toLowerCase() === normalizedModuleId)
      || access.moduleCodes.some((code) => code.toLowerCase() === normalizedModuleId);
  } catch (err) {
    logger?.warn("metadata_module_access_check_failed", {
      tenantId,
      principalId,
      moduleId,
      err: String(err),
    });
    throw new ModuleAccessDegradedError(err);
  }
}
