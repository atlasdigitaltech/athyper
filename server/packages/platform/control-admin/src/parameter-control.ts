import { parseInstant } from "@athyper/platform-temporal";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import {
  controlAdminPermissions,
  controlAdminSchemas,
  type CacheInvalidator,
  type JsonValue,
  type ParameterDefinition,
  type ParameterRepository,
} from "@athyper/server-contract-control-admin";
import type { ExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import {
  HttpError,
  validateRuntimeSchema,
  type RuntimeSchema,
} from "@athyper/server-runtime-http";

export function createParameterService(options: {
  readonly authorizer: Authorizer;
  readonly repositories: ExactPlaneRepositoryProvider<ParameterRepository>;
  readonly cache: CacheInvalidator;
  readonly now?: () => Date;
}) {
  const now = options.now ?? (() => new Date());
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
        throw error(503, "PARAMETER_REPOSITORY_UNAVAILABLE");
      throw cause;
    }
  }
  return {
    async list(context: VerifiedRequestContext) {
      await permit(context, controlAdminPermissions.catalogRead);
      return repository(context).listDefinitions();
    },
    async resolve(context: VerifiedRequestContext, code: string) {
      await permit(context, controlAdminPermissions.catalogRead);
      schema(controlAdminSchemas.parameterCodeParams, { code });
      const repo = repository(context),
        at = now();
      const snapshot = repo.readEffective
        ? await repo.readEffective(context.tenantId, code, at.toISOString())
        : undefined;
      const definition = repo.readEffective
        ? snapshot?.definition
        : await repo.getDefinition(code);
      if (
        !definition ||
        definition.code !== code ||
        definition.status !== "active"
      )
        throw error(404, "DEFINITION_NOT_FOUND");
      const candidate = definition.tenantCanOverride
        ? repo.readEffective
          ? snapshot?.value
          : await repo.getValue(
              context.tenantId,
              definition.id,
              at.toISOString(),
            )
        : undefined;
      if (
        candidate &&
        (candidate.tenantId !== context.tenantId ||
          candidate.parameterDefinitionId !== definition.id)
      )
        throw error(404, "NOT_FOUND");
      const selected =
        candidate?.status === "active" && effective(candidate, at.getTime())
          ? candidate
          : undefined;
      // Null is a valid JSON override, not a request to fall back to the default.
      const value = selected ? selected.value : definition.defaultValue;
      try {
        schema(controlAdminSchemas.parameterDefinition, definition);
        validateParameterValue(definition, value);
      } catch {
        throw error(503, "INVALID_PARAMETER_CONFIGURATION");
      }
      return {
        code,
        value,
        configurationRevision: JSON.stringify([
          definition.id,
          definition.revision,
          selected?.id ?? null,
          selected?.version ?? null,
        ]),
        overrideVersion: selected?.version ?? 0,
        ...(selected ? { overrideId: selected.id } : {}),
        reloadMode: definition.reloadMode,
        cacheTtlSeconds: definition.cacheTtlSeconds,
        source: selected ? ("tenant_override" as const) : ("default" as const),
      };
    },
    async saveValue(command: {
      readonly context: VerifiedRequestContext;
      readonly code: string;
      readonly value: JsonValue;
      readonly reason?: string;
      readonly effectiveFrom: string;
      readonly effectiveUntil?: string;
      readonly id?: string;
      readonly expectedVersion: number;
    }) {
      const { context, code, ...input } = command;
      await permit(context, controlAdminPermissions.tenantOverrideManage);
      schema(controlAdminSchemas.parameterCodeParams, { code });
      schema(controlAdminSchemas.parameterValue, input);
      window(input);
      const repo = repository(context),
        definition = await repo.getDefinition(code);
      if (
        !definition ||
        definition.code !== code ||
        definition.status !== "active"
      )
        throw error(404, "DEFINITION_NOT_FOUND");
      if (!definition.tenantCanOverride)
        throw error(403, "OVERRIDE_NOT_ALLOWED");
      validateParameterValue(definition, input.value);
      const saved = await repo.saveValue(
        {
          ...input,
          ...(input.reason !== undefined
            ? { reason: input.reason.trim() }
            : {}),
          tenantId: context.tenantId,
          parameterDefinitionId: definition.id,
        },
        context.principalId,
      );
      await options.cache.invalidate({
        namespace: "parameters",
        tenantId: context.tenantId,
        keys: [code],
      });
      return saved;
    },
    async expireValue(
      context: VerifiedRequestContext,
      id: string,
      expectedVersion: number,
    ) {
      await permit(context, controlAdminPermissions.tenantOverrideManage);
      schema(controlAdminSchemas.parameterIdParams, { id });
      schema(controlAdminSchemas.parameterExpire, { expectedVersion });
      const saved = await repository(context).expireValue(
        context.tenantId,
        id,
        expectedVersion,
        context.principalId,
      );
      await options.cache.invalidate({
        namespace: "parameters",
        tenantId: context.tenantId,
      });
      return saved;
    },
  };
}
export function validateParameterValue(
  definition: ParameterDefinition,
  value: JsonValue,
): void {
  if (!isJson(value)) throw error(400, "INVALID_VALUE");
  const valid =
    definition.valueType === "json" ||
    (definition.valueType === "boolean" && typeof value === "boolean") ||
    (definition.valueType === "string" && typeof value === "string") ||
    (definition.valueType === "integer" &&
      typeof value === "number" &&
      Number.isSafeInteger(value)) ||
    (definition.valueType === "number" && typeof value === "number") ||
    (definition.valueType === "enum" &&
      ["string", "number", "boolean"].includes(typeof value) &&
      Array.isArray(definition.allowedValues) &&
      definition.allowedValues.length > 0) ||
    (definition.valueType === "duration" &&
      typeof value === "string" &&
      /^P(?!$)(?:\d+D)?(?:T(?=\d)(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/.test(
        value,
      ));
  if (!valid) throw error(400, "INVALID_VALUE");
  const { minValue: min, maxValue: max } = definition;
  if (
    ((min !== undefined || max !== undefined) &&
      !["integer", "number"].includes(definition.valueType)) ||
    (min !== undefined && !Number.isFinite(min)) ||
    (max !== undefined && !Number.isFinite(max)) ||
    (min !== undefined && max !== undefined && min > max)
  )
    throw error(400, "INVALID_VALUE");
  if (
    typeof value === "number" &&
    ((min !== undefined && value < min) || (max !== undefined && value > max))
  )
    throw error(400, "INVALID_VALUE");
  if (
    definition.allowedValues !== undefined &&
    (!Array.isArray(definition.allowedValues) ||
      !definition.allowedValues.every((v) => isJson(v)) ||
      !definition.allowedValues.some((v) => canonical(v) === canonical(value)))
  )
    throw error(400, "INVALID_VALUE");
}
function isJson(value: unknown, seen = new Set<object>(), depth = 0): boolean {
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
  seen.add(value);
  const valid =
    Object.values(value).every((v) => isJson(v, seen, depth + 1)) &&
    (!Array.isArray(value) || Object.keys(value).length === value.length);
  seen.delete(value);
  return valid;
}
function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonical((value as Record<string, JsonValue>)[k]!)}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
function window(value: { effectiveFrom: string; effectiveUntil?: string }) {
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
function effective(
  value: { effectiveFrom: string; effectiveUntil?: string },
  at: number,
) {
  try {
    window(value);
    return (
      parseInstant(value.effectiveFrom) <= at &&
      (value.effectiveUntil === undefined ||
        parseInstant(value.effectiveUntil) > at)
    );
  } catch {
    return false;
  }
}
function schema(s: RuntimeSchema, value: unknown) {
  try {
    validateRuntimeSchema(s, value);
  } catch {
    throw error(400, "INVALID_COMMAND");
  }
}
function error(status: number, code: string) {
  return new HttpError(status, `CONTROL_ADMIN_${code}`, code);
}
