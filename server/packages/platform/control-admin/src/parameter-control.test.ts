import { describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  JsonValue,
  ParameterDefinition,
  ParameterRepository,
  TenantParameterValue,
} from "@athyper/server-contract-control-admin";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import {
  createParameterService,
  validateParameterValue,
} from "./parameter-control.js";
const context = {
  tenantId: "tenant-1",
  principalId: "actor-1",
  planeKey: "neon",
} as VerifiedRequestContext;
const definition: ParameterDefinition = {
  revision: 1,
  id: "p1",
  code: "ui.setting",
  valueType: "json",
  defaultValue: { default: true },
  tenantCanOverride: true,
  reloadMode: "next_request",
  cacheTtlSeconds: 300,
  status: "active",
};
const override: TenantParameterValue = {
  id: "v1",
  version: 1,
  tenantId: context.tenantId,
  parameterDefinitionId: definition.id,
  value: null,
  effectiveFrom: "2026-01-01T00:00:00Z",
  effectiveUntil: "2026-07-01T00:00:00Z",
  status: "active",
};
const command = {
  context,
  code: definition.code,
  value: null,
  effectiveFrom: override.effectiveFrom,
  expectedVersion: 0,
};
function fixture(
  d = definition,
  v: TenantParameterValue | undefined = override,
  denied = false,
) {
  const repo = {
    getDefinition: vi.fn(async () => d),
    listDefinitions: vi.fn(async () => [d]),
    getValue: vi.fn(async () => v),
    saveValue: vi.fn<ParameterRepository["saveValue"]>(async (input) => ({
      ...input,
      id: input.id ?? "v1",
      version: input.expectedVersion + 1,
      status: "active",
    })),
    expireValue: vi.fn<ParameterRepository["expireValue"]>(async () => ({
      ...override,
      status: "expired",
      version: 2,
    })),
  } satisfies ParameterRepository;
  const now = vi.fn(() => new Date("2026-06-01T00:00:00Z")),
    cache = { invalidate: vi.fn(async () => {}) };
  const service = createParameterService({
    authorizer: {
      authorize: async () =>
        denied ? { allowed: false, reason: "denied" } : { allowed: true },
    },
    repositories: createExactPlaneRepositoryProvider({ neon: repo }),
    cache,
    now,
  });
  return { repo, now, cache, service };
}
describe("typed parameter validation", () => {
  it.each([
    ["boolean", true],
    ["boolean", false],
    ["string", ""],
    ["string", "test"],
    ["integer", 0],
    ["integer", Number.MAX_SAFE_INTEGER],
    ["number", 0.5],
    ["number", -2.5],
    ["enum", "on"],
    ["enum", false],
    ["enum", 0],
    ["duration", "PT0S"],
    ["duration", "P2DT3H4M5.5S"],
    ["json", null],
    ["json", { nested: [1, false, null] }],
  ] as const)("accepts %s value %j", (valueType, value) => {
    expect(() =>
      validateParameterValue(
        {
          ...definition,
          valueType,
          ...(valueType === "enum" ? { allowedValues: ["on", false, 0] } : {}),
        },
        value as JsonValue,
      ),
    ).not.toThrow();
  });
  it.each([
    ["boolean", "false"],
    ["string", 0],
    ["integer", 0.5],
    ["integer", Number.MAX_SAFE_INTEGER + 1],
    ["number", NaN],
    ["number", Infinity],
    ["number", "1"],
    ["enum", "off"],
    ["enum", {}],
    ["duration", "P"],
    ["duration", "PT"],
    ["duration", "P1DT"],
    ["duration", "1h"],
    ["duration", "P1M"],
    ["json", undefined],
    ["json", { bad: undefined }],
    ["json", { bad: Infinity }],
    ["json", new Date()],
  ] as const)("rejects %s value %j", (valueType, value) => {
    expect(() =>
      validateParameterValue(
        {
          ...definition,
          valueType,
          ...(valueType === "enum" ? { allowedValues: ["on"] } : {}),
        },
        value as JsonValue,
      ),
    ).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
  it("rejects cyclic JSON, sparse arrays and empty enum catalogs", () => {
    const cycle: Record<string, unknown> = {};
    cycle["self"] = cycle;
    for (const value of [cycle, new Array(2)])
      expect(() =>
        validateParameterValue(definition, value as JsonValue),
      ).toThrow();
    expect(() =>
      validateParameterValue({ ...definition, valueType: "enum" }, "anything"),
    ).toThrow();
  });
  it("enforces inclusive bounds and rejects malformed bounds", () => {
    const d = {
      ...definition,
      valueType: "number" as const,
      minValue: 1,
      maxValue: 2,
    };
    for (const v of [1, 2])
      expect(() => validateParameterValue(d, v)).not.toThrow();
    for (const v of [0, 3])
      expect(() => validateParameterValue(d, v)).toThrow();
    for (const fields of [
      { minValue: NaN },
      { maxValue: Infinity },
      { minValue: 3 },
    ])
      expect(() => validateParameterValue({ ...d, ...fields }, 1)).toThrow();
  });
  it("compares allowed JSON values structurally without coercing types", () => {
    expect(() =>
      validateParameterValue(
        { ...definition, allowedValues: [{ a: 1, b: [false, null] }] },
        { b: [false, null], a: 1 },
      ),
    ).not.toThrow();
    expect(() =>
      validateParameterValue({ ...definition, allowedValues: [1] }, "1"),
    ).toThrow();
  });
});
describe("parameter administration", () => {
  it("changes the configuration token for definition-only updates and override boundaries", async () => {
    const f = fixture();
    const first = await f.service.resolve(context, definition.code);
    f.repo.getDefinition.mockResolvedValue({
      ...definition,
      revision: 2,
      reloadMode: "restart",
    });
    const changed = await f.service.resolve(context, definition.code);
    expect(changed.configurationRevision).not.toBe(first.configurationRevision);
    expect(changed.value).toBe(first.value);
    f.now.mockReturnValue(new Date(override.effectiveUntil!));
    expect(
      (await f.service.resolve(context, definition.code)).configurationRevision,
    ).not.toBe(changed.configurationRevision);
    const other = fixture({ ...definition, tenantCanOverride: false });
    const before = await other.service.resolve(context, definition.code);
    other.repo.getDefinition.mockResolvedValue({
      ...definition,
      tenantCanOverride: false,
      revision: 2,
      defaultValue: "new",
    });
    expect(
      (await other.service.resolve(context, definition.code))
        .configurationRevision,
    ).not.toBe(before.configurationRevision);
  });

  it.each([null, false, 0, ""])(
    "preserves explicit override %j",
    async (value) => {
      const f = fixture(definition, { ...override, value });
      expect(await f.service.resolve(context, definition.code)).toMatchObject({
        value,
        source: "tenant_override",
        reloadMode: "next_request",
        cacheTtlSeconds: 300,
      });
      expect(f.now).toHaveBeenCalledOnce();
      expect(f.repo.getValue).toHaveBeenCalledWith(
        context.tenantId,
        definition.id,
        "2026-06-01T00:00:00.000Z",
      );
    },
  );
  it.each([
    { status: "expired" as const },
    { effectiveFrom: "2026-07-01T00:00:00Z" },
    { effectiveUntil: "2026-06-01T00:00:00Z" },
    { effectiveUntil: "invalid" },
  ])("ignores ineffective override %j", async (fields) => {
    expect(
      await fixture(definition, { ...override, ...fields }).service.resolve(
        context,
        definition.code,
      ),
    ).toMatchObject({ value: definition.defaultValue, source: "default" });
  });
  it("stops selecting old overrides when catalog override permission is removed", async () => {
    const f = fixture({ ...definition, tenantCanOverride: false });
    expect((await f.service.resolve(context, definition.code)).source).toBe(
      "default",
    );
    expect(f.repo.getValue).not.toHaveBeenCalled();
  });
  it.each([{ tenantId: "foreign" }, { parameterDefinitionId: "foreign" }])(
    "rejects repository scope mismatch %j",
    async (fields) => {
      await expect(
        fixture(definition, { ...override, ...fields }).service.resolve(
          context,
          definition.code,
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
    },
  );
  it("returns 503 for invalid stored values instead of resolving invalid settings", async () => {
    await expect(
      fixture(
        { ...definition, valueType: "boolean" },
        { ...override, value: "false" },
      ).service.resolve(context, definition.code),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
  it("attributes saves and expiration to verified context and invalidates after commit", async () => {
    const f = fixture();
    await f.service.saveValue({ ...command, reason: " reviewed " });
    expect(f.repo.saveValue).toHaveBeenCalledWith(
      {
        value: null,
        effectiveFrom: command.effectiveFrom,
        expectedVersion: 0,
        reason: "reviewed",
        tenantId: context.tenantId,
        parameterDefinitionId: definition.id,
      },
      context.principalId,
    );
    expect(f.cache.invalidate).toHaveBeenCalledWith({
      namespace: "parameters",
      tenantId: context.tenantId,
      keys: [definition.code],
    });
    await f.service.expireValue(context, "v1", 1);
    expect(f.repo.expireValue).toHaveBeenCalledWith(
      context.tenantId,
      "v1",
      1,
      context.principalId,
    );
  });
  it.each([
    { expectedVersion: undefined },
    { expectedVersion: 1 },
    { expectedVersion: -1 },
    { expectedVersion: 0.5 },
    { effectiveFrom: "bad" },
    { effectiveUntil: null },
    { effectiveUntil: "" },
    { effectiveUntil: override.effectiveFrom },
    { reason: " " },
    { tenantId: "forged" },
  ])("rejects malformed save %j", async (fields) => {
    const f = fixture();
    await expect(
      f.service.saveValue({ ...command, ...fields } as typeof command),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(f.repo.saveValue).not.toHaveBeenCalled();
  });
  it("rejects retired definitions and disallowed overrides", async () => {
    await expect(
      fixture({ ...definition, status: "retired" }).service.saveValue(command),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      fixture({ ...definition, tenantCanOverride: false }).service.saveValue(
        command,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it("authorizes before repository access and maps unavailable planes", async () => {
    const f = fixture(definition, override, true);
    await expect(f.service.saveValue(command)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(f.repo.getDefinition).not.toHaveBeenCalled();
    await expect(
      fixture().service.list({ ...context, planeKey: "mesh" }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
  it("does not invalidate after save or expiration failure", async () => {
    const f = fixture();
    f.repo.saveValue.mockRejectedValue(new Error("rollback"));
    f.repo.expireValue.mockRejectedValue(new Error("rollback"));
    await expect(f.service.saveValue(command)).rejects.toThrow("rollback");
    await expect(f.service.expireValue(context, "v1", 1)).rejects.toThrow(
      "rollback",
    );
    expect(f.cache.invalidate).not.toHaveBeenCalled();
  });
});
