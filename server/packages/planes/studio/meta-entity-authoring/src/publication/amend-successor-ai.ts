import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import {
  compileSharedReferenceProduct,
  type SharedReferenceProduct,
} from "../authoring/product.js";
import { compileGraph } from "../deterministic.js";

/** AI-only draft amendment. Preserve all existing operations, permissions,
 * owner capabilities and presentation. Publication still needs maker/checker. */
export function amendSuccessorAi(
  graph: MetaEntityGraph,
  product: SharedReferenceProduct,
): MetaEntityGraph {
  const runtime = graph.runtimeProfiles?.[0];
  if (
    graph.entity.entityCode !== product.definition.entityCode ||
    graph.entity.entityClass !== "reference" ||
    graph.entity.ownershipModel !== "system" ||
    graph.runtimeProfiles?.length !== 1 ||
    runtime?.storageSchema !== "shared" ||
    runtime.storageObject !== product.definition.storageObject ||
    runtime.writeMode !== "none" ||
    !runtime.storagePlane ||
    graph.surfaces?.filter(
      (surface) =>
        surface.surfaceKind === "detail" && surface.status !== "deprecated",
    ).length !== 1
  )
    throw Error("AI_PRODUCT_SOURCE_MISMATCH");
  const source = compileSharedReferenceProduct(product, runtime.storagePlane)
    .artifact.descriptor.ai;
  if (!source) throw Error("AI_PRODUCT_DECLARATION_REQUIRED");
  const amended = {
    ...structuredClone(graph),
    surfaces: graph.surfaces.map((surface) =>
      surface.surfaceKind === "detail" && surface.status !== "deprecated"
        ? {
            ...structuredClone(surface),
            layoutConfig: {
              ...structuredClone(surface.layoutConfig),
              ai: structuredClone(source),
            },
          }
        : structuredClone(surface),
    ),
  };
  compileGraph(amended);
  return amended;
}
