import { describe, it, expect, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  RoundingAggregate,
  RoundingRepository,
} from "@athyper/server-contract-control-admin";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { createRoundingService } from "./rounding-control.js";
const context = {
  tenantId: "tenant",
  principalId: "actor",
  planeKey: "neon",
} as VerifiedRequestContext;
const rule: RoundingAggregate = {
  id: "rule",
  tenantId: "tenant",
  version: 1,
  code: "cash",
  name: "Cash",
  method: "ROUND_HALF_UP",
  precisionDigits: 2,
  contexts: [{}],
  status: "active",
};
function fixture(rules: RoundingAggregate[] = [rule], denied = false) {
  const repo = {
    getCurrencyDefaults: vi.fn(async (_tenant: string, code: string) => code === "USD" ? {minorUnits:2} : code === "JPY" ? {minorUnits:0} : undefined),
    list: vi.fn(async () => rules),
    get: vi.fn(async (_t, id) => rules.find((r) => r.id === id)),
    save: vi.fn<RoundingRepository["save"]>(
      async ({ expectedVersion, ...r }) => ({
        ...r,
        version: (expectedVersion ?? 0) + 1,
      }),
    ),
    retire: vi.fn<RoundingRepository["retire"]>(async () => ({
      ...rule,
      status: "retired",
      version: 2,
    })),
  } satisfies RoundingRepository;
  const cache = { invalidate: vi.fn(async () => {}) };
  const service = createRoundingService({
    authorizer: {
      authorize: vi.fn(async () =>
        denied
          ? { allowed: false as const, reason: "denied" }
          : { allowed: true as const },
      ),
    },
    repositories: createExactPlaneRepositoryProvider({ neon: repo }),
    cache,
  });
  return { service, repo, cache };
}
const aggregate = (({ tenantId, version, ...r }) => r)(rule);
describe("rounding calculation and administration", () => {
  it.each([
    ["ROUND_HALF_UP", "1.005", "1.01"],
    ["ROUND_HALF_UP", "-1.005", "-1.01"],
    ["ROUND_HALF_EVEN", "1.005", "1.00"],
    ["ROUND_HALF_EVEN", "1.015", "1.02"],
    ["ROUND_HALF_EVEN", "-1.015", "-1.02"],
    ["ROUND_UP", "-1.001", "-1.01"],
    ["ROUND_UP", "1.001", "1.01"],
    ["ROUND_DOWN", "-1.009", "-1.00"],
    ["TRUNCATE", "1.009", "1.00"],
    ["TRUNCATE", "-0.001", "0.00"],
    ["ROUND_HALF_UP", "9007199254740993.005", "9007199254740993.01"],
  ] as const)("%s %s = %s", async (method, amount, output) => {
    const f = fixture([{ ...rule, method }]);
    expect(await f.service.simulate(context, { amount })).toMatchObject({
      output,
    });
    expect(f.repo.save).not.toHaveBeenCalled();
    expect(f.cache.invalidate).not.toHaveBeenCalled();
  });
  it.each([
    ["1.025", "1.00"],
    ["1.075", "1.10"],
    ["-1.075", "-1.10"],
  ])("rounds cash increment ties %s", async (amount, output) => {
    expect(
      await fixture([
        { ...rule, method: "ROUND_HALF_EVEN", roundingIncrement: "0.05" },
      ]).service.simulate(context, { amount: amount! }),
    ).toMatchObject({ output });
  });
  it.each([
    "1e2",
    "+1.2",
    " NaN",
    "1.",
    "",
    "9".repeat(39),
    "0." + "1".repeat(19),
  ])("rejects malformed or unbounded amount %s", async (amount) => {
    const f = fixture();
    await expect(f.service.simulate(context, { amount })).rejects.toMatchObject(
      { statusCode: 400 },
    );
    expect(f.repo.list).not.toHaveBeenCalled();
  });
  it("supports zero precision and integer increments without decimal coercion", async () => {
    expect(
      await fixture([
        { ...rule, precisionDigits: 0, roundingIncrement: "50" },
      ]).service.simulate(context, { amount: "-125" }),
    ).toMatchObject({ output: "-150" });
    expect(
      await fixture([
        { ...rule, precisionDigits: undefined, roundingIncrement: "0.05" },
      ]).service.simulate(context, { amount: "10.05", currencyCode:"USD" }),
    ).toMatchObject({ output: "10.05" });
  });
  it("requires replacing an activated rule rather than editing it", async () => {
    const f = fixture();
    await expect(
      f.service.save({ context, aggregate, expectedVersion: 1 }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "CONTROL_ADMIN_ROUNDING_ACTIVE_IMMUTABLE",
    });
    expect(f.repo.save).not.toHaveBeenCalled();
  });
  it("preserves company/currency/slot precedence and ignores inactive rules", async () => {
    const f = fixture([
      rule,
      {
        ...rule,
        id: "currency",
        contexts: [{ currencyCode: "USD", slot: "cash" }],
      },
      { ...rule, id: "company", contexts: [{ companyCodeId: "company" }] },
      {
        ...rule,
        id: "inactive",
        status: "retired",
        contexts: [
          { companyCodeId: "company", currencyCode: "USD", slot: "cash" },
        ],
      },
    ]);
    expect(
      await f.service.simulate(context, {
        amount: "1.2",
        companyCodeId: "company",
        currencyCode: "USD",
        slot: "cash",
      }),
    ).toMatchObject({ ruleId: "company", specificity: 4 });
  });
  it("rejects equal-specificity ambiguity", async () => {
    await expect(
      fixture([rule, { ...rule, id: "other" }]).service.simulate(context, {
        amount: "1",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it("returns 404 when no active context matches", async () => {
    await expect(
      fixture([
        { ...rule, contexts: [{ currencyCode: "USD" }] },
      ]).service.simulate(context, { amount: "1" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
  it.each([
    { method: "unknown" },
    { precisionDigits: 7 },
    { roundingIncrement: "0" },
    { roundingIncrement: "0.001" },
    { contexts: [] },
    { contexts: [{}, {}] },
    { contexts: [{ slot: "" }] },
    { name: "  " },
    { precisionDigits: undefined, roundingIncrement: undefined },
  ])("rejects invalid rule %j", async (patch) => {
    const f = fixture();
    await expect(
      f.service.save({
        context,
        aggregate: { ...aggregate, ...patch } as typeof aggregate,
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ statusCode: expect.any(Number) });
    expect(f.repo.save).not.toHaveBeenCalled();
  });
  it.each(["studio", "mesh"] as const)(
    "blocks direct %s writes before repository access",
    async (planeKey) => {
      const f = fixture();
      await expect(
        f.service.save({
          context: { ...context, planeKey },
          aggregate,
          expectedVersion: 1,
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
      await expect(
        f.service.retire({ ...context, planeKey }, rule.id, 1),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(f.repo.get).not.toHaveBeenCalled();
    },
  );
  it("enforces permissions before reading", async () => {
    const f = fixture([rule], true);
    await expect(f.service.list(context)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(f.repo.list).not.toHaveBeenCalled();
  });
  it("rejects malformed stored rules and foreign tenant results", async () => {
    for (const patch of [{ method: "other" }, { tenantId: "foreign" }])
      await expect(
        fixture([{ ...rule, ...patch } as RoundingAggregate]).service.simulate(
          context,
          { amount: "1" },
        ),
      ).rejects.toMatchObject({ statusCode: 503 });
  });
  it("checks versions and terminal retirement", async () => {
    const f = fixture();
    await expect(
      f.service.save({ context, aggregate, expectedVersion: 0 }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(f.service.retire(context, "missing", 1)).rejects.toMatchObject(
      { statusCode: 404 },
    );
    await expect(f.service.retire(context, rule.id, 0)).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      fixture([{ ...rule, status: "retired" }]).service.save({
        context,
        aggregate,
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it("invalidates only after successful persistence and passes verified ownership", async () => {
    const f = fixture([{ ...rule, status: "draft" }]);
    await f.service.save({ context, aggregate, expectedVersion: 1 });
    expect(f.repo.save).toHaveBeenCalledWith(
      { ...aggregate, tenantId: "tenant", expectedVersion: 1 },
      "actor",
    );
    expect(f.cache.invalidate).toHaveBeenCalledOnce();
    f.cache.invalidate.mockClear();
    f.repo.save.mockRejectedValueOnce(new Error("rollback"));
    await expect(
      f.service.save({ context, aggregate, expectedVersion: 1 }),
    ).rejects.toThrow("rollback");
    expect(f.cache.invalidate).not.toHaveBeenCalled();
  });
});
