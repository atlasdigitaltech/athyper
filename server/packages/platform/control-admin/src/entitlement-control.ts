import { parseInstant } from "@athyper/platform-temporal";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import { controlAdminPermissions, controlAdminSchemas, type CacheInvalidator, type EntitlementRepository, type TenantEntitlementOverride } from "@athyper/server-contract-control-admin";
import type { ExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { HttpError, validateRuntimeSchema, type RuntimeSchema } from "@athyper/server-runtime-http";

type OverrideInput = Omit<TenantEntitlementOverride, "version" | "tenantId" | "status">;
export function createEntitlementControlService(options: { readonly authorizer: Authorizer; readonly repositories: ExactPlaneRepositoryProvider<EntitlementRepository>; readonly cache: CacheInvalidator; readonly onChanged?: (context: VerifiedRequestContext) => Promise<void> }) {
  const permit = async (context: VerifiedRequestContext, permissionCode: string) => {
    if (!(await options.authorizer.authorize({ context, permissionCode })).allowed) throw error(403, "CONTROL_ADMIN_PERMISSION_DENIED");
  };
  const repositoryFor = (context: VerifiedRequestContext) => {
    try { return options.repositories.require(context.planeKey); }
    catch (cause) {
      if (cause instanceof Error && "status" in cause && cause.status === 503) throw error(503, "CONTROL_ADMIN_ENTITLEMENT_REPOSITORY_UNAVAILABLE");
      throw cause;
    }
  };
  const currentOverride = async (repository: EntitlementRepository, context: VerifiedRequestContext, id: string) => {
    const current = await repository.getOverride(context.tenantId, id);
    if (current && (current.tenantId !== context.tenantId || current.id !== id)) throw error(404, "CONTROL_ADMIN_NOT_FOUND");
    return current;
  };
  const invalidate = async (context: VerifiedRequestContext, codes: readonly string[]) => {
    await options.onChanged?.(context);
    await options.cache.invalidate({ namespace: "entitlements", tenantId: context.tenantId, keys: [...new Set(codes)] });
  };
  return {
    async listPlans(context: VerifiedRequestContext) {
      await permit(context, controlAdminPermissions.catalogRead);
      return repositoryFor(context).listPlans();
    },
    async listModules(context: VerifiedRequestContext) {
      await permit(context, controlAdminPermissions.catalogRead);
      return repositoryFor(context).listModules();
    },
    async saveOverride(command: { readonly context: VerifiedRequestContext; readonly override: OverrideInput; readonly expectedVersion: number }) {
      const { context } = command;
      await permit(context, controlAdminPermissions.tenantOverrideManage);
      if (!command.override || typeof command.override !== "object" || Array.isArray(command.override)) throw error(400, "CONTROL_ADMIN_INVALID_COMMAND");
      const { id, ...value } = command.override;
      schema(controlAdminSchemas.entitlementParams, { id });
      schema(controlAdminSchemas.entitlementOverride, { override: value, expectedVersion: command.expectedVersion });
      const from = parseInstant(value.effectiveFrom), until = value.effectiveUntil === undefined ? undefined : parseInstant(value.effectiveUntil);
      if (!Number.isFinite(from) || until !== undefined && (!Number.isFinite(until) || until <= from)) throw error(400, "CONTROL_ADMIN_INVALID_EFFECTIVE_RANGE");
      if (value.limitValue !== undefined && (!Number.isSafeInteger(value.limitValue) || value.limitValue < 0)) throw error(400, "CONTROL_ADMIN_INVALID_VALUE");
      const repository = repositoryFor(context), current = await currentOverride(repository, context, id);
      if ((current?.version ?? 0) !== command.expectedVersion) throw error(409, "CONTROL_ADMIN_VERSION_CONFLICT");
      if (current && current.status !== "active") throw error(409, "CONTROL_ADMIN_LIFECYCLE_INVALID");
      const plan = await repository.getPlan(value.planCode, value.effectiveFrom);
      if (!plan || plan.code !== value.planCode || !(parseInstant(plan.effectiveFrom) <= from) || plan.effectiveUntil !== undefined && !(parseInstant(plan.effectiveUntil) > from)) throw error(404, "CONTROL_ADMIN_DEFINITION_NOT_FOUND");
      // A module exception may grant a catalog module not included in the plan.
      if (value.moduleCode !== undefined && !(await repository.listModules()).includes(value.moduleCode)) throw error(404, "CONTROL_ADMIN_DEFINITION_NOT_FOUND");
      if (value.limitCode !== undefined && !Object.hasOwn(plan.limits, value.limitCode)) throw error(404, "CONTROL_ADMIN_DEFINITION_NOT_FOUND");
      const saved = await mutate(() => repository.saveOverride({ ...value, id, reason: value.reason.trim(), tenantId: context.tenantId, expectedVersion: command.expectedVersion }, context.principalId));
      await invalidate(context, current ? [current.planCode, value.planCode] : [value.planCode]);
      return saved;
    },
    async expireOverride(context: VerifiedRequestContext, id: string, expectedVersion: number) {
      await permit(context, controlAdminPermissions.tenantOverrideManage);
      schema(controlAdminSchemas.entitlementParams, { id });
      schema(controlAdminSchemas.entitlementVersion, { expectedVersion });
      const repository = repositoryFor(context), current = await currentOverride(repository, context, id);
      if (!current) throw error(404, "CONTROL_ADMIN_NOT_FOUND");
      if (current.version !== expectedVersion) throw error(409, "CONTROL_ADMIN_VERSION_CONFLICT");
      if (current.status === "expired") return current;
      if (current.status !== "active") throw error(409, "CONTROL_ADMIN_LIFECYCLE_INVALID");
      const expired = await mutate(() => repository.expireOverride(context.tenantId, id, expectedVersion, context.principalId));
      await invalidate(context, [current.planCode]);
      return expired;
    },
  };
}
function schema(value: RuntimeSchema, input: unknown): void { try { validateRuntimeSchema(value, input); } catch { throw error(400, "CONTROL_ADMIN_INVALID_COMMAND"); } }
function error(status: number, code: string): HttpError { return new HttpError(status, code, code); }
async function mutate(work: () => Promise<TenantEntitlementOverride>): Promise<TenantEntitlementOverride> {
  try { return await work(); }
  catch (cause) {
    if (cause instanceof Error && "code" in cause && (cause.code === "CONTROL_ADMIN_VERSION_CONFLICT" || cause.code === "CONTROL_ADMIN_LIFECYCLE_INVALID")) throw error(409, cause.code);
    throw cause;
  }
}
