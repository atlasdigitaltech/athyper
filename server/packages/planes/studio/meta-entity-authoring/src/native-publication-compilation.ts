import type {
  CompiledMetaEntityArtifact,
  ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  compileNativeRelease,
  type NativeReleaseCompilationContext,
} from "./native-release-compilation.js";
import { compileNativeReleaseTargets } from "./native-target-compilation.js";
import type { NativeCompiledOperation } from "./native-operation-compilation.js";
import { sha256 } from "./deterministic.js";

/** One signed source envelope pins every independently compiled target. Existing
 * single-plane releases retain their exact compiler version and signed bytes. */
export function compileNativePublication(source: {
  graph: ExpandedNativeMetaEntityGraph;
  compiler: NativeReleaseCompilationContext;
  targetCompilers?: readonly NativeReleaseCompilationContext[];
  controls: readonly NativeCompiledOperation[];
}): CompiledMetaEntityArtifact {
  if (
    source.graph.referenceMembers?.members.target.length === 1 &&
    source.targetCompilers === undefined
  )
    return compileNativeRelease(source.graph, source.compiler, source.controls);
  if (!source.targetCompilers)
    throw Error("NATIVE_PUBLICATION_TARGET_CONTEXT_REQUIRED");
  const targets = compileNativeReleaseTargets(
    source.graph,
    source.targetCompilers,
    source.controls,
  );
  const descriptor = {
    schema: "athyper.native-target-set/1",
    entity: source.graph.entity,
    targets: targets
      .map((target) => ({
        plane: target.targetPlane,
        artifact: target.artifact,
      }))
      .sort((a, b) => a.plane.localeCompare(b.plane)),
  };
  return {
    schema: "athyper.entity-runtime-descriptor/1.0",
    compiler: {
      name: "@athyper/meta-entity-compiler",
      version: "native-reference/2",
    },
    contractHash: sha256(source.graph),
    descriptorHash: sha256(descriptor),
    descriptor,
  };
}
