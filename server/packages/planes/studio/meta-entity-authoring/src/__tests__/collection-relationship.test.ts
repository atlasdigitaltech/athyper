import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import {
  compileGraph,
  runContractTests,
  validateGraph,
} from "../deterministic.js";

const candidate = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../../../governance/policy/reviews/bp-dependencies-20260912/child-storage.candidate.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as MetaEntityGraph;
it("compiles the BP review collection with independent read policy and complete field coverage", () => {
  expect(validateGraph(candidate).issues).toEqual([]);
  expect(runContractTests(candidate).passed).toBe(true);
  const artifact = compileGraph(candidate);
  expect(artifact.descriptor.collectionRelationship).toMatchObject({
    scope: {
      contextRef: "operatingOrganizationId",
      fieldRef: "current_snapshot.organization",
    },
  });
  expect(artifact.descriptor.authorization).toMatchObject({
    ownership: "organization.record.v1",
  });
  expect(compileGraph(structuredClone(candidate)).descriptorHash).toBe(
    artifact.descriptorHash,
  );
});
it.each([
  "source",
  "coordinate",
  "storage",
  "resolver",
  "scope",
  "permission",
  "duplicate",
])("rejects a mismatched %s before review and compilation", (mutation) => {
  const graph = structuredClone(candidate) as any;
  const relationship = graph.surfaces[0].layoutConfig.collectionRelationship;
  if (mutation === "source") relationship.sourceRef = "arbitrary_table";
  if (mutation === "coordinate")
    relationship.scope.contextRef = "companyCodeId";
  if (mutation === "storage")
    graph.runtimeProfiles[0].storageObject = "business_partner";
  if (mutation === "resolver")
    graph.operationScopeBindings[1].resolverKey = "unregistered";
  if (mutation === "scope")
    graph.operationScopeBindings[1].scopeKind = "tenant";
  if (mutation === "permission") graph.operationPermissions = [];
  if (mutation === "duplicate")
    graph.surfaces.push({ ...graph.surfaces[0], surfaceKey: "duplicate" });
  expect(
    validateGraph(graph).issues.some(
      (issue) => issue.code === "COLLECTION_RELATIONSHIP_INVALID",
    ),
  ).toBe(true);
  expect(() => compileGraph(graph)).toThrow("META_ENTITY_GRAPH_INVALID");
});
it("does not publish a deprecated relationship declaration", () => {
  const graph = {
    ...candidate,
    surfaces: candidate.surfaces!.map((surface) => ({
      ...surface,
      status: "deprecated" as const,
    })),
  };
  expect(compileGraph(graph).descriptor).not.toHaveProperty(
    "collectionRelationship",
  );
});
