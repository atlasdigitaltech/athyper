import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { compileGraph, validateGraph } from "../deterministic.js";
import { compileRuntimeRestoration } from "../runtime-restoration.js";
import { baselineJsonHash } from "../baseline-publication.js";
const read = (path: string) =>
  JSON.parse(
    readFileSync(
      new URL("../../../../../../../" + path, import.meta.url),
      "utf8",
    ),
  );
const proposal = read(
  "governance/policy/reviews/business-partner-canonical-v2-native.proposal.dev.json",
);
function fixture() {
  const graph = read(
    "governance/policy/reviews/business-partner-canonical-v2-native-graph.dev.json",
  );
  const layout = graph.surfaces.find(
    (s: any) => s.layoutConfig?.authorizationSuccessor,
  ).layoutConfig;
  delete layout.authorizationSuccessor;
  delete layout.baselineImport;
  layout.runtimeRestoration = {
    schemaVersion: 1,
    kind: "reviewed_empty_target",
    tenantId: "44444444-4444-4444-8444-444444444444",
    publicationKey: proposal.predecessor.publicationKey,
    sourceArtifactHash: "a".repeat(64),
    descriptorHash: baselineJsonHash(proposal.descriptor),
    descriptor: structuredClone(proposal.descriptor),
  };
  return { graph, layout };
}
it("preserves the full runtime payload without pretending that a deleted predecessor is current", () => {
  const { graph } = fixture();
  expect(validateGraph(graph).issues).toEqual([]);
  const result = compileRuntimeRestoration(compileGraph(graph).descriptor)!;
  expect(result.descriptor).toEqual(proposal.descriptor);
  expect(Object.keys(result.descriptor.operations)).toHaveLength(42);
  for (const key of [
    "storage",
    "recordPresentation",
    "listPresentation",
    "ai",
    "authorizationRuntime",
  ])
    expect(result.descriptor[key]).toEqual(proposal.descriptor[key]);
});
it("rejects payload edits not pinned by the reviewed marker", () => {
  const { graph, layout } = fixture();
  layout.runtimeRestoration.descriptor.storage.table = "other";
  expect(
    validateGraph(graph).issues.some(
      (i) => i.code === "RUNTIME_RESTORATION_INVALID",
    ),
  ).toBe(true);
});
it("requires native policy, field and operation coverage even if the payload hash is recomputed", () => {
  for (const mutate of [
    (d: any) => {
      d.fields.pop();
    },
    (d: any) => {
      delete d.operations.read;
    },
    (d: any) => {
      d.authorizationRuntime.bindings[0].handler = "unreviewed";
    },
    (d: any) => {
      d.ai.enabled = false;
    },
    (d: any) => {
      delete d.storage;
    },
  ]) {
    const { graph, layout } = fixture();
    mutate(layout.runtimeRestoration.descriptor);
    layout.runtimeRestoration.descriptorHash = baselineJsonHash(
      layout.runtimeRestoration.descriptor,
    );
    expect(
      validateGraph(graph).issues.some(
        (i) => i.code === "RUNTIME_RESTORATION_INVALID",
      ),
    ).toBe(true);
  }
});
it("rejects ambiguous old/new markers, unexpected versions and different entity identity", () => {
  for (const mutate of [
    (l: any) => {
      l.baselineImport = {};
    },
    (l: any) => {
      l.runtimeRestoration.schemaVersion = 2;
    },
    (l: any) => {
      l.runtimeRestoration.descriptor.entityCode = "other";
      l.runtimeRestoration.descriptorHash = baselineJsonHash(
        l.runtimeRestoration.descriptor,
      );
    },
  ]) {
    const { graph, layout } = fixture();
    mutate(layout);
    expect(
      validateGraph(graph).issues.some(
        (i) => i.code === "RUNTIME_RESTORATION_INVALID",
      ),
    ).toBe(true);
  }
});

it("keeps reviewed record coverage while allowing validated presentation-only intake answers", () => {
  const { graph } = fixture();
  const choices = read("server/packages/platform/metadata/src/__tests__/fixtures/intake-choice-graphs.json").business_partner;
  graph.fields.push(...choices.fields);
  graph.surfaces.push(...choices.surfaces);
  graph.surfaceSections = [...(graph.surfaceSections ?? []), ...choices.surfaceSections];
  graph.surfaceFieldBindings = [...(graph.surfaceFieldBindings ?? []), ...choices.surfaceFieldBindings];
  expect(validateGraph(graph).issues).toEqual([]);
  expect(compileRuntimeRestoration(compileGraph(graph).descriptor)!.descriptor).toEqual(proposal.descriptor);
  const field = graph.fields.find((f:any)=>f.fieldKey==="requested_role");
  field.storagePath = "legal_name";
  expect(validateGraph(graph).issues.some(i=>i.code==="INTAKE_SURFACE_INVALID")).toBe(true);
  delete field.storagePath;
  graph.surfaceFieldBindings = graph.surfaceFieldBindings.filter((b:any)=>b.entityFieldId!==field.id);
  expect(validateGraph(graph).issues.length).toBeGreaterThan(0);
});
