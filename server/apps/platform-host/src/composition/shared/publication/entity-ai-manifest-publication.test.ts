import { resolveSourcePath } from "../../../../../../../tooling/scripts/metadata/source-workspace.mjs";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { canonicalBytes, sha256 } from "@athyper/server-adapter-publication-signing";
import { compileGraph, compileSharedReferenceProduct, parseSharedReferenceProduct,
  compileTableEntityProduct, parseTableEntityProduct } from "@athyper/server-plane-studio-meta-entity-authoring";
import { compileCompiledEntityArtifacts, lowerNativeRuntimePublication } from "@athyper/server-service-publication";
import { compileRuntimePublication, qualifyRuntimePublication } from "../../../../../../packages/services/publication/src/compilation/compiled-runtime.js";
import { parseCompiledRuntimeContract } from "@athyper/server-platform-metadata";
import { resolveAtlasEntityToolManifest } from "@athyper/server-platform-ai";
import type { CompiledEntityRegistry, PublicationPlane } from "@athyper/server-contract-publication";
const id = "00000000-0000-4000-8000-000000000001";
const source = (entity: string) => JSON.parse(readFileSync(resolveSourcePath(new URL(`../../../../../../../metadata/entities/${entity}/definition.json`, import.meta.url)), "utf8"));
const canonicalizer = { canonicalBytes, sha256: (bytes: Uint8Array) => `sha256:${sha256(bytes)}` };
function compile(entity: "country" | "principal", plane: PublicationPlane, enroll = true) {
  const product = source(entity);
  if (!enroll) delete product.definition.ai;
  const graph = entity === "country" ? compileSharedReferenceProduct(parseSharedReferenceProduct(product), plane).graph
    : compileTableEntityProduct(parseTableEntityProduct(product), plane).graph;
  const saved = { ...graph,
    operationPermissions: graph.operationPermissions!.map((binding, i) => ({ ...binding, id: `00000000-0000-4000-8000-${String(10 + i).padStart(12, "0")}` })),
    operationScopeBindings: graph.operationScopeBindings!.map((binding, i) => ({ ...binding, id: `00000000-0000-4000-8000-${String(20 + i).padStart(12, "0")}` })),
  };
  const compiled = compileGraph(saved), profile = saved.runtimeProfiles![0]!;
  const permissionCodes = [...new Set(saved.operationPermissions!.map(binding => String(binding.permissionCode)))];
  const permissions = permissionCodes.map((code, i) => ({ id: `00000000-0000-4000-8000-${String(100 + i).padStart(12, "0")}`, code,
    kind: saved.operationPermissions!.find(binding => binding.permissionCode === code)!.permissionKind!,
    scopeKinds: ["tenant"] }));
  const runtimeSource = { releaseId: id, releaseNo: 1, publicationKey: `metadata.entity.${entity}`, plane, tenantId: null,
    entityCode: entity, revisionId: id, sourceEntityId: id, sourceReleaseHash: compiled.descriptorHash,
    sourceContractHash: compiled.contractHash, sourceDescriptorHash: compiled.descriptorHash,
    generatedAt: "2026-10-02T00:00:00.000Z", native: compiled.descriptor as unknown as Record<string, unknown>, contract: saved as unknown as Record<string, unknown> };
  const lowered = lowerNativeRuntimePublication(runtimeSource, {
    registration: { entityCode: entity, plane, storage: { schema: profile.storageSchema!, object: profile.storageObject!, idField: "id",
      ...(profile.tenantFieldKey ? { tenantField: profile.tenantFieldKey } : {}) }, columns: saved.fields.map(field => field.storagePath!),
      detailRouteTemplate: `/app/entity/${entity}/:recordId` }, permissions,
  });
  const registry: CompiledEntityRegistry = { resolveAiToolManifest: resolveAtlasEntityToolManifest, permissions: new Set(permissionCodes),
    handlers: new Set(["entity.record.list.v1", "entity.record.read.v1"]), renderers: new Set(), resolvers: new Set(["tenant.record.v1"]), evaluators: new Set() };
  const result = compileCompiledEntityArtifacts({ ...lowered, registry, canonicalizer });
  const runtime = result.artifacts.find(item => item.artifact.artifactType === "runtime_contract")!.artifact;
  return { result, runtime, descriptor: parseCompiledRuntimeContract(runtime, { releaseId: id, releaseNo: 1 }), compiled, lowered, registry, runtimeSource };
}
it.each(["studio", "neon", "mesh"] as const)("%s: Country AI round-trips through the signed-artifact compiler with exact manifest requirements", plane => {
  const first = compile("country", plane), repeated = compile("country", plane);
  expect(first.result.releaseDocument).toEqual(repeated.result.releaseDocument);
  expect(first.descriptor.ai).toEqual(first.compiled.descriptor.ai);
  expect(first.descriptor.aiManifestBindings?.tools).toHaveLength(first.descriptor.ai!.insightProviders.length);
  for (const binding of first.descriptor.aiManifestBindings!.tools) {
    const identity = resolveAtlasEntityToolManifest(binding.id, binding.version, plane);
    expect(binding).toMatchObject({ manifestHash: identity.manifestHash, inputSchemaHash: identity.inputSchemaHash, resultSchemaHash: identity.resultSchemaHash });
  }
  expect(first.runtime.artifactHash).toBe(`sha256:${sha256(canonicalBytes(Object.fromEntries(Object.entries(first.runtime.content).filter(([key]) => key !== "artifactHash"))))}`);
});
it("rejects a manifest change through actual worker signing and dispatch qualification", async () => {
  const f = compile("country", "neon");
  const dependencies = { lower: async () => f.lowered, registry: async () => f.registry,
    qualify: async () => ({ receiptSha256: "a".repeat(64) }) };
  const document = await compileRuntimePublication(f.runtimeSource, dependencies, { canonicalBytes, sha256 }, "fixture-signing-key");
  for (const phase of ["sign", "dispatch"] as const)
    await expect(qualifyRuntimePublication(document, dependencies, { canonicalBytes, sha256 }, phase)).resolves.toBe("a".repeat(64));
  const changed = { ...dependencies, registry: async () => ({ ...f.registry, resolveAiToolManifest: (id: string, version: string, plane: PublicationPlane) => ({
    ...resolveAtlasEntityToolManifest(id, version, plane), inputSchemaHash: "b".repeat(64),
  }) }) };
  for (const phase of ["sign", "dispatch"] as const)
    await expect(qualifyRuntimePublication(document, changed, { canonicalBytes, sha256 }, phase)).rejects.toThrow("ENTITY_AI_MANIFEST_CHANGED");
});
it.each(["studio", "neon", "mesh"] as const)("%s: existing Principal publication does not automatically enroll in Atlas", plane => {
  const value = compile("principal", plane, false);
  expect(value.descriptor).not.toHaveProperty("ai");
  expect(value.descriptor).not.toHaveProperty("aiManifestBindings");
});

it.each(["studio", "neon", "mesh"] as const)("%s: explicitly enrolled Principal binds every published provider on the standard compiler path", plane => {
  const value = compile("principal", plane);
  expect(value.descriptor.ai).toEqual(value.compiled.descriptor.ai);
  expect(value.descriptor.aiManifestBindings?.tools.map(tool => tool.id)).toEqual(["entity_explain_fields", "entity_lookup", "entity_read_record"]);
});
