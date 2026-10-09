import type {
  AuthoringPlane,
  ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  compileNativeRelease,
  type NativeReleaseCompilationContext,
} from "./native-release-compilation.js";
import type { NativeCompiledOperation } from "./native-operation-compilation.js";
import { sha256 } from "./deterministic.js";
import { validateNativeSnapshotReferences } from "./native-snapshot-validation.js";

/** Derived per-plane compilation from one canonical source. Contexts must come
 * from trusted host resolution, not the command body. Catalogue facts alone do
 * not attest storage authority, deployment, approval or current effective access.
 * No projection is persisted as another writable authoring graph. */
export function compileNativeReleaseTargets(
  source: ExpandedNativeMetaEntityGraph,
  contexts: readonly NativeReleaseCompilationContext[],
  controls: readonly NativeCompiledOperation[],
) {
  const reject = (): never => {
    throw Error("NATIVE_TARGET_COMPILATION_CONTEXT_REQUIRED");
  };
  const members = source.referenceMembers?.members;
  const targets = members?.target;
  const sourceHash = sha256(source);
  if (
    !members ||
    !targets?.length ||
    !source.ownedLabels ||
    source.runtimeProfiles.length !== 1
  )
    return reject();
  const planes = targets.map((target) => target.targetPlane);
  if (
    !planes.includes(source.runtimeProfiles[0]!.storagePlane as AuthoringPlane)
  )
    return reject();
  if (
    new Set(planes).size !== planes.length ||
    contexts.length !== planes.length ||
    new Set(contexts.map((context) => context.authorization.plane)).size !==
      planes.length ||
    contexts.some(
      (context) =>
        context.graphHash !== sourceHash ||
        !planes.includes(context.authorization.plane),
    )
  )
    return reject();
  validateNativeSnapshotReferences(
    source,
    source.ownedLabels,
    Math.min(...contexts.map((context) => context.core.maxMembers)),
  );
  // Refuse orphan plane declarations rather than dropping them in the projection.
  const scoped = [
    members.authorizationProfile,
    members.fieldAccess,
    members.accessPermission,
    source.operationPermissions ?? [],
    source.operationScopeBindings ?? [],
  ];
  if (
    scoped.some((rows) => rows.some((row) => !planes.includes(row.targetPlane)))
  )
    return reject();
  // AI fields and capability manifests must be resolved against each target's
  // authorization and registered tools, never borrowed from the source plane.
  if (
    Object.values(source.ai).some((rows) => rows.length) &&
    contexts.some(
      (context) =>
        !context.ai ||
        context.ai.reference.planeKey !== context.authorization.plane ||
        context.ai.reference.entityCode !== source.entity.entityCode,
    )
  )
    throw Error("NATIVE_TARGET_AI_CONTEXT_REQUIRED");
  return targets.map((target) => {
    const plane = target.targetPlane as AuthoringPlane;
    const context = contexts.find(
      (value) => value.authorization.plane === plane,
    )!;
    const runtime = source.runtimeProfiles[0]!;
    const catalogues = context.core.catalogues.filter(
      (catalogue) =>
        catalogue.plane === plane &&
        catalogue.schema === runtime.storageSchema &&
        catalogue.object === runtime.storageObject,
    );
    if (
      catalogues.length !== 1 ||
      runtime.backingKind !== "table" ||
      runtime.writeMode !== "none"
    )
      return reject();
    if (
      plane === runtime.storagePlane &&
      catalogues[0]!.hash !== runtime.storageCatalogueHash
    )
      return reject();
    const graph = projectNativeTargetGraph(source, plane, catalogues[0]!.hash);
    const artifact = compileNativeRelease(
      graph,
      { ...context, graphHash: sha256(graph) },
      controls,
    );
    return {
      sourceContractHash: sourceHash,
      targetPlane: plane,
      graph,
      artifact,
    };
  });
}

/** Deterministic derived graph reconstruction, not resource qualification. */
export function projectNativeTargetGraph(
  source: ExpandedNativeMetaEntityGraph,
  plane: AuthoringPlane,
  catalogueHash: string,
): ExpandedNativeMetaEntityGraph {
  if (
    !/^[a-f0-9]{64}$/.test(catalogueHash) ||
    source.runtimeProfiles.length !== 1 ||
    (source.runtimeProfiles[0]!.storagePlane === plane &&
      source.runtimeProfiles[0]!.storageCatalogueHash !== catalogueHash) ||
    source.referenceMembers?.members.target.filter(
      (target) => target.targetPlane === plane,
    ).length !== 1
  )
    throw Error("NATIVE_TARGET_COMPILATION_CONTEXT_REQUIRED");
  const copy = structuredClone(source);
  const graph: ExpandedNativeMetaEntityGraph = {
    ...copy,
    runtimeProfiles: [
      {
        ...source.runtimeProfiles[0]!,
        storagePlane: plane,
        storageCatalogueHash: catalogueHash,
      },
    ],
    ...(copy.operationPermissions === undefined
      ? {}
      : {
          operationPermissions: copy.operationPermissions.filter(
            (row) => row.targetPlane === plane,
          ),
        }),
    ...(copy.operationScopeBindings === undefined
      ? {}
      : {
          operationScopeBindings: copy.operationScopeBindings.filter(
            (row) => row.targetPlane === plane,
          ),
        }),
    referenceMembers: {
      ...copy.referenceMembers!,
      members: {
        ...copy.referenceMembers!.members,
        target: copy.referenceMembers!.members.target.filter(
          (row) => row.targetPlane === plane,
        ),
        authorizationProfile:
          copy.referenceMembers!.members.authorizationProfile.filter(
            (row) => row.targetPlane === plane,
          ),
        fieldAccess: copy.referenceMembers!.members.fieldAccess.filter(
          (row) => row.targetPlane === plane,
        ),
        accessPermission:
          copy.referenceMembers!.members.accessPermission.filter(
            (row) => row.targetPlane === plane,
          ),
      },
    },
  };
  return graph;
}
