import { expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityScopeAdapter } from "@athyper/server-service-records";
import { createEntityScopeRegistry } from "../shared/entity-runtime/scope-registry.js";

const operation = { key: "read", permissionCode: "reference.record.read",
  scope: "organization.record.v1", target: "existing", effect: "read",
  requiresParentRead: false, requiresPreflight: true } as const;
const profile = { entityCode: "reference_record", planeKey: "neon", operations: [operation] } as const;
const input = { context: { tenantId: "tenant", principalId: "principal", planeKey: "neon" } as VerifiedRequestContext,
  entityCode: profile.entityCode, resolver: operation.scope, target: operation.target,
  operationKey: "read", phase: "execute", recordId: "record",
  coordinates: { operatingOrganizationId: "caller-org" } } as const;
function fixture() {
  const resolve = vi.fn<EntityScopeAdapter["resolve"]>(async () => ({
    state: "resolved", coordinates: { operatingOrganizationId: "stored-org" },
  }));
  const preflight = vi.fn<EntityScopeAdapter["preflight"]>(async () => "workflow_blocked");
  const binding = { planeKey: profile.planeKey, entityCode: profile.entityCode,
    operationKey: "read", resolver: operation.scope, target: operation.target,
    adapter: { resolve, preflight } };
  return { resolve, preflight, binding, registry: createEntityScopeRegistry(profile, [binding]) };
}
it("rejects absent bindings rather than echoing caller ownership", async () => {
  const registry = createEntityScopeRegistry(profile, []);
  expect(await registry.resolve(input)).toEqual({ state: "invalid" });
  expect(await registry.preflight(input)).toBe("workflow_blocked");
});
it("delegates exact input to the owner and preserves persisted coordinates and denial", async () => {
  const f = fixture();
  expect(await f.registry.resolve(input)).toEqual({ state: "resolved", coordinates: { operatingOrganizationId: "stored-org" } });
  expect(f.resolve).toHaveBeenCalledWith(input);
  expect(await f.registry.preflight(input)).toBe("workflow_blocked");
});
it("rejects mismatched plane, entity, operation, resolver and target before accessing storage", async () => {
  const f = fixture();
  for (const changed of [
    { ...input, context: { ...input.context, planeKey: "mesh" as const } },
    { ...input, entityCode: "other" },
    { ...input, operationKey: "write" },
    { ...input, resolver: "tenant.record.v1" as const },
    { ...input, target: "proposed" as const },
  ]) expect(await f.registry.resolve(changed)).toEqual({ state: "invalid" });
  expect(f.resolve).not.toHaveBeenCalled();
  expect(await f.registry.preflight({ ...input, operationKey: "write" })).toBe("workflow_blocked");
  expect(f.preflight).not.toHaveBeenCalled();
});
it("propagates storage failure and rejects duplicate registrations", async () => {
  const f = fixture();
  f.resolve.mockRejectedValueOnce(Error("storage unavailable"));
  await expect(f.registry.resolve(input)).rejects.toThrow("storage unavailable");
  expect(() => createEntityScopeRegistry(profile, [f.binding, f.binding])).toThrow("ENTITY_SCOPE_BINDING_INVALID");
});
