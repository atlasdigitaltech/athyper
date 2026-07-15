import type { Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export const LIFECYCLE_ORCHESTRATOR_FLAG = "lifecycle_command_orchestrator_v2";

export interface LifecycleOrchestratorRollout {
  enabled: boolean;
  source: "tenant" | "platform" | "missing";
  enabledOperations: readonly string[] | "all";
}

/**
 * Resolves the rollout from entity metadata. Tenant rows replace the platform
 * value when they explicitly declare the flag; omission inherits platform.
 * A malformed value fails closed.
 */
export async function resolveLifecycleOrchestratorRollout(
  db: AnyDb,
  tenantId: string,
  entityCode: string,
  operationCode: string,
): Promise<LifecycleOrchestratorRollout> {
  const rows = await db
    .selectFrom("control.entity as e")
    .select(["e.tenant_id", "e.feature_flags"] as never[])
    .where("e.name" as never, "=" as never, entityCode as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where((eb: any) => eb.or([
      eb("e.tenant_id" as never, "is" as never, null),
      eb("e.tenant_id" as never, "=" as never, tenantId),
    ]))
    .execute() as Array<{ tenant_id: string | null; feature_flags: unknown }>;

  const platform = rows.find((row) => row.tenant_id === null);
  const tenant = rows.find((row) => row.tenant_id === tenantId);
  const tenantFlags = asRecord(tenant?.feature_flags);
  const platformFlags = asRecord(platform?.feature_flags);
  const hasTenantOverride = Object.prototype.hasOwnProperty.call(tenantFlags, LIFECYCLE_ORCHESTRATOR_FLAG);
  const value = hasTenantOverride
    ? tenantFlags[LIFECYCLE_ORCHESTRATOR_FLAG]
    : platformFlags[LIFECYCLE_ORCHESTRATOR_FLAG];
  const source = hasTenantOverride ? "tenant" : platform ? "platform" : "missing";
  const enabledOperations = parseOperations(value);

  return {
    enabled: enabledOperations === "all" || enabledOperations.includes(normalize(operationCode)),
    source,
    enabledOperations,
  };
}

export function isLifecycleOrchestratorOperationEnabled(
  value: unknown,
  operationCode: string,
): boolean {
  const operations = parseOperations(value);
  return operations === "all" || operations.includes(normalize(operationCode));
}

function parseOperations(value: unknown): readonly string[] | "all" {
  if (value === true) return "all";
  if (value === false || value == null) return [];
  if (Array.isArray(value)) return value.filter(isString).map(normalize);
  const config = asRecord(value);
  if (config["enabled"] === false) return [];
  if (config["enabled"] === true && config["operations"] === undefined) return "all";
  if (Array.isArray(config["operations"])) {
    return config["operations"].filter(isString).map(normalize);
  }
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/-/g, "_");
}
