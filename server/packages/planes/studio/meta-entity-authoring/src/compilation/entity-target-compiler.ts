import type {
  AuthoringPlane,
  MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  parseTableEntityProduct,
  targetTableEntityGraph,
} from "../authoring/table-product.js";
import { compileSystemReferenceTarget } from "./target-compiler.js";
import { compileGraph } from "../deterministic.js";

/** Shared target compiler dispatches on a validated source contract, never entity name. */
export function compileSystemEntityTarget(
  source: MetaEntityGraph,
  plane: AuthoringPlane,
) {
  const markers = (source.surfaces ?? []).flatMap((surface) =>
    surface.layoutConfig?.tableEntityProduct === undefined
      ? []
      : [surface.layoutConfig.tableEntityProduct],
  );
  if (!markers.length) return compileSystemReferenceTarget(source, plane);
  if (
    markers.length !== 1 ||
    source.surfaces?.some(
      (surface) => surface.layoutConfig?.systemReferenceProduct !== undefined,
    )
  )
    throw Error("TABLE_PRODUCT_SOURCE_MARKER_INVALID");
  const marker = markers[0] as Record<string, unknown>;
  if (
    !marker ||
    typeof marker !== "object" ||
    Array.isArray(marker) ||
    Object.keys(marker).sort().join() !==
      ["moduleCode", "productHash", "schema", "targetPlanes"].sort().join() ||
    marker.schema !== "athyper.table-entity-source/1" ||
    typeof marker.productHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(marker.productHash)
  )
    throw Error("TABLE_PRODUCT_SOURCE_MARKER_INVALID");
  const definition = {
    ...source,
    surfaces: source.surfaces?.map((surface) => {
      const { tableEntityProduct: _marker, ...layoutConfig } =
        surface.layoutConfig ?? {};
      return { ...surface, layoutConfig };
    }),
  };
  const product = parseTableEntityProduct({
    schema: "athyper.table-entity-product/1",
    moduleCode: marker.moduleCode,
    planes: marker.targetPlanes,
    definition,
  });
  if (!product.planes.includes(plane))
    throw Error("TABLE_PRODUCT_TARGET_EXCLUDED");
  const graph = targetTableEntityGraph(source, plane);
  return {
    sourceContractHash: compileGraph(source).contractHash,
    targetPlane: plane,
    graph,
    artifact: compileGraph(graph),
  };
}
