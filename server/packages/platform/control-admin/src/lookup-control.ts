import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import {
  controlAdminPermissions,
  controlAdminSchemas,
  type CacheInvalidator,
  type LookupDesiredState,
  type LookupDomainRevision,
  type LookupRepository,
} from "@athyper/server-contract-control-admin";
import type { ExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { HttpError, validateRuntimeSchema } from "@athyper/server-runtime-http";

export function createLookupService(options: {
  readonly authorizer: Authorizer;
  readonly repositories: ExactPlaneRepositoryProvider<LookupRepository>;
  readonly cache: CacheInvalidator;
}) {
  async function permit(
    context: VerifiedRequestContext,
    permissionCode: string,
  ) {
    if (
      !(await options.authorizer.authorize({ context, permissionCode })).allowed
    )
      throw error(403, "PERMISSION_DENIED");
  }
  function repository(context: VerifiedRequestContext) {
    try {
      return options.repositories.require(context.planeKey);
    } catch (cause) {
      if (
        cause &&
        typeof cause === "object" &&
        "status" in cause &&
        cause.status === 503
      )
        throw error(503, "LOOKUP_REPOSITORY_UNAVAILABLE");
      throw cause;
    }
  }
  return {
    async list(context: VerifiedRequestContext) {
      await permit(context, controlAdminPermissions.catalogRead);
      return (await repository(context).listDomains(context.tenantId)).map(
        (domain) => visible(domain, context.tenantId),
      );
    },
    async read(
      context: VerifiedRequestContext,
      code: string,
      version?: number,
    ) {
      await permit(context, controlAdminPermissions.catalogRead);
      codeValid(code);
      if (version !== undefined) revisionValid(version);
      const domain = await repository(context).getDomain(
        code,
        version,
        context.tenantId,
      );
      if (
        !domain ||
        domain.code !== code ||
        (version !== undefined && domain.version !== version)
      )
        throw error(404, "NOT_FOUND");
      return visible(domain, context.tenantId);
    },
    async applyDesiredState(
      context: VerifiedRequestContext,
      state: LookupDesiredState,
    ) {
      await permit(context, controlAdminPermissions.catalogPublish);
      validateLookupDesiredState(state);
      if (state.targetPlane !== context.planeKey)
        throw error(403, "DESIRED_STATE_TARGET_MISMATCH");
      const saved = await repository(context).publishDesiredState(
        state,
        context.principalId,
        context.tenantId,
      );
      await options.cache.invalidate({
        namespace: "lookups",
        keys: [state.domain.code],
      });
      return visible(saved, context.tenantId);
    },
    async retireValue(
      context: VerifiedRequestContext,
      input: {
        readonly domainCode: string;
        readonly valueCode: string;
        readonly tenantId?: string;
        readonly expectedVersion?: number;
      },
    ) {
      await permit(context, controlAdminPermissions.tenantOverrideManage);
      // Only tenant-owned retirement is exposed here; global retirement is published desired state.
      if (input.tenantId !== context.tenantId)
        throw error(403, "PERMISSION_DENIED");
      codeValid(input.domainCode);
      codeValid(input.valueCode);
      revisionValid(input.expectedVersion);
      const repo = repository(context),
        domain = await repo.getDomain(
          input.domainCode,
          undefined,
          context.tenantId,
        );
      if (!domain || domain.code !== input.domainCode)
        throw error(404, "NOT_FOUND");
      if (!domain.extensible || domain.status !== "active")
        throw error(409, "OVERRIDE_NOT_ALLOWED");
      const value = domain.values.find(
        (v) => v.code === input.valueCode && v.tenantId === context.tenantId,
      );
      if (!value) throw error(404, "NOT_FOUND");
      if (domain.version !== input.expectedVersion)
        throw error(409, "VERSION_CONFLICT");
      if (value.status === "retired") return visible(domain, context.tenantId);
      if (
        await repo.isValueReferenced(
          input.domainCode,
          input.valueCode,
          context.tenantId,
        )
      )
        throw error(409, "REFERENCE_IN_USE");
      // The repository must repeat these checks in its write transaction to prevent races.
      const saved = await repo.retireValue(
        {
          domainCode: input.domainCode,
          valueCode: input.valueCode,
          tenantId: context.tenantId,
          expectedVersion: input.expectedVersion,
        },
        context.principalId,
      );
      await options.cache.invalidate({
        namespace: "lookups",
        tenantId: context.tenantId,
        keys: [input.domainCode],
      });
      return visible(saved, context.tenantId);
    },
  };
}

export function validateLookupDesiredState(state: LookupDesiredState): void {
  try {
    validateRuntimeSchema(controlAdminSchemas.lookupDesiredState, state);
  } catch {
    throw error(400, "INVALID_COMMAND");
  }
  const ids = new Set<string>(),
    codes = new Set<string>();
  for (const value of state.domain.values) {
    if (value.tenantId !== undefined)
      throw error(403, "DESIRED_STATE_TARGET_MISMATCH");
    if (ids.has(value.id) || codes.has(value.code) || !json(value.metadata))
      throw error(400, "INVALID_COMMAND");
    ids.add(value.id);
    codes.add(value.code);
  }
}
function visible(
  domain: LookupDomainRevision,
  tenantId: string,
): LookupDomainRevision {
  return {
    ...domain,
    values: domain.values.filter(
      (value) => value.tenantId === undefined || value.tenantId === tenantId,
    ),
  };
}
function codeValid(code: string): void {
  try {
    validateRuntimeSchema(controlAdminSchemas.lookupCodeParams, { code });
  } catch {
    throw error(400, "INVALID_COMMAND");
  }
}
function revisionValid(version: unknown): asserts version is number {
  if (
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 1
  )
    throw error(400, "INVALID_COMMAND");
}
function json(value: unknown, seen = new Set<object>(), depth = 0): boolean {
  if (depth > 64) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return false;
  if (Object.getOwnPropertySymbols(value).length || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !("value" in d))) return false;
  if (Array.isArray(value)) for(let i=0;i<value.length;i++) if(!Object.hasOwn(value,i)) return false;
  seen.add(value);
  const valid = Object.values(value).every((child) =>
    json(child, seen, depth + 1),
  );
  seen.delete(value);
  return valid;
}
function error(status: number, code: string) {
  return new HttpError(status, `CONTROL_ADMIN_${code}`, code);
}
