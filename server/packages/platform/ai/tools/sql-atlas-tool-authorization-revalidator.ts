import { sql } from "kysely";
import type {
  EffectivePermissionContext,
  PermissionResolverRegistry,
  VerifiedRequestContext,
} from "@athyper/svc-iam";
import type { AnyDb } from "../ai-runtime.types.js";
import type {
  AtlasToolAuthorizationRevalidationRequest,
  AtlasToolAuthorizationRevalidator,
} from "./atlas-tool.types.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLANES = new Set(["neon", "mesh", "admin"]);
const DEFAULT_STATEMENT_TIMEOUT_MS = 1_500;

interface AuthEpochRow {
  auth_epoch: string | number | bigint;
}

type EffectiveAuthorizationScope =
  EffectivePermissionContext["authorizationScopes"] extends
    ReadonlyMap<string, infer Scope>
    ? Scope
    : never;

export interface SqlAtlasToolAuthorizationRevalidatorOptions {
  /** Must remain below the executor control timeout. */
  readonly statementTimeoutMs?: number;
}

/**
 * Reads the current principal security epoch immediately before tool
 * execution. Missing, inactive, locked, malformed, stale, or unavailable
 * principal state is always treated as authorization revocation.
 */
export class SqlAtlasToolAuthorizationRevalidator
implements AtlasToolAuthorizationRevalidator {
  private readonly statementTimeoutMs: number;

  constructor(
    private readonly db: AnyDb,
    private readonly permissionResolvers: PermissionResolverRegistry,
    options: SqlAtlasToolAuthorizationRevalidatorOptions = {},
  ) {
    const timeout = options.statementTimeoutMs
      ?? DEFAULT_STATEMENT_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeout) || timeout < 100 || timeout > 30_000) {
      throw new Error("Invalid Atlas tool authorization statement timeout.");
    }
    this.statementTimeoutMs = timeout;
  }

  async isCurrent(
    context: VerifiedRequestContext,
    request: AtlasToolAuthorizationRevalidationRequest,
  ): Promise<boolean> {
    if (
      !UUID_RE.test(context.tenantId)
      || !UUID_RE.test(context.principalId)
      || !PLANES.has(context.planeKey)
      || !Number.isSafeInteger(context.authEpoch)
      || context.authEpoch < 0
      || !validPermissionRequest(request)
      || !originalContextIsConsistent(context)
    ) {
      return false;
    }

    try {
      const epochCurrent = await this.db.transaction().execute(
        async (transaction) => {
        const trx = transaction as unknown as AnyDb;
        await sql`
          SELECT
            set_config('app.current_tenant_id', ${context.tenantId}, true),
            set_config('app.current_principal_id', ${context.principalId}, true),
            set_config('app.current_atlas_plane', ${context.planeKey}, true),
            set_config(
              'statement_timeout',
              ${String(this.statementTimeoutMs)},
              true
            )
        `.execute(trx);
        const result = await sql<AuthEpochRow>`
          SELECT p.auth_epoch
          FROM master.principal p
          WHERE p.tenant_id = ${context.tenantId}::uuid
            AND p.id = ${context.principalId}::uuid
            AND p.is_active = true
            AND p.is_locked = false
        `.execute(trx);
        if (result.rows.length !== 1) return false;
        const current = exactSafeInteger(result.rows[0]!.auth_epoch);
        return current !== null && current === context.authEpoch;
        },
      );
      if (!epochCurrent) return false;

      const resolver = this.permissionResolvers.get(context.planeKey);
      if (resolver.planeKey !== context.planeKey) return false;
      const live = await resolver.build({
        planeKey: context.planeKey,
        tenantId: context.tenantId,
        principalId: context.principalId,
      });
      return liveContextMatches(context, live, request.requiredPermissions);
    } catch {
      return false;
    }
  }
}

function exactSafeInteger(value: string | number | bigint): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  let integer: bigint;
  if (typeof value === "bigint") {
    integer = value;
  } else {
    if (!/^(0|[1-9][0-9]*)$/.test(value)) return null;
    try {
      integer = BigInt(value);
    } catch {
      return null;
    }
  }
  if (integer < 0n || integer > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(integer);
}

function validPermissionRequest(
  request: AtlasToolAuthorizationRevalidationRequest,
): boolean {
  return !!request
    && Array.isArray(request.requiredPermissions)
    && request.requiredPermissions.length <= 128
    && request.requiredPermissions.every((permission) =>
      typeof permission === "string"
      && permission.length > 0
      && permission.length <= 128
      && !/[\u0000-\u001f\u007f]/.test(permission)
    );
}

function originalContextIsConsistent(
  context: VerifiedRequestContext,
): boolean {
  const permissions = context.permissions;
  return permissions.tenantId === context.tenantId
    && permissions.principalId === context.principalId
    && permissions.planeKey === context.planeKey
    && permissions.profileHash === context.profileHash
    && permissions.profileHash.length > 0
    && permissions.schemaHash.length > 0;
}

function liveContextMatches(
  original: VerifiedRequestContext,
  live: EffectivePermissionContext,
  requiredPermissions: readonly string[],
): boolean {
  const snapshot = original.permissions;
  if (
    live.tenantId !== original.tenantId
    || live.principalId !== original.principalId
    || live.planeKey !== original.planeKey
    || live.profileHash !== original.profileHash
    || live.profileHash !== snapshot.profileHash
    || live.schemaHash !== snapshot.schemaHash
    || live.principalFingerprint !== snapshot.principalFingerprint
    || live.planVersionId !== snapshot.planVersionId
    || live.networkAccountId !== snapshot.networkAccountId
  ) {
    return false;
  }

  return requiredPermissions.every((permission) =>
    permissionAllowed(snapshot, permission)
    && permissionAllowed(live, permission)
    && authorizationScopeEqual(
      snapshot.authorizationScopes.get(permission),
      live.authorizationScopes.get(permission),
    )
  );
}

function permissionAllowed(
  context: EffectivePermissionContext,
  permission: string,
): boolean {
  return context.allowed.has(permission)
    && !context.denied.has(permission)
    && !context.planLocked.has(permission)
    && !context.planeExcluded.has(permission)
    && context.entries.get(permission)?.status === "allow";
}

function authorizationScopeEqual(
  left: EffectiveAuthorizationScope | undefined,
  right: EffectiveAuthorizationScope | undefined,
): boolean {
  if (!left || !right) return left === right;
  return left.permissionCode === right.permissionCode
    && left.tenantWide === right.tenantWide
    && left.visibility === right.visibility
    && setEqual(left.legalEntityIds, right.legalEntityIds)
    && setEqual(left.companyCodeIds, right.companyCodeIds)
    && setEqual(
      left.operatingOrganizationIds,
      right.operatingOrganizationIds,
    )
    && setEqual(left.networkMembershipIds, right.networkMembershipIds);
}

function setEqual(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}
