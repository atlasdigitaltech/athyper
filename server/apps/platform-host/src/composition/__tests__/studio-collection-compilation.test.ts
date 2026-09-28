import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { compileGraph } from "@athyper/server-plane-studio-meta-entity-authoring/deterministic";
import { compileDocumentCollection, withDocumentCollectionSource } from "@athyper/server-service-publication/shared/collections/compiler";

it("lowers a Studio-authored non-BP binding into a pinned collection descriptor", () => {
  const graph = JSON.parse(readFileSync(new URL(
    "../../../../../../governance/policy/reviews/bp-dependencies-20260912/child-storage.candidate.json",
    import.meta.url), "utf8"));
  graph.entity.entityCode = "asset_change";
  const layout = graph.surfaces[0].layoutConfig;
  layout.collectionRelationship.subject.value = "master.asset";
  layout.collectionCompilation = {
    schemaVersion: 1, entityCode: "asset_change", planeKey: "neon",
    subjectEntityCode: "master.asset", permissionCode: "neon.assets.case.read",
    detailRouteTemplate: "/app/entity/asset_change/:recordId",
  };
  layout.authorization.entityCode = "asset_change";
  for (const operation of layout.authorization.operations) operation.permissionCode = "neon.assets.case.read";
  for (const permission of graph.operationPermissions) permission.permissionCode = "neon.assets.case.read";
  const native = compileGraph(graph);
  expect(native.descriptor.collectionCompilation).toEqual(layout.collectionCompilation);
  const catalog = [{ id: "11111111-1111-4111-8111-111111111111",
    code: "neon.assets.case.read", kind: "entity_operation", scopeKinds: ["operating_organization"] }];
  const compiled = compileDocumentCollection(native.descriptor, "neon", catalog);
  const pinned = withDocumentCollectionSource(compiled, {
    entityId: "22222222-2222-4222-8222-222222222222", releaseHash: native.contractHash,
  });
  expect(pinned.entityCode).toBe("asset_change");
  expect(pinned.collectionRelationship.subject.value).toBe("master.asset");
  expect(pinned.source.release_hash).toBe(native.contractHash);
  expect(pinned.operations.read?.permissionCode).toBe("neon.assets.case.read");
  expect(() => compileDocumentCollection(native.descriptor, "neon", [])).toThrow();
  expect(() => compileDocumentCollection(native.descriptor, "mesh", catalog)).toThrow();
});
