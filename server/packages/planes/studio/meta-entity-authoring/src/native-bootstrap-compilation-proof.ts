import {
  AuthoringPolicyError,
  type ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { compileNativeRuntimeProjection } from "@athyper/server-platform-metadata";
import type { NativeBootstrapReader } from "./native-bootstrap-application.js";
import {
  compileNativeRelease,
  type NativeReleaseCompilationContext,
} from "./native-release-compilation.js";
import { compileNativeReleaseTargets } from "./native-target-compilation.js";
import { compileNativePublication } from "./native-publication-compilation.js";
import {
  verifyNativeCompiledOperationControls,
  type NativeCompiledOperation,
} from "./native-operation-compilation.js";

/** Runs on exact SQL readback before the bootstrap receipt or snapshot commits.
 * Every declared destination needs its own compiler and runtime reader. */
export function qualifyNativeBootstrapCompilation(input: {
  graph: ExpandedNativeMetaEntityGraph;
  compiler: NativeReleaseCompilationContext;
  reader: NativeBootstrapReader;
  targetCompilers?: readonly NativeReleaseCompilationContext[];
  targetReaders?: readonly NativeBootstrapReader[];
  controls: readonly NativeCompiledOperation[];
}) {
  const fail = (): never => {
    throw new AuthoringPolicyError(
      "NATIVE_BOOTSTRAP_READER_MISMATCH",
      "Every target requires an exact compiler and reader binding.",
    );
  };
  const multi = input.targetCompilers !== undefined;
  if (multi !== (input.targetReaders !== undefined)) fail();
  const targets = multi
    ? compileNativeReleaseTargets(
        input.graph,
        input.targetCompilers!,
        input.controls,
      )
    : [
        {
          graph: input.graph,
          targetPlane: input.compiler.authorization.plane,
          artifact: compileNativeRelease(
            input.graph,
            input.compiler,
            input.controls,
          ),
        },
      ];
  const readers = input.targetReaders ?? [input.reader];
  const contexts = input.targetCompilers ?? [input.compiler];
  if (
    readers.length !== targets.length ||
    new Set(readers.map((r) => r.registration.plane)).size !== targets.length
  )
    fail();
  for (const target of targets) {
    const reader = readers.find(
      (r) => r.registration.plane === target.targetPlane,
    );
    const compiler = contexts.find(
      (c) => c.authorization.plane === target.targetPlane,
    );
    const runtime = target.graph.runtimeProfiles[0];
    const identity = target.graph.fields.find(
      (f) => f.id === runtime?.idFieldId,
    );
    const key = compiler?.core.identities.find(
      (i) =>
        i.id === identity?.fieldIdentityId &&
        i.entityId === target.graph.authoringSource.entityId &&
        i.tenantId === target.graph.authoringSource.tenantId,
    );
    if (
      !reader ||
      !runtime ||
      !key ||
      reader.registration.entityCode !== target.graph.entity.entityCode ||
      key.fieldKey !== reader.registration.storage.idField ||
      runtime.storagePlane !== reader.storagePlane ||
      runtime.storageSchema !== reader.registration.storage.schema ||
      runtime.storageObject !== reader.registration.storage.object ||
      reader.registration.presentationDefaults !== undefined ||
      reader.registration.fieldPresentationDefaults !== undefined
    )
      return fail();
    verifyNativeCompiledOperationControls(
      input.controls,
      target.artifact.descriptor,
    );
    compileNativeRuntimeProjection({
      native: target.artifact.descriptor,
      registration: reader.registration,
      permissions: reader.permissions,
    });
  }
  // Preserve the original single-plane receipt hash; multi-plane receipts pin the
  // same complete envelope consumed by review and publication.
  return multi ? compileNativePublication(input) : targets[0]!.artifact;
}
