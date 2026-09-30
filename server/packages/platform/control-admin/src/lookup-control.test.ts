import { describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  LookupDesiredState,
  LookupDomainRevision,
  LookupRepository,
} from "@athyper/server-contract-control-admin";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { createLookupService } from "./lookup-control.js";

export const context = {
  tenantId: "tenant-1",
  principalId: "actor-1",
  planeKey: "neon",
} as VerifiedRequestContext;
export const domain: LookupDomainRevision = {
  id: "domain-1",
  version: 1,
  code: "reason",
  name: "Reason",
  sourceSchema: "control",
  extensible: true,
  status: "active",
  values: [
    {
      id: "global",
      code: "global",
      name: "Global",
      sortOrder: 0,
      metadata: {},
      status: "active",
    },
    {
      id: "tenant",
      code: "custom",
      name: "Custom",
      tenantId: "tenant-1",
      sortOrder: 1,
      metadata: {},
      status: "active",
    },
    {
      id: "foreign",
      code: "foreign",
      name: "Other",
      tenantId: "tenant-2",
      sortOrder: 2,
      metadata: {},
      status: "active",
    },
  ],
};
export const state: LookupDesiredState = {
  desiredStateId: "receipt-1",
  targetPlane: "neon",
  sourceRevision: 1,
  domain: { ...domain, values: [domain.values[0]!] },
};
const retirement = {
  domainCode: domain.code,
  valueCode: "custom",
  tenantId: context.tenantId,
  expectedVersion: 1,
};
function fixture(value = domain, denied = false) {
  const repo = {
    getDomain: vi.fn(async () => value),
    listDomains: vi.fn(async () => [value]),
    publishDesiredState: vi.fn(async (s: LookupDesiredState) => s.domain),
    isValueReferenced: vi.fn(async () => false),
    retireValue: vi.fn(async () => ({
      ...value,
      version: 2,
      values: value.values.map((v) =>
        v.tenantId === context.tenantId
          ? { ...v, status: "retired" as const }
          : v,
      ),
    })),
  } satisfies LookupRepository;
  const authorizer = {
      authorize: vi.fn(async () =>
        denied
          ? { allowed: false as const, reason: "denied" }
          : { allowed: true as const },
      ),
    },
    cache = { invalidate: vi.fn(async () => {}) };
  const service = createLookupService({
    authorizer,
    repositories: createExactPlaneRepositoryProvider({ neon: repo }),
    cache,
  });
  return { repo, authorizer, cache, service };
}
describe("lookup control", () => {
  it("scopes current, historical and list reads to the verified tenant and filters foreign values", async () => {
    const f = fixture();
    expect((await f.service.list(context))[0]!.values.map((v) => v.id)).toEqual(
      ["global", "tenant"],
    );
    expect(
      (await f.service.read(context, "reason", 1)).values.map((v) => v.id),
    ).toEqual(["global", "tenant"]);
    expect(f.repo.listDomains).toHaveBeenCalledWith(context.tenantId);
    expect(f.repo.getDomain).toHaveBeenCalledWith(
      "reason",
      1,
      context.tenantId,
    );
    await expect(f.service.read(context, "reason", 2)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1"])(
    "rejects invalid read version %s",
    async (version) => {
      const f = fixture();
      await expect(
        f.service.read(context, "reason", version as number),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(f.repo.getDomain).not.toHaveBeenCalled();
    },
  );
  it("authorizes before reading domain ownership", async () => {
    const f = fixture(domain, true);
    await expect(
      f.service.retireValue(context, retirement),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(f.repo.getDomain).not.toHaveBeenCalled();
    expect(f.authorizer.authorize).toHaveBeenCalledWith({
      context,
      permissionCode: "control.tenant_override.manage",
    });
  });
  it.each([undefined, "tenant-2"])(
    "rejects missing or forged tenant %s",
    async (tenantId) => {
      const f = fixture();
      await expect(
        f.service.retireValue(context, { ...retirement, tenantId }),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(f.repo.getDomain).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, 0, -1, 1.5, "1"])(
    "requires positive retirement revision %s",
    async (expectedVersion) => {
      const f = fixture();
      await expect(
        f.service.retireValue(context, {
          ...retirement,
          expectedVersion: expectedVersion as number,
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(f.repo.retireValue).not.toHaveBeenCalled();
    },
  );
  it.each(["global", "foreign", "missing"])(
    "cannot retire %s as a tenant-owned value",
    async (valueCode) => {
      const f = fixture();
      await expect(
        f.service.retireValue(context, { ...retirement, valueCode }),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(f.repo.retireValue).not.toHaveBeenCalled();
    },
  );
  it.each([
    { extensible: false },
    { status: "retired" as const },
    { version: 2 },
  ])("rejects invalid retirement lifecycle/version %j", async (fields) => {
    const f = fixture({ ...domain, ...fields });
    await expect(
      f.service.retireValue(context, retirement),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(f.repo.retireValue).not.toHaveBeenCalled();
  });
  it("rejects referenced values and leaves cache unchanged", async () => {
    const f = fixture();
    f.repo.isValueReferenced.mockResolvedValue(true);
    await expect(
      f.service.retireValue(context, retirement),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "CONTROL_ADMIN_REFERENCE_IN_USE",
    });
    expect(f.repo.isValueReferenced).toHaveBeenCalledWith(
      "reason",
      "custom",
      "tenant-1",
    );
    expect(f.repo.retireValue).not.toHaveBeenCalled();
    expect(f.cache.invalidate).not.toHaveBeenCalled();
  });
  it("retires with actor and revision, then invalidates the tenant domain", async () => {
    const f = fixture();
    const saved = await f.service.retireValue(context, retirement);
    expect(saved.values.find((v) => v.id === "tenant")?.status).toBe("retired");
    expect(f.repo.retireValue).toHaveBeenCalledWith(
      retirement,
      context.principalId,
    );
    expect(f.cache.invalidate).toHaveBeenCalledWith({
      namespace: "lookups",
      tenantId: "tenant-1",
      keys: ["reason"],
    });
  });
  it("does not rewrite an already retired value at its current revision", async () => {
    const f = fixture({
      ...domain,
      values: domain.values.map((v) => ({ ...v, status: "retired" as const })),
    });
    await f.service.retireValue(context, retirement);
    expect(f.repo.retireValue).not.toHaveBeenCalled();
    expect(f.cache.invalidate).not.toHaveBeenCalled();
  });
  it("does not invalidate after a repository transaction fails", async () => {
    const f = fixture();
    f.repo.retireValue.mockRejectedValue(new Error("transaction rolled back"));
    await expect(f.service.retireValue(context, retirement)).rejects.toThrow(
      "transaction rolled back",
    );
    expect(f.cache.invalidate).not.toHaveBeenCalled();
    f.repo.publishDesiredState.mockRejectedValue(
      new Error("publication rolled back"),
    );
    await expect(f.service.applyDesiredState(context, state)).rejects.toThrow(
      "publication rolled back",
    );
    expect(f.cache.invalidate).not.toHaveBeenCalled();
  });
  it("applies exact-plane global state with the verified actor and global invalidation", async () => {
    const f = fixture();
    await expect(f.service.applyDesiredState(context, state)).resolves.toEqual(
      state.domain,
    );
    expect(f.repo.publishDesiredState).toHaveBeenCalledWith(
      state,
      context.principalId,
      context.tenantId,
    );
    expect(f.cache.invalidate).toHaveBeenCalledWith({
      namespace: "lookups",
      keys: ["reason"],
    });
  });
  it.each([
    { sourceRevision: 0 },
    { sourceRevision: 1.5 },
    { sourceRevision: Number.MAX_SAFE_INTEGER + 1 },
    { domain: { ...state.domain, version: 0 } },
    { domain: { ...state.domain, code: "Bad code" } },
    { domain: { ...state.domain, sourceSchema: "control; DROP TABLE x" } },
    {
      domain: {
        ...state.domain,
        values: [state.domain.values[0], state.domain.values[0]],
      },
    },
    {
      domain: {
        ...state.domain,
        values: [
          state.domain.values[0],
          { ...state.domain.values[0], code: "other" },
        ],
      },
    },
    {
      domain: {
        ...state.domain,
        values: [{ ...state.domain.values[0], sortOrder: 32768 }],
      },
    },
    {
      domain: {
        ...state.domain,
        values: [{ ...state.domain.values[0], metadata: { bad: Infinity } }],
      },
    },
    {
      domain: {
        ...state.domain,
        values: [{ ...state.domain.values[0], metadata: { bad: undefined } }],
      },
    },
    { extra: true },
  ])("rejects invalid desired state %j", async (fields) => {
    const f = fixture();
    await expect(
      f.service.applyDesiredState(context, {
        ...state,
        ...fields,
      } as LookupDesiredState),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(f.repo.publishDesiredState).not.toHaveBeenCalled();
  });
  it.each([
    { targetPlane: "mesh" },
    { domain: { ...state.domain, values: [domain.values[1]] } },
  ])("rejects target/tenant publication mismatch %j", async (fields) => {
    const f = fixture();
    await expect(
      f.service.applyDesiredState(context, {
        ...state,
        ...fields,
      } as LookupDesiredState),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(f.repo.publishDesiredState).not.toHaveBeenCalled();
  });
  it("maps missing exact-plane repositories to 503", async () => {
    await expect(
      fixture().service.list({ ...context, planeKey: "mesh" }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});

it('rejects sparse metadata arrays instead of serializing holes as null',async()=>{
 const f=fixture();await expect(f.service.applyDesiredState(context,{...state,domain:{...state.domain,values:[{...state.domain.values[0]!,metadata:{sparse:new Array(2)}}]}})).rejects.toMatchObject({statusCode:400});
});
