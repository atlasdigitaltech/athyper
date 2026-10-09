import { projectNativeTargetGraph } from "../native-target-compilation.js";
import type {
  AuthoringPlane,
  CompiledMetaEntityArtifact,
  ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { sha256 } from "../deterministic.js";
import { validateNativeSnapshotReferences } from "../native-snapshot-validation.js";

/** Validate already compiled native bytes against their exact immutable source.
 * This is not a compiler or an approval: callers independently verify signature,
 * review/target pins and current resource authority. Never rewrite a target plane.
 */
export function nativePublicationTargets(
  graph: ExpandedNativeMetaEntityGraph,
  artifact: CompiledMetaEntityArtifact,
): {
  sourceContractHash: string;
  targetPlane: AuthoringPlane;
  graph: ExpandedNativeMetaEntityGraph;
  artifact: CompiledMetaEntityArtifact;
}[] {
  if (
    graph.contractSchema !== "athyper.meta-entity-contract/2.5" ||
    graph.authoringSource?.sourceKind !== "product" ||
    graph.authoringSource.tenantId !== null ||
    graph.entity.ownershipModel !== "system" ||
    artifact.compiler?.name !== "@athyper/meta-entity-compiler" ||
    !["native-reference/1", "native-reference/2"].includes(
      artifact.compiler.version,
    ) ||
    artifact.contractHash !== sha256(graph) ||
    artifact.descriptorHash !== sha256(artifact.descriptor) ||
    sha256(artifact.descriptor.entity) !== sha256(graph.entity)
  )
    throw Error("NATIVE_PUBLICATION_SOURCE_MISMATCH");
  validateNativeSnapshotReferences(
    graph,
    {
      entityId: graph.authoringSource.entityId,
      tenantId: null,
      changeSetId: graph.ownedLabels!.changeSetId,
    },
    10000,
  );
  const declarations = graph.referenceMembers!.members.target;
  if (artifact.compiler.version === "native-reference/2") {
    const descriptor = artifact.descriptor;
    const entries = descriptor.targets as {
      plane: AuthoringPlane;
      artifact: CompiledMetaEntityArtifact;
    }[];
    if (
      descriptor.schema !== "athyper.native-target-set/1" ||
      Object.keys(descriptor).sort().join() !== "entity,schema,targets" ||
      !Array.isArray(entries) ||
      entries.length !== declarations.length ||
      new Set(entries.map((entry) => entry.plane)).size !== entries.length ||
      entries.map((entry) => entry.plane).join() !==
        declarations
          .map((target) => target.targetPlane)
          .sort()
          .join()
    )
      throw Error("NATIVE_PUBLICATION_TARGET_CONTEXT_REQUIRED");
    return entries.map((entry) => {
      if (
        !entry ||
        Object.keys(entry).sort().join() !== "artifact,plane" ||
        entry.artifact?.compiler?.version !== "native-reference/1"
      )
        throw Error("NATIVE_PUBLICATION_SOURCE_MISMATCH");
      const profiles = entry.artifact.descriptor.runtimeProfiles as {
        storageCatalogueHash: string;
      }[];
      if (!Array.isArray(profiles) || profiles.length !== 1)
        throw Error("NATIVE_PUBLICATION_SOURCE_MISMATCH");
      const targetGraph = projectNativeTargetGraph(
        graph,
        entry.plane,
        profiles[0]!.storageCatalogueHash,
      );
      const [target] = nativePublicationTargets(targetGraph, entry.artifact);
      return { ...target!, sourceContractHash: artifact.contractHash };
    });
  }
  const profiles = artifact.descriptor.runtimeProfiles;
  // The current native compiler qualifies one context. Do not copy its output
  // across planes or reinterpret a different database/catalogue as equivalent.
  if (
    declarations.length !== 1 ||
    !Array.isArray(profiles) ||
    profiles.length !== 1 ||
    profiles[0].storagePlane !== declarations[0]!.targetPlane
  )
    throw Error("NATIVE_PUBLICATION_TARGET_CONTEXT_REQUIRED");
  return declarations.map((target) => ({
    sourceContractHash: artifact.contractHash,
    targetPlane: target.targetPlane as AuthoringPlane,
    graph,
    artifact,
  }));
}
