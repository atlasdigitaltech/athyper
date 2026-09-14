import {
  compileGraph,
  validateGraph,
  runContractTests,
} from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js";
import { graphDependencies } from "../../../server/packages/planes/studio/meta-entity-authoring/src/graph-dependencies.js";
import {
  metadataHash,
  metadataKey,
  verifyMetadataSet,
} from "./metadata-set.mjs";
import type { MetaEntityGraph } from "../../../server/packages/contracts/meta-entity-authoring/src/model.js";

/** Freeze re-runs the same compiler from the candidate checkout. A declared
 * dependency list cannot conceal the native graph's external references. */
export function verifyNativeMetadataGraphs(
  document: Parameters<typeof verifyMetadataSet>[0],
) {
  verifyMetadataSet(document);
  const checks = [];
  const entities = new Map<string, string>();
  for (const item of document.items)
    if (item.reference.kind === "entity") {
      if (
        typeof item.payload.sourceEntityId !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(item.payload.sourceEntityId)
      )
        throw Error("Native metadata source entity UUID required");
      const previous = entities.get(item.payload.sourceEntityId);
      if (previous && previous !== item.reference.key)
        throw Error("Conflicting native entity identity");
      entities.set(item.payload.sourceEntityId, item.reference.key);
    }
  for (const item of document.items) {
    if (item.reference.kind !== "entity") continue;
    const graph = item.payload.graph as MetaEntityGraph;
    if (!graph || graph.entity?.entityCode !== item.reference.key)
      throw Error("Native graph coordinate mismatch");
    const validation = validateGraph(graph);
    if (validation.issues.length)
      throw Error(
        `Native graph invalid: ${validation.issues.map((issue) => `${issue.code}:${issue.path}`).join(",")}`,
      );
    if (!runContractTests(graph).passed)
      throw Error(`Native graph tests failed: ${item.reference.key}`);
    const compiled = compileGraph(graph);
    if (metadataHash(item.payload.compiled) !== metadataHash(compiled))
      throw Error(`Native compiler output mismatch: ${item.reference.key}`);
    const declared = new Set(item.requires.map(metadataKey));
    for (const dependency of graphDependencies(graph)) {
      let reference = dependency;
      if (dependency.kind === "entity") {
        const code = entities.get(dependency.key);
        if (!code)
          throw Error(`Missing related native entity: ${dependency.key}`);
        reference = { ...dependency, key: code, plane: item.reference.plane };
      }
      if (!declared.has(metadataKey(reference)))
        throw Error(
          `Undeclared native graph dependency: ${metadataKey(reference)}`,
        );
    }
    checks.push({
      entityCode: graph.entity.entityCode,
      contractHash: compiled.contractHash,
      descriptorHash: compiled.descriptorHash,
    });
  }
  return checks;
}
