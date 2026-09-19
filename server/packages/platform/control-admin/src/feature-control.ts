import { parseInstant } from "@athyper/platform-temporal";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import {
  controlAdminPermissions,
  controlAdminSchemas,
  type CacheInvalidator,
  type FeatureFlagRepository,
} from "@athyper/server-contract-control-admin";
import { featurePercentageCohort } from "@athyper/server-foundation";
import type { ExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import {
  HttpError,
  validateRuntimeSchema,
  type RuntimeSchema,
} from "@athyper/server-runtime-http";

export function createFeatureFlagService(options: {
  readonly authorizer: Authorizer;
  readonly repositories: ExactPlaneRepositoryProvider<FeatureFlagRepository>;
  readonly cache: CacheInvalidator;
  readonly now?: () => Date;
  readonly onChanged?: (context: VerifiedRequestContext) => Promise<void>;
}) {
  const now = options.now ?? (() => new Date());
  const permit = async (
    context: VerifiedRequestContext,
    permissionCode: string,
  ) => {
    if (
      !(await options.authorizer.authorize({ context, permissionCode })).allowed
    )
      throw error(403, "PERMISSION_DENIED");
  };
  const repository = (context: VerifiedRequestContext) => {
    try {
      return options.repositories.require(context.planeKey);
    } catch (cause) {
      if (cause instanceof Error && "status" in cause && cause.status === 503)
        throw error(503, "FEATURE_REPOSITORY_UNAVAILABLE");
      throw cause;
    }
  };
  const invalidate = async (context: VerifiedRequestContext, code?: string) => {
    await options.onChanged?.(context);
    await options.cache.invalidate({
      namespace: "features",
      tenantId: context.tenantId,
      ...(code ? { keys: [code] } : {}),
    });
  };
  return {
    async list(context: VerifiedRequestContext) {
      await permit(context, controlAdminPermissions.catalogRead);
      return repository(context).listDefinitions();
    },
    async evaluate(context: VerifiedRequestContext, code: string) {
      await permit(context, controlAdminPermissions.catalogRead);
      schema(controlAdminSchemas.featureCodeParams, { code });
      const repo = repository(context),
        at = now();
      const snapshot=repo.readEvaluation?await repo.readEvaluation(context.tenantId,code,at.toISOString()):undefined;
      const definition = repo.readEvaluation?snapshot?.definition:await repo.getDefinition(code);
      if (!definition || definition.code !== code)
        throw error(404, "DEFINITION_NOT_FOUND");
      const active =
        definition.status === "active" && effective(definition, at.getTime());
      const candidate = active
        ? repo.readEvaluation ? snapshot?.override : await repo.getOverride(
            context.tenantId,
            definition.id,
            at.toISOString(),
          )
        : undefined;
      if (
        candidate &&
        (candidate.tenantId !== context.tenantId ||
          candidate.featureFlagId !== definition.id)
      )
        throw error(404, "NOT_FOUND");
      const selected =
        candidate?.status === "active" && effective(candidate, at.getTime())
          ? candidate
          : undefined;
      const pct = definition.rolloutPct;
      const catalog =
        active &&
        definition.defaultEnabled === true &&
        (pct === undefined ||
          (Number.isInteger(pct) &&
            pct >= 0 &&
            pct <= 100 &&
            featurePercentageCohort(
              definition.cohortStrategy,
              context.tenantId,
              context.principalId,
              definition.code,
            ) < pct));
      const applied =
        definition.kind === "kill_switch" && !catalog ? undefined : selected;
      const enabled =
        definition.kind === "kill_switch"
          ? catalog && applied?.enabled !== false
          : (applied?.enabled ?? catalog);
      return {
        code,
        enabled,
        source: applied ? ("tenant_override" as const) : ("catalog" as const),
        definition,
        ...(applied ? { override: applied } : {}),
      };
    },
    async saveOverride(command: {
      readonly context: VerifiedRequestContext;
      readonly code: string;
      readonly enabled: boolean;
      readonly reason: string;
      readonly effectiveFrom: string;
      readonly effectiveUntil?: string;
      readonly id?: string;
      readonly expectedVersion: number;
    }) {
      const { context, code, ...input } = command;
      await permit(context, controlAdminPermissions.tenantOverrideManage);
      schema(controlAdminSchemas.featureCodeParams, { code });
      schema(controlAdminSchemas.featureOverride, input);
      window(input);
      const repo = repository(context),
        definition = await repo.getDefinition(code);
      if (
        !definition ||
        definition.code !== code ||
        definition.status !== "active"
      )
        throw error(404, "DEFINITION_NOT_FOUND");
      const saved = await repo.saveOverride(
        {
          ...input,
          tenantId: context.tenantId,
          featureFlagId: definition.id,
          reason: input.reason.trim(),
        },
        context.principalId,
      );
      await invalidate(context, code);
      return saved;
    },
    async expireOverride(
      context: VerifiedRequestContext,
      id: string,
      expectedVersion: number,
    ) {
      await permit(context, controlAdminPermissions.tenantOverrideManage);
      schema(controlAdminSchemas.featureIdParams, { id });
      schema(controlAdminSchemas.featureVersion, { expectedVersion });
      const saved = await repository(context).expireOverride(
        context.tenantId,
        id,
        expectedVersion,
        context.principalId,
      );
      await invalidate(context);
      return saved;
    },
  };
}
function schema(value: RuntimeSchema, input: unknown): void {
  try {
    validateRuntimeSchema(value, input);
  } catch {
    throw error(400, "INVALID_COMMAND");
  }
}
function effective(
  value: { effectiveFrom: string; effectiveUntil?: string },
  at: number,
): boolean {
  return (
    parseInstant(value.effectiveFrom) <= at &&
    (value.effectiveUntil === undefined ||
      parseInstant(value.effectiveUntil) > at)
  );
}
function window(value: {
  effectiveFrom: string;
  effectiveUntil?: string;
}): void {
  const from = parseInstant(value.effectiveFrom),
    until =
      value.effectiveUntil === undefined
        ? undefined
        : parseInstant(value.effectiveUntil);
  if (
    !Number.isFinite(from) ||
    (until !== undefined && (!Number.isFinite(until) || until <= from))
  )
    throw error(400, "INVALID_EFFECTIVE_RANGE");
}
function error(status: number, suffix: string): HttpError {
  const code = `CONTROL_ADMIN_${suffix}`;
  return new HttpError(status, code, code);
}
