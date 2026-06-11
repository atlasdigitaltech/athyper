import type { Kysely } from "kysely";

type AnyDb = Kysely<Record<string, any>>;

export interface EffectiveModuleAccess {
  moduleIds: string[];
  moduleCodes: string[];
  workspaceIds: string[];
  source: "role_binding" | "tenant_default";
}

export interface ModuleAccessResolverOptions {
  planVersionId?: string;
  authEpoch?: number;
  cache?: unknown;
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

