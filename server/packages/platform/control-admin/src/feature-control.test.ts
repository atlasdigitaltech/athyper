import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  FeatureFlagDefinition,
  FeatureFlagOverride,
  FeatureFlagRepository,
} from "@athyper/server-contract-control-admin";
import {
  createExactPlaneRepositoryProvider,
  stablePercentageCohort,
  featurePercentageCohort,
} from "@athyper/server-foundation";
import { describe, expect, it, vi } from "vitest";
import { createFeatureFlagService } from "./feature-control.js";
const context = {
  tenantId: "tenant-1",
  principalId: "principal-1",
  planeKey: "neon",
} as VerifiedRequestContext;
const definition: FeatureFlagDefinition = {
  id: "flag-1",
  code: "ui.new",
  cohortStrategy: "principal_fnv1a_v2" as const,
  cohortRevision: 1,
  defaultEnabled: true,
  effectiveFrom: "2026-01-01T00:00:00Z",
  status: "active",
};
const override: FeatureFlagOverride = {
  id: "override-1",
  tenantId: context.tenantId,
  featureFlagId: definition.id,
  enabled: true,
  reason: "Pilot",
  effectiveFrom: definition.effectiveFrom,
  version: 1,
  status: "active",
};
const command = {
  context,
  code: definition.code,
  enabled: true,
  reason: " Pilot ",
  effectiveFrom: definition.effectiveFrom,
  expectedVersion: 0,
};
function fixture(
  flag: FeatureFlagDefinition = definition,
  value?: FeatureFlagOverride,
) {
  const repository = {
    getDefinition: vi.fn(async () => flag),
    listDefinitions: vi.fn(async () => [flag]),
    getOverride: vi.fn(async () => value),
    saveOverride: vi.fn<FeatureFlagRepository["saveOverride"]>(
      async (input) => ({
        ...input,
        id: input.id ?? "override-1",
        version: input.expectedVersion + 1,
        status: "active",
      }),
    ),
    expireOverride: vi.fn<FeatureFlagRepository["expireOverride"]>(
      async (tenantId, id, version) => ({
        ...override,
        tenantId,
        id,
        version: version + 1,
        status: "expired",
      }),
    ),
  } satisfies FeatureFlagRepository;
  const cache = { invalidate: vi.fn(async () => {}) },
    onChanged = vi.fn(async () => {}),
    now = vi.fn(() => new Date("2026-06-01T00:00:00Z"));
  const service = createFeatureFlagService({
    authorizer: { authorize: async () => ({ allowed: true }) },
    repositories: createExactPlaneRepositoryProvider({ neon: repository }),
    cache,
    onChanged,
    now,
  });
  return { repository, service, cache, onChanged, now };
}
describe("feature administration", () => {
  it.each(["tenant_sha256_v1", "principal_fnv1a_v2"] as const)(
    "evaluates persisted %s assignments",
    async (cohortStrategy) => {
      const { service } = fixture({
        ...definition,
        cohortStrategy,
        rolloutPct: 50,
      });
      for (let i = 0; i < 20; i++) {
        const c = { ...context, principalId: `principal-${i}` };
        expect((await service.evaluate(c, definition.code)).enabled).toBe(
          featurePercentageCohort(
            cohortStrategy,
            c.tenantId,
            c.principalId,
            definition.code,
          ) < 50,
        );
      }
    },
  );
  it.each(["tenant_sha256_v1", "principal_fnv1a_v2"] as const)(
    "preserves scheduled override and kill-switch gates with %s",
    async (cohortStrategy) => {
      const flag = { ...definition, cohortStrategy, rolloutPct: 0 };
      const active = fixture(flag, {
        ...override,
        effectiveFrom: "2026-06-01T00:00:00Z",
        effectiveUntil: "2026-07-01T00:00:00Z",
      });
      expect(
        (await active.service.evaluate(context, definition.code)).enabled,
      ).toBe(true);
      active.now.mockReturnValue(new Date("2026-07-01T00:00:00Z"));
      expect(
        (await active.service.evaluate(context, definition.code)).enabled,
      ).toBe(false);
      expect(
        (
          await fixture(
            { ...flag, kind: "kill_switch" },
            override,
          ).service.evaluate(context, definition.code)
        ).enabled,
      ).toBe(false);
      expect(
        (
          await fixture(
            { ...flag, kind: "kill_switch", rolloutPct: 100 },
            { ...override, enabled: false },
          ).service.evaluate(context, definition.code)
        ).enabled,
      ).toBe(false);
    },
  );
  it.each([0, 100])("respects rollout boundary %s", async (rolloutPct) => {
    const { service } = fixture({ ...definition, rolloutPct });
    expect((await service.evaluate(context, definition.code)).enabled).toBe(
      rolloutPct === 100,
    );
  });
  it("uses the same stable tenant/principal/code bucket and one evaluation instant", async () => {
    const { service, repository, now } = fixture({
      ...definition,
      rolloutPct: 50,
    });
    const values = [];
    for (let i = 0; i < 100; i++) {
      const c = { ...context, principalId: `principal-${i}` };
      const first = await service.evaluate(c, definition.code),
        second = await service.evaluate(c, definition.code);
      expect(first).toEqual(second);
      expect(first.enabled).toBe(
        stablePercentageCohort(
          `${c.tenantId}:${c.principalId}:${definition.code}`,
        ) < 50,
      );
      values.push(first.enabled);
    }
    expect(new Set(values).size).toBe(2);
    expect(now).toHaveBeenCalledTimes(200);
    expect(repository.getOverride).toHaveBeenCalledWith(
      context.tenantId,
      definition.id,
      "2026-06-01T00:00:00.000Z",
    );
  });
  it.each([
    { status: "retired" as const },
    { effectiveFrom: "2027-01-01T00:00:00Z" },
    { effectiveUntil: "2026-06-01T00:00:00Z" },
  ])("catalog gates override activation: %j", async (fields) => {
    const { service, repository } = fixture(
      { ...definition, ...fields },
      override,
    );
    expect(await service.evaluate(context, definition.code)).toMatchObject({
      enabled: false,
      source: "catalog",
    });
    expect(repository.getOverride).not.toHaveBeenCalled();
  });
  it.each([
    { status: "expired" as const },
    { effectiveFrom: "2027-01-01T00:00:00Z" },
    { effectiveUntil: "2026-06-01T00:00:00Z" },
  ])("ignores ineffective override %j", async (fields) => {
    const { service } = fixture(
      { ...definition, defaultEnabled: false },
      { ...override, ...fields },
    );
    expect(await service.evaluate(context, definition.code)).toMatchObject({
      enabled: false,
      source: "catalog",
    });
  });
  it.each([true, false])("honors explicit override %s", async (enabled) => {
    const { service } = fixture(
      { ...definition, defaultEnabled: !enabled, rolloutPct: 0 },
      { ...override, enabled },
    );
    expect(await service.evaluate(context, definition.code)).toMatchObject({
      enabled,
      source: "tenant_override",
    });
  });
  it("cannot enable a globally disabled kill switch", async () => {
    const { service } = fixture(
      { ...definition, kind: "kill_switch", defaultEnabled: false },
      override,
    );
    expect(await service.evaluate(context, definition.code)).toMatchObject({
      enabled: false,
      source: "catalog",
    });
  });
  it.each([{ tenantId: "foreign" }, { featureFlagId: "other" }])(
    "rejects repository scope mismatch %j",
    async (fields) => {
      await expect(
        fixture(definition, { ...override, ...fields }).service.evaluate(
          context,
          definition.code,
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
    },
  );
  it.each([
    { enabled: "false" },
    { enabled: null },
    { reason: " " },
    { reason: "x".repeat(2001) },
    { effectiveFrom: "bad" },
    { effectiveUntil: "" },
    { effectiveUntil: null },
    { effectiveUntil: definition.effectiveFrom },
    { expectedVersion: undefined },
    { expectedVersion: -1 },
    { expectedVersion: 0.5 },
    { expectedVersion: Number.MAX_SAFE_INTEGER + 1 },
    { expectedVersion: 1 },
    { tenantId: "forged" },
    { status: "expired" },
  ])("rejects invalid mutation %j", async (fields) => {
    const { service, repository, cache } = fixture();
    await expect(
      service.saveOverride({ ...command, ...fields } as never),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.saveOverride).not.toHaveBeenCalled();
    expect(cache.invalidate).not.toHaveBeenCalled();
  });
  it("stamps verified ownership and invalidates only after persistence", async () => {
    const { service, repository, cache, onChanged } = fixture();
    await service.saveOverride(command);
    expect(repository.saveOverride).toHaveBeenCalledWith(
      {
        tenantId: context.tenantId,
        featureFlagId: definition.id,
        enabled: true,
        reason: "Pilot",
        effectiveFrom: definition.effectiveFrom,
        expectedVersion: 0,
      },
      context.principalId,
    );
    expect(onChanged).toHaveBeenCalledWith(context);
    expect(cache.invalidate).toHaveBeenCalledWith({
      namespace: "features",
      tenantId: context.tenantId,
      keys: [definition.code],
    });
    repository.saveOverride.mockRejectedValueOnce(
      new Error("transaction failed"),
    );
    await expect(service.saveOverride(command)).rejects.toThrow(
      "transaction failed",
    );
    expect(cache.invalidate).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, 0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    "requires a positive expiration version %s",
    async (value) => {
      const f = fixture();
      await expect(
        f.service.expireOverride(context, "override-1", value as number),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(f.repository.expireOverride).not.toHaveBeenCalled();
    },
  );
});

it('uses an atomic definition/override snapshot without mixing separate reads',async()=>{
 const f=fixture();const readEvaluation=vi.fn(async()=>({definition:{...definition,status:'retired' as const},override}));Object.assign(f.repository,{readEvaluation});
 await expect(f.service.evaluate(context,definition.code)).resolves.toMatchObject({enabled:false,source:'catalog'});expect(readEvaluation).toHaveBeenCalledWith(context.tenantId,definition.code,'2026-06-01T00:00:00.000Z');expect(f.repository.getDefinition).not.toHaveBeenCalled();expect(f.repository.getOverride).not.toHaveBeenCalled();
});
it('does not fall back to a separate definition read when the atomic snapshot is absent',async()=>{const f=fixture();Object.assign(f.repository,{readEvaluation:async()=>undefined});await expect(f.service.evaluate(context,definition.code)).rejects.toMatchObject({statusCode:404});expect(f.repository.getDefinition).not.toHaveBeenCalled();});
