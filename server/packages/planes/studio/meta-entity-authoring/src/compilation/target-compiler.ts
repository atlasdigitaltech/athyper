import type { AuthoringPlane, MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { assertCommonReferenceGraph } from "@athyper/server-contract-metadata";
import { compileGraph } from "../deterministic.js";

/** Reference target compilation, reused across entities.
 * Only target coordinates may differ from the single persisted Studio source.
 * This compiler does not enroll targets, approve a graph, sign, or activate it. */
export function compileSystemReferenceTarget(source: MetaEntityGraph, plane: AuthoringPlane) {
  assertCommonReferenceGraph(source, "studio");
  const markers = (source.surfaces ?? []).flatMap(surface => {
    const value = surface.layoutConfig?.systemReferenceProduct;
    return value === undefined ? [] : [value];
  });
  if (markers.length !== 1) throw Error("SYSTEM_REFERENCE_SOURCE_MARKER_REQUIRED");
  const marker = markers[0];
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) throw Error("SYSTEM_REFERENCE_SOURCE_MARKER_INVALID");
  const m = marker as Record<string, unknown>;
  if (Object.keys(m).sort().join() !== ["moduleCode", "productHash", "schema", "targetPlanes"].sort().join()
    || m.schema !== "athyper.system-reference-source/1" || typeof m.productHash !== "string" || !/^[a-f0-9]{64}$/.test(m.productHash)
    || typeof m.moduleCode !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(m.moduleCode)
    || !Array.isArray(m.targetPlanes) || !m.targetPlanes.includes("studio") || !m.targetPlanes.includes(plane)
    || new Set(m.targetPlanes).size !== m.targetPlanes.length || m.targetPlanes.some(p => !["studio", "neon", "mesh"].includes(p)))
    throw Error("SYSTEM_REFERENCE_TARGET_NOT_ENROLLED");
  const copy = structuredClone(source);
  const graph: MetaEntityGraph = {
    ...copy,
    runtimeProfiles: copy.runtimeProfiles?.map(profile => ({ ...profile, storagePlane: plane })),
    operationPermissions: copy.operationPermissions?.map(permission => ({ ...permission, targetPlane: plane })),
    operationScopeBindings: copy.operationScopeBindings?.map(binding => ({ ...binding, targetPlane: plane })),
    surfaces: copy.surfaces?.map(surface => {
      const auth = surface.layoutConfig?.authorization;
      if (!auth) return surface;
      if (typeof auth !== "object" || Array.isArray(auth) || (auth as Record<string, unknown>).planeKey !== "studio")
        throw Error("SYSTEM_REFERENCE_AUTHORIZATION_SOURCE_MISMATCH");
      return { ...surface, layoutConfig: { ...surface.layoutConfig, authorization: { ...auth, planeKey: plane } } };
    }),
  };
  assertCommonReferenceGraph(graph, plane);
  return { sourceContractHash: compileGraph(source).contractHash, targetPlane: plane, graph, artifact: compileGraph(graph) };
}
