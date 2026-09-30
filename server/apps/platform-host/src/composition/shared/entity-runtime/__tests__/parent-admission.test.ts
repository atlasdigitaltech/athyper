import { expect, it, vi } from "vitest";
import type { EntityCapabilityRequest } from "@athyper/server-platform-experience";
import { createEntityParentAdmission } from "../parent-admission.js";
const input = { context: { planeKey: "neon", tenantId: "tenant" }, entityCode: "reference_record",
  recordId: "record", kind: "comments", action: "read" } as EntityCapabilityRequest;
it("rejects unregistered parents before reading", async () => {
  const read = vi.fn(async () => true);
  expect(await createEntityParentAdmission({ bindings: [], read })(input)).toBe(false);
  expect(read).not.toHaveBeenCalled();
});
it("requires parent read before loading scope resources", async () => {
  const resolve = vi.fn(async () => [{ operatingOrganizationId: "stored-org" }]);
  const read = vi.fn(async () => false);
  const admit = createEntityParentAdmission({ read, bindings: [{ planeKey: "neon", entityCode: "reference_record", resolve }] });
  expect(await admit(input)).toBe(false); expect(resolve).not.toHaveBeenCalled();
  read.mockResolvedValue(true);
  expect(await admit(input)).toEqual({ scopeResources: [{ operatingOrganizationId: "stored-org" }] });
});
it.each([{ resources: null }, { resources: [] }, { resources: [{}] }, { resources: [{ tenantId: "other" }] }])("rejects absent, empty or cross-tenant scope candidates", async ({ resources }) => {
  const admit = createEntityParentAdmission({ read: async () => true,
    bindings: [{ planeKey: "neon", entityCode: "reference_record", resolve: async () => resources }] });
  expect(await admit(input)).toBe(false);
});
it("rejects wrong planes and duplicate bindings", async () => {
  const binding = { planeKey: "neon" as const, entityCode: "reference_record", resolve: vi.fn(async () => [{ tenantId: "tenant" }]) };
  const admit = createEntityParentAdmission({ read: async () => true, bindings: [binding] });
  expect(await admit({ ...input, context: { ...input.context, planeKey: "mesh" } })).toBe(false);
  expect(binding.resolve).not.toHaveBeenCalled();
  expect(() => createEntityParentAdmission({ read: async () => true, bindings: [binding, binding] })).toThrow("ENTITY_PARENT_SCOPE_BINDING_INVALID");
});
