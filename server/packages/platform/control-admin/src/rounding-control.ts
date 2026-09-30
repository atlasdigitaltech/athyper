import {
  resolveDecimalRounding,
  roundDecimal,
} from "@athyper/server-foundation";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import {
  controlAdminPermissions,
  controlAdminSchemas,
  type CacheInvalidator,
  type RoundingAggregate,
  type RoundingContext,
  type RoundingRepository,
  type RoundingSimulation,
} from "@athyper/server-contract-control-admin";
import type { ExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import {
  HttpError,
  validateRuntimeSchema,
  type RuntimeSchema,
} from "@athyper/server-runtime-http";

type Options = {
  readonly authorizer: Authorizer;
  readonly repositories: ExactPlaneRepositoryProvider<RoundingRepository>;
  readonly cache: CacheInvalidator;
};
export function createRoundingService(options: Options) {
  async function permit(context: VerifiedRequestContext, write = false) {
    if (
      !(
        await options.authorizer.authorize({
          context,
          permissionCode: write
            ? controlAdminPermissions.financeConfigManage
            : controlAdminPermissions.catalogRead,
        })
      ).allowed
    )
      throw coded("CONTROL_ADMIN_PERMISSION_DENIED", 403);
    if (write && context.planeKey !== "neon")
      throw coded("CONTROL_ADMIN_FINANCE_WRITER_NEON_REQUIRED", 403);
  }
  function repo(context: VerifiedRequestContext) {
    try {
      return options.repositories.require(context.planeKey);
    } catch {
      throw coded("CONTROL_ADMIN_ROUNDING_REPOSITORY_UNAVAILABLE", 503);
    }
  }
  async function rows(context: VerifiedRequestContext) {
    const result = await repo(context).list(context.tenantId);
    for (const row of result) {
      try {
        check(controlAdminSchemas.roundingRecord, row);
        validateRounding(row);
        if (row.tenantId !== context.tenantId)
          throw coded("CONTROL_ADMIN_INVALID_VALUE");
      } catch {
        throw coded("CONTROL_ADMIN_ROUNDING_STORED_CONFIGURATION_INVALID", 503);
      }
    }
    return result;
  }
  return {
    async list(context: VerifiedRequestContext) {
      await permit(context);
      return rows(context);
    },
    async save(command: {
      readonly context: VerifiedRequestContext;
      readonly aggregate: Omit<RoundingAggregate, "tenantId" | "version">;
      readonly expectedVersion?: number;
    }) {
      const { context, aggregate, expectedVersion } = command;
      await permit(context, true);
      const { id, ...definition } = aggregate;
      check(controlAdminSchemas.roundingIdParams, { id });
      check(controlAdminSchemas.roundingSave, {
        aggregate: definition,
        expectedVersion,
      });
      validateRounding(aggregate);
      const repository = repo(context);
      for (const scope of aggregate.contexts) {
        if (!scope.currencyCode && aggregate.precisionDigits === undefined)
          continue;
        const currency = scope.currencyCode
          ? await repository.getCurrencyDefaults(
              context.tenantId,
              scope.currencyCode,
            )
          : undefined;
        try {
          resolveDecimalRounding(aggregate, currency);
        } catch {
          throw coded("CONTROL_ADMIN_INVALID_VALUE");
        }
      }
      const current = await repository.get(context.tenantId, id);
      if (
        expectedVersion !== 0 &&
        (!current || current.tenantId !== context.tenantId)
      )
        throw coded("CONTROL_ADMIN_NOT_FOUND", 404);
      if (
        current &&
        (current.tenantId !== context.tenantId ||
          current.version !== expectedVersion ||
          current.status === "retired")
      )
        throw coded("CONTROL_ADMIN_VERSION_CONFLICT", 409);
      if (current?.status === "active")
        throw coded("CONTROL_ADMIN_ROUNDING_ACTIVE_IMMUTABLE", 409);
      if (aggregate.status === "active")
        for (const other of await rows(context))
          if (other.id !== id && other.status === "active")
            for (const scope of aggregate.contexts)
              if (
                other.contexts.some(
                  (candidate) => key(scope) === key(candidate),
                )
              )
                throw coded("CONTROL_ADMIN_ROUNDING_OVERLAP", 409);
      const saved = await repository.save(
        {
          ...aggregate,
          tenantId: context.tenantId,
          expectedVersion: expectedVersion!,
        },
        context.principalId,
      );
      await options.cache.invalidate({
        namespace: "rounding",
        tenantId: context.tenantId,
      });
      return saved;
    },
    async retire(
      context: VerifiedRequestContext,
      id: string,
      expectedVersion?: number,
    ) {
      await permit(context, true);
      check(controlAdminSchemas.roundingIdParams, { id });
      check(controlAdminSchemas.roundingRetire, { expectedVersion });
      const repository = repo(context),
        current = await repository.get(context.tenantId, id);
      if (!current || current.tenantId !== context.tenantId)
        throw coded("CONTROL_ADMIN_NOT_FOUND", 404);
      if (current.version !== expectedVersion)
        throw coded("CONTROL_ADMIN_VERSION_CONFLICT", 409);
      if (current.status === "retired") return current;
      const saved = await repository.retire(
        context.tenantId,
        id,
        expectedVersion,
        context.principalId,
      );
      await options.cache.invalidate({
        namespace: "rounding",
        tenantId: context.tenantId,
      });
      return saved;
    },
    async simulate(
      context: VerifiedRequestContext,
      input: {
        readonly amount: string;
        readonly companyCodeId?: string;
        readonly currencyCode?: string;
        readonly slot?: string;
      },
    ): Promise<RoundingSimulation> {
      await permit(context);
      check(controlAdminSchemas.roundingSimulation, input);
      const candidates = (await rows(context))
        .filter((r) => r.status === "active")
        .flatMap((rule) =>
          rule.contexts
            .filter((scope) => matches(scope, input))
            .map((scope) => ({ rule, specificity: specificity(scope) })),
        )
        .sort((a, b) => b.specificity - a.specificity);
      const selected = candidates[0];
      if (!selected) throw coded("CONTROL_ADMIN_NOT_FOUND", 404);
      if (candidates[1]?.specificity === selected.specificity)
        throw coded("CONTROL_ADMIN_ROUNDING_OVERLAP", 409);
      const currency = input.currencyCode
        ? await repo(context).getCurrencyDefaults(
            context.tenantId,
            input.currencyCode,
          )
        : undefined;
      let output: string;
      try {
        output = roundDecimal(
          input.amount,
          resolveDecimalRounding(selected.rule, currency),
        );
      } catch {
        throw coded("CONTROL_ADMIN_INVALID_VALUE");
      }
      return {
        input: input.amount,
        output,
        ruleId: selected.rule.id,
        ruleCode: selected.rule.code,
        specificity: selected.specificity,
      };
    },
  };
}
function validateRounding(
  value: Omit<RoundingAggregate, "tenantId" | "version">,
) {
  if (
    value.precisionDigits === undefined &&
    value.roundingIncrement === undefined
  )
    throw coded("CONTROL_ADMIN_ROUNDING_PRECISION_REQUIRED");
  if (
    value.roundingIncrement !== undefined &&
    (decimalUnits(
      value.roundingIncrement,
      decimalPlaces(value.roundingIncrement),
    ) <= 0n ||
      (value.precisionDigits !== undefined &&
        decimalPlaces(
          value.roundingIncrement.replace(/0+$/, "").replace(/\.$/, ""),
        ) > value.precisionDigits))
  )
    throw coded("CONTROL_ADMIN_INVALID_VALUE");
  const keys = value.contexts.map(key);
  if (new Set(keys).size !== keys.length)
    throw coded("CONTROL_ADMIN_ROUNDING_OVERLAP", 409);
}
function key(scope: RoundingContext) {
  return JSON.stringify([
    scope.companyCodeId ?? null,
    scope.currencyCode ?? null,
    scope.slot ?? null,
  ]);
}
function check(schema: RuntimeSchema, value: unknown) {
  try {
    validateRuntimeSchema(schema, value);
  } catch {
    throw coded("CONTROL_ADMIN_INVALID_VALUE");
  }
}
function coded(code: string, status = 400) {
  return new HttpError(status, code, code);
}
function matches(scope: RoundingContext, input: RoundingContext): boolean {
  return (
    (!scope.companyCodeId || scope.companyCodeId === input.companyCodeId) &&
    (!scope.currencyCode || scope.currencyCode === input.currencyCode) &&
    (!scope.slot || scope.slot === input.slot)
  );
}
function specificity(scope: RoundingContext): number {
  return (
    (scope.companyCodeId ? 4 : 0) +
    (scope.currencyCode ? 2 : 0) +
    (scope.slot ? 1 : 0)
  );
}
function decimalPlaces(value: string): number {
  return value.split(".")[1]?.length ?? 0;
}
function decimalUnits(value: string, scale: number): bigint {
  const negative = value.startsWith("-"),
    [whole = "0", fraction = ""] = (negative ? value.slice(1) : value).split(
      ".",
    );
  const units = BigInt(`${whole}${fraction.padEnd(scale, "0")}`);
  return negative ? -units : units;
}
