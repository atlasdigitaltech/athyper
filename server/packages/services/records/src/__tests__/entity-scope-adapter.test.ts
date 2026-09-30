import { expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createStoredEntityScopeAdapter } from "../entity-scope-adapter.js";

const input = {
  context: { tenantId: "tenant" } as VerifiedRequestContext,
  entityCode: "invoice",
  recordId: "record",
  resolver: "company.record.v1" as const,
  target: "existing" as const,
  operationKey: "read",
  phase: "execute" as const,
};
const evidence = {
  tenantId: "tenant",
  entityCode: "invoice",
  recordId: "record",
  resolver: "company.record.v1" as const,
  coordinates: { companyCodeId: "company" },
};
it("rejects ownership evidence for a different tenant, record, entity or resolver", async () => {
  for (const mismatch of [
    { tenantId: "other" },
    { entityCode: "other" },
    { recordId: "other" },
    { resolver: "tenant.record.v1" as const },
  ]) {
    const adapter = createStoredEntityScopeAdapter({
      readOwnership: async () => ({ ...evidence, ...mismatch }),
      validateSelection: async () => true,
      preflight: async () => "allowed",
    });
    expect(await adapter.resolve(input)).toEqual({ state: "invalid" });
  }
});
it("resolves existing ownership from storage and validates proposed targets without requiring them to exist", async () => {
  const readOwnership = vi.fn(async () => evidence),
    validateSelection = vi.fn(async () => true);
  const adapter = createStoredEntityScopeAdapter({
    readOwnership,
    validateSelection,
    preflight: async () => "allowed",
  });
  expect(await adapter.resolve(input)).toEqual({
    state: "resolved",
    coordinates: evidence.coordinates,
  });
  expect(
    await adapter.resolve({
      ...input,
      target: "proposed",
      coordinates: { companyCodeId: "new-company" },
    }),
  ).toEqual({
    state: "resolved",
    coordinates: { companyCodeId: "new-company" },
  });
  expect(readOwnership).toHaveBeenCalledTimes(1);
  expect(validateSelection).toHaveBeenCalledTimes(1);
});
it("rejects catalog selections denied by the owning service", async () => {
  const adapter = createStoredEntityScopeAdapter({
    readOwnership: async () => null,
    validateSelection: async () => false,
    preflight: async () => "allowed",
  });
  expect(
    await adapter.resolve({
      ...input,
      target: "proposed",
      coordinates: { companyCodeId: "unknown" },
    }),
  ).toEqual({ state: "invalid" });
});
