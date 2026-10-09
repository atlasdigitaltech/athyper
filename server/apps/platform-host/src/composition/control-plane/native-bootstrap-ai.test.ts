import { expect, it } from "vitest";
import { compileNativeAi } from "@athyper/server-plane-studio-meta-entity-authoring";
import { resolveAtlasEntityToolManifest } from "@athyper/server-platform-ai";
import { resourceConversionFixture } from "../../../../../packages/planes/studio/meta-entity-authoring/src/legacy-native-resources.fixtures.js";
import { resolveNativeBootstrapAi } from "./native-bootstrap-ai.js";

function fixture(name: string) {
  const f = resourceConversionFixture(name, "studio", 2);
  const graph = structuredClone(f.target);
  graph.fields.forEach((field) =>
    Object.assign(field, {
      dataType: f.source.fields.find((source) => source.id === field.id)!
        .dataType,
      relationId:
        f.input.ai.context.relationships.find(
          (r) => r.sourceFieldId === field.id,
        )?.relationId ?? null,
    }),
  );
  graph.relations = f.input.ai.context.relationships.map((r) => ({
    id: r.relationId,
    relationKey: r.key,
    relationKind: "many_to_one",
    resolutionKind: "logical",
    status: "active",
  }));
  graph.relationTargets = graph.relations.map((r) => ({
    id: r.id,
    entityRelationId: r.id!,
    relationTargetKey: "default",
    targetEntityId: graph.authoringSource.entityId,
    targetKeyKey: "business_code",
    isDefault: true,
  }));
  graph.relationFields = f.input.ai.context.relationships.map((r) => ({
    entityRelationTargetId: r.relationId,
    sourceFieldId: r.sourceFieldId,
    targetFieldKey: "code",
    position: 1,
  }));
  return { ...f, graph, context: f.input.authorization.context };
}
it.each(["country", "state_region"])(
  "preserves the complete %s AI declaration with real manifest identities",
  (name) => {
    const f = fixture(name);
    const context = resolveNativeBootstrapAi(f.graph, f.context)!;
    expect(compileNativeAi(f.graph.ai, context)).toEqual(
      f.source.surfaces!.find((s) => s.layoutConfig?.ai)!.layoutConfig!.ai,
    );
    for (const resource of context.resources.filter(
      (r) => r.kind === "insight_provider",
    ))
      expect(resource.hash).toBe(
        resolveAtlasEntityToolManifest(
          resource.key,
          String(resource.version),
          "studio",
        ).manifestHash,
      );
  },
);
it("rejects unknown capability and version instead of trusting fixture pins", () => {
  const f = fixture("country");
  f.graph.ai.binding[0]!.contractKey = "unregistered_tool";
  expect(() => resolveNativeBootstrapAi(f.graph, f.context)).toThrow();
  f.graph.ai.binding[0]!.contractKey = "entity_lookup";
  f.graph.ai.binding[0]!.contractVersion = 2;
  expect(() => resolveNativeBootstrapAi(f.graph, f.context)).toThrow();
});
it("rejects masked summary fields and UUID summaries", () => {
  const f = fixture("country");
  const id = f.graph.ai.field[0]!.entityFieldId;
  const access = f.graph.referenceMembers!.members.fieldAccess.find(
    (a) => a.entityFieldId === id,
  )!;
  access.representation = "masked";
  expect(() => resolveNativeBootstrapAi(f.graph, f.context)).toThrow(
    "FIELD_DENIED",
  );
  access.representation = "plain";
  f.graph.fields.find((field) => field.id === id)!.dataType = "uuid";
  expect(() => resolveNativeBootstrapAi(f.graph, f.context)).toThrow(
    "FIELD_DENIED",
  );
});
it("rejects missing search membership and broken relationship linkage", () => {
  const f = fixture("state_region");
  const search = f.graph.searchFields;
  f.graph.searchFields = [];
  expect(() => resolveNativeBootstrapAi(f.graph, f.context)).toThrow();
  f.graph.searchFields = search;
  f.graph.relationFields = [];
  expect(() => resolveNativeBootstrapAi(f.graph, f.context)).toThrow();
});
it("does not silently discard nonempty AI without a profile", () => {
  const f = fixture("country");
  f.graph.ai.profile = [];
  expect(() => resolveNativeBootstrapAi(f.graph, f.context)).toThrow();
  f.graph.ai = { profile: [], field: [], binding: [], reference: [], term: [] };
  expect(resolveNativeBootstrapAi(f.graph, f.context)).toBeNull();
});

it.each(["neon", "mesh"] as const)(
  "resolves AI manifests and exposure for destination %s",
  (plane) => {
    const f = fixture("country");
    f.context.plane = plane;
    f.graph.referenceMembers!.members.fieldAccess.forEach((row) => {
      row.targetPlane = plane;
    });
    const resolved = resolveNativeBootstrapAi(f.graph, f.context)!;
    expect(resolved.reference.planeKey).toBe(plane);
    for (const resource of resolved.resources.filter(
      (r) => r.kind === "insight_provider",
    ))
      expect(resource.hash).toBe(
        resolveAtlasEntityToolManifest(
          resource.key,
          String(resource.version),
          plane,
        ).manifestHash,
      );
    const field = f.graph.ai.field[0]!.entityFieldId;
    f.graph.referenceMembers!.members.fieldAccess.find(
      (row) => row.entityFieldId === field,
    )!.representation = "masked";
    expect(() => resolveNativeBootstrapAi(f.graph, f.context)).toThrow(
      "FIELD_DENIED",
    );
  },
);
