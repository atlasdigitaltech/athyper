import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import {
  compileSharedReferenceProduct,
  type SharedReferenceProduct,
} from "../authoring/product.js";
import { compileGraph } from "../deterministic.js";
import { compileTableEntityProduct, type TableEntityProduct } from "../authoring/table-product.js";

/** AI-only draft amendment. Preserve all existing operations, permissions,
 * owner capabilities and presentation. Publication still needs maker/checker. */
export function amendSuccessorAi(
  graph: MetaEntityGraph,
  product: SharedReferenceProduct | TableEntityProduct,
): MetaEntityGraph {
  const runtime = graph.runtimeProfiles?.[0];
  if (product.schema === "athyper.table-entity-product/1") {
    const profile = product.definition.runtimeProfiles?.[0];
    if (graph.entity.entityCode !== product.definition.entity.entityCode ||
        graph.entity.ownershipModel !== "system" || graph.runtimeProfiles?.length !== 1 ||
        !runtime?.storagePlane || !profile || runtime.storageSchema !== profile.storageSchema ||
        runtime.storageObject !== profile.storageObject || runtime.tenantFieldKey !== profile.tenantFieldKey ||
        runtime.writeMode !== profile.writeMode) throw Error("AI_PRODUCT_SOURCE_MISMATCH");
    if (!product.definition.ai) throw Error("AI_PRODUCT_DECLARATION_REQUIRED");
    const declaration = compileTableEntityProduct(product, runtime.storagePlane).artifact.descriptor.ai;
    return amendDeclaration(graph, declaration);
  }
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
  return amendDeclaration(graph, source);
}
function amendDeclaration(graph: MetaEntityGraph, source: unknown): MetaEntityGraph {
  if (!source) throw Error("AI_PRODUCT_DECLARATION_REQUIRED");
  if (graph.surfaces?.filter(surface => surface.surfaceKind === "detail" && surface.status !== "deprecated").length !== 1)
    throw Error("AI_PRODUCT_SOURCE_MISMATCH");
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
