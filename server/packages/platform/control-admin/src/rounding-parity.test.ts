import { describe, it, expect } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  RoundingAggregate,
  RoundingRepository,
} from "@athyper/server-contract-control-admin";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import {
  RoundingResolver,
  roundFinanceDecimal,
} from "@athyper/server-service-finance";
import { createRoundingService } from "./rounding-control.js";

const context = {
  tenantId: "tenant",
  principalId: "actor",
  planeKey: "neon",
} as VerifiedRequestContext;
function fixture(
  currency: { minorUnits: number; roundingIncrement?: string } | undefined,
  precisionDigits?: number,
  roundingIncrement?: string,
) {
  const rule: RoundingAggregate = {
    id: "rule",
    tenantId: "tenant",
    version: 1,
    code: "cash",
    name: "Cash",
    method: "ROUND_HALF_EVEN",
    contexts: [{}],
    status: "active",
    ...(precisionDigits !== undefined ? { precisionDigits } : {}),
    ...(roundingIncrement !== undefined ? { roundingIncrement } : {}),
  };
  const repo: RoundingRepository = {
    list: async () => [rule],
    get: async () => undefined,
    getCurrencyDefaults: async () => currency,
    save: async (value) => ({ ...value, version: 1 }),
    retire: async () => rule,
  };
  const api = createRoundingService({
    authorizer: { authorize: async () => ({ allowed: true }) },
    repositories: createExactPlaneRepositoryProvider({ neon: repo }),
    cache: { invalidate: async () => {} },
  });
  const finance = new RoundingResolver({
    listCandidates: async () => [
      {
        contextId: "ctx",
        ruleId: rule.id,
        ruleCode: rule.code,
        method: "ROUND_HALF_EVEN",
        revision: "1",
        ...(precisionDigits !== undefined ? { precisionDigits } : {}),
        ...(roundingIncrement !== undefined ? { roundingIncrement } : {}),
      },
    ],
    getCurrencyDefaults: async () =>
      currency
        ? { currencyCode: "JPY", revision: "1", ...currency }
        : undefined,
  });
  return { api, finance, rule };
}
describe("control simulation and finance rounding parity", () => {
  it.each([
    ["JPY integer increment", { minorUnits: 0 }, undefined, "1", "1.5", "2"],
    [
      "USD increment only",
      { minorUnits: 2 },
      undefined,
      "0.05",
      "1.025",
      "1.00",
    ],
    [
      "KWD increment only",
      { minorUnits: 3 },
      undefined,
      "0.005",
      "1.0275",
      "1.030",
    ],
    ["explicit JPY precision", { minorUnits: 0 }, 2, "0.05", "1.05", "1.05"],
    [
      "currency cash increment",
      { minorUnits: 2, roundingIncrement: "0.05" },
      2,
      undefined,
      "1.025",
      "1.00",
    ],
    [
      "database trailing zeroes",
      { minorUnits: 0 },
      undefined,
      "1.000000",
      "-1.5",
      "-2",
    ],
  ] as const)(
    "%s",
    async (_label, currency, precision, increment, amount, output) => {
      const { api, finance } = fixture(currency, precision, increment);
      expect(
        (await api.simulate(context, { amount, currencyCode: "JPY" })).output,
      ).toBe(output);
      expect(
        roundFinanceDecimal(
          amount,
          await finance.resolve({
            tenantId: context.tenantId,
            currencyCode: "JPY",
          }),
        ),
      ).toBe(output);
    },
  );
  it.each([
    ["JPY fractional increment", { minorUnits: 0 }, undefined, "0.05"],
    ["unknown currency", undefined, undefined, "0.05"],
    ["explicit incompatible precision", { minorUnits: 2 }, 0, "0.05"],
  ] as const)(
    "rejects %s in both paths",
    async (_label, currency, precision, increment) => {
      const { api, finance } = fixture(currency, precision, increment);
      await expect(
        api.simulate(context, { amount: "1.05", currencyCode: "JPY" }),
      ).rejects.toMatchObject({ statusCode: precision === 0 ? 503 : 400 });
      await expect(
        finance.resolve({ tenantId: context.tenantId, currencyCode: "JPY" }),
      ).rejects.toMatchObject({ code: "FINANCE_INVALID_COMMAND" });
    },
  );
  it("rejects increment-only rules without a currency instead of inferring precision", async () => {
    const { api, finance } = fixture({ minorUnits: 2 }, undefined, "0.05");
    await expect(
      api.simulate(context, { amount: "1.05" }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      finance.resolve({ tenantId: context.tenantId }),
    ).rejects.toMatchObject({ code: "FINANCE_INVALID_COMMAND" });
  });
  it("rejects a new incompatible currency-scoped rule before persistence", async () => {
    const { api, rule } = fixture({ minorUnits: 0 }, undefined, "0.05");
    const { tenantId: _tenant, version: _version, ...aggregate } = rule;
    await expect(
      api.save({
        context,
        aggregate: { ...aggregate, contexts: [{ currencyCode: "JPY" }] },
        expectedVersion: 0,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
  it("refuses to truncate an incompatible finance evidence object", () => {
    expect(() =>
      roundFinanceDecimal("1.05", {
        source: "rule",
        method: "ROUND_HALF_UP",
        precisionDigits: 0,
        roundingIncrement: "0.05",
        specificity: 0,
        revision: "1",
        evidenceHash: "test",
      }),
    ).toThrow(/represented/);
  });
});
