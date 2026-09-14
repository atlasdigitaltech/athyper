import { readFileSync, writeFileSync } from "node:fs";
import { collectMetadataSet, metadataKey } from "./metadata-set.mjs";
import { verifyNativeMetadataGraphs } from "./metadata-graphs.mts";
import { compileGraph } from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js";
import { graphDependencies } from "../../../server/packages/planes/studio/meta-entity-authoring/src/graph-dependencies.js";

/** The input is an explicit source inventory, not arbitrary SQL or executable
 * migration text. References are followed transitively and native graph edges
 * are added by the compiler, rather than trusting a hand-written allowlist. */
export async function packMetadataIndex(index: any) {
  if (
    index?.schema !== "athyper.metadata-source-index/1" ||
    !Array.isArray(index.records) ||
    index.records.length > 10000
  )
    throw Error("Metadata source index required");
  const records = new Map<string, any>();
  const entities = new Map<string, string>();
  for (const original of index.records) {
    const item = structuredClone(original);
    const key = metadataKey(item.reference);
    if (records.has(key)) throw Error(`Duplicate source metadata: ${key}`);
    if (!Array.isArray(item.requires))
      throw Error(`Source dependency declarations required: ${key}`);
    records.set(key, item);
    if (item.reference.kind === "entity") {
      const prior = entities.get(item.payload.sourceEntityId);
      if (prior && prior !== item.reference.key)
        throw Error("Conflicting source entity identity");
      entities.set(item.payload.sourceEntityId, item.reference.key);
    }
  }
  for (const item of records.values()) {
    if (item.reference.kind !== "entity") continue;
    item.payload.compiled = compileGraph(item.payload.graph);
    for (const dependency of graphDependencies(item.payload.graph)) {
      if (dependency.kind === "entity") {
        const key = entities.get(dependency.key);
        if (!key)
          throw Error(`Related source entity unavailable: ${dependency.key}`);
        item.requires.push({ ...dependency, key, plane: item.reference.plane });
      } else item.requires.push(dependency);
    }
  }
  const result = await collectMetadataSet({
    tenantId: index.tenantId,
    roots: index.roots,
    resolve: async (reference) => records.get(metadataKey(reference)),
  });
  verifyNativeMetadataGraphs(result);
  return result;
}

export async function packMetadataFile(input: string, output: string) {
  const document = await packMetadataIndex(
    JSON.parse(readFileSync(input, "utf8")),
  );
  writeFileSync(output, JSON.stringify(document, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  return {
    path: output,
    nodes: document.items.length,
    dependencyClosureVerified: true,
    releaseQualified: false,
  };
}
