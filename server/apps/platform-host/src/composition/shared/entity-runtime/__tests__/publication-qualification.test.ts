import { describe, expect, it, vi } from "vitest";
import type { EntityAuthorizationRuntimeRegistration } from "@athyper/server-contract-metadata";
import { createPublicationRuntimeQualification } from "../publication-qualification.js";

function fixture() {
  const operations = [
    { key: "list", permissionCode: "common.platform.reference.view", scope: "tenant.record.v1", target: "collection", effect: "read", requiresParentRead: false, requiresPreflight: false },
    { key: "read", permissionCode: "common.platform.reference.view", scope: "tenant.record.v1", target: "existing", effect: "read", requiresParentRead: false, requiresPreflight: false },
  ] as const;
  const profile = {
    schemaVersion: 1, entityCode: "country", planeKey: "neon",
    ownership: "tenant.record.v1",
    directory: { operation: "list", population: "tenant" },
    recordReadOperation: "read", operations,
    fieldPolicies: [], surfaces: [], relationships: [],
  };
  const invoke = vi.fn(), resolve = vi.fn();
  const registrations: EntityAuthorizationRuntimeRegistration[] = operations.map(operation => ({
    planeKey: "neon", entityCode: "country", operation,
    handler: { key: `entity.record.${operation.key}.v1`, invoke },
    resolver: { key: operation.scope, resolve },
  }));
  const bindings = {
    schemaVersion: 1, runtimeVersion: "entity-authorization.v1",
    bindings: registrations.map(entry => ({
      operation: entry.operation.key, handler: entry.handler.key, resolver: entry.resolver.key,
    })),
  };
  return { profile, bindings, registrations, invoke, resolve };
}

describe("publication runtime qualification", () => {
  it("does not accept artifact declarations as callable availability", () => {
    const f = fixture();
    expect(() => createPublicationRuntimeQualification({}).qualify(f.profile, f.bindings))
      .toThrow("Unqualified authorization runtime binding");
  });

  it("qualifies exact host registrations without invoking handlers or resolvers", () => {
    const f = fixture();
    expect(() => createPublicationRuntimeQualification(f).qualify(f.profile, f.bindings)).not.toThrow();
    expect(f.invoke).not.toHaveBeenCalled();
    expect(f.resolve).not.toHaveBeenCalled();
  });

  it("rejects changed permissions, plane, or incomplete registration coverage", () => {
    const f = fixture(), registry = createPublicationRuntimeQualification(f);
    expect(() => registry.qualify({ ...f.profile, planeKey: "mesh" }, f.bindings)).toThrow();
    expect(() => registry.qualify({
      ...f.profile,
      operations: f.profile.operations.map(operation => ({ ...operation, permissionCode: "other.permission" })),
    }, f.bindings)).toThrow();
    expect(() => createPublicationRuntimeQualification({
      registrations: f.registrations.slice(1),
    }).qualify(f.profile, f.bindings)).toThrow("Unqualified authorization runtime binding");
  });

  it("rejects duplicate host registrations", () => {
    const f = fixture();
    expect(() => createPublicationRuntimeQualification({
      registrations: [...f.registrations, ...f.registrations],
    })).toThrow("Invalid or duplicate callable authorization registration");
  });
});
