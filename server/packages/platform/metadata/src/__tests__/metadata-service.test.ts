import { describe, expect, it, vi } from "vitest";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { createInMemoryDescriptorCache, createInMemoryGenerationCheckpoint, createMetadataGenerationHandler, createMetadataService, parseEntityRuntimeDescriptor } from "../index.js";

const descriptor: EntityRuntimeDescriptor = { schema: "athyper.entity-runtime-descriptor/1.0", entityCode: "business_partner", planeKey: "neon", releaseId: "release-1", releaseNo: 1, contractHash: "a".repeat(64), compiledHash: "b".repeat(64), storage: { schema: "master", object: "business_partner", idField: "id", tenantField: "tenant_id", versionField: "row_version", statusField: "status" }, fields: [{ key: "name", storagePath: "name", type: "string", required: true, writableOn: ["create", "patch"], searchable: true }], operations: { read: { code: "read", permissionCode: "master.business_partner.read" } } };
const context = { planeKey: "neon", realmKey: "athyper", tenantId: "tenant-1", principalId: "principal-1", authEpoch: 1, profileHash: "profile", requestId: "request-1", permissions: { planeKey: "neon", tenantId: "tenant-1", principalId: "principal-1", principalFingerprint: "fp", profileHash: "profile", schemaHash: "schema", resolvedAt: 1, allowed: [], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] } } as const;

describe("metadata service", () => {
  it("reads a plane-local descriptor once and caches it", async () => {
    const findActive = vi.fn(async () => descriptor);
    const service = createMetadataService({ repository: { findActive }, cache: createInMemoryDescriptorCache() });
    await expect(service.getEntityDescriptor(context, "business_partner")).resolves.toBe(descriptor);
    await expect(service.getEntityDescriptor(context, "business_partner")).resolves.toBe(descriptor);
    expect(findActive).toHaveBeenCalledOnce();
  });

  it("parses the authoritative runtime projection envelope", () => {
    expect(parseEntityRuntimeDescriptor({ entity_code: descriptor.entityCode, release_id: descriptor.releaseId, release_no: 1, entity_contract_hash: descriptor.contractHash, plane_code: descriptor.planeKey, compiled_hash: descriptor.compiledHash, compiled_json: descriptor })).toEqual(descriptor);
  });

  it("parses revision-pinned policy bindings from Entity Meta", () => {
    const policyBinding = { key: "supplier_activation", policyDefinitionId: "33333333-3333-4333-8333-333333333333", policyVersionNo: 3, stage: "precondition", enforcement: "enforce", priority: 20, operationCode: "activate", inputMapping: { risk: "payload.risk" } } as const;
    const compiled = { ...descriptor, policyBindings: [policyBinding] };
    expect(parseEntityRuntimeDescriptor({ entity_code: descriptor.entityCode, release_id: descriptor.releaseId, release_no: 1, entity_contract_hash: descriptor.contractHash, plane_code: descriptor.planeKey, compiled_hash: descriptor.compiledHash, compiled_json: compiled }).policyBindings).toEqual([policyBinding]);
  });

  it("rejects an unpinned policy binding", () => {
    const compiled = { ...descriptor, policyBindings: [{ key: "supplier_activation", policyDefinitionId: "33333333-3333-4333-8333-333333333333", policyVersionNo: 0, stage: "precondition", enforcement: "enforce", priority: 20, inputMapping: {} }] };
    expect(() => parseEntityRuntimeDescriptor({ entity_code: descriptor.entityCode, release_id: descriptor.releaseId, release_no: 1, entity_contract_hash: descriptor.contractHash, plane_code: descriptor.planeKey, compiled_hash: descriptor.compiledHash, compiled_json: compiled })).toThrow("Invalid policy version");
  });
});

describe("metadata generation events", () => {
  it("invalidates once for each newer durable generation", async () => {
    const cache = createInMemoryDescriptorCache();
    const coordinate = { planeKey: "neon" as const, tenantId: "tenant-1", principalId: "reader", entityCode: "invoice" };
    await cache.set(coordinate, null, 60_000);
    const handle = createMetadataGenerationHandler({ cache, checkpoint: createInMemoryGenerationCheckpoint() });
    const event = { eventId: "event-1", planeKey: "neon" as const, tenantId: "tenant-1", entityCode: "invoice", generation: 2, releaseId: "release-2" };
    expect(await handle(event)).toBe(true);
    expect(await cache.get(coordinate)).toBeUndefined();
    expect(await handle(event)).toBe(false);
  });
});
