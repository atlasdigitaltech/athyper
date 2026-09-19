import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import {
  compileEntityAuthorizationRuntime,
  compileEntityAuthorization,
} from "./entity-authorization.js";
import { compileCollectionRelationship } from "./collection-relationship.js";
import { compileEntityAi } from "./entity-ai.js";
import { parseEntityRecordPresentation } from "@athyper/contract-platform-entity-runtime";

export interface GraphDependency {
  readonly kind:
    | "entity"
    | "permission"
    | "policy"
    | "lifecycle"
    | "numbering"
    | "handler"
    | "resolver"
    | "preflight"
    | "storage"
    | "case_contract"
    | "capability"
    | "provider";
  readonly key: string;
  readonly plane?: string;
  readonly revision?: number;
}

/** References outside a graph must be resolved before preview or candidate import.
 * Branch-local IDs remain the native compiler's responsibility. */
export function graphDependencies(
  graph: MetaEntityGraph,
): readonly GraphDependency[] {
  const references: GraphDependency[] = [];
  const add = (reference: GraphDependency) => references.push(reference);
  for (const target of graph.relationTargets ?? [])
    add({ kind: "entity", key: target.targetEntityId });
  for (const permission of graph.operationPermissions ?? []) {
    if (permission.status !== "deprecated")
      add({
        kind: "permission",
        key: permission.permissionCode,
        plane: permission.targetPlane,
      });
  }
  for (const binding of [
    ...(graph.policyBindings ?? []),
    ...(graph.fieldPolicyBindings ?? []),
  ]) {
    if (binding.status !== "deprecated")
      add({ kind: "policy", key: binding.policyDefinitionId });
  }
  for (const binding of graph.lifecycleBindings ?? []) {
    if (binding.status !== "deprecated")
      add({
        kind: "lifecycle",
        key: binding.lifecycleCode,
        plane: binding.targetPlane,
        revision: binding.lifecycleRevision,
      });
  }
  for (const binding of graph.numberingBindings ?? []) {
    if (binding.status !== "deprecated")
      add({
        kind: "numbering",
        key: binding.policyCode,
        plane: binding.targetPlane,
        revision: binding.policyRevision,
      });
  }
  for (const operation of graph.operations) {
    if (operation.status !== "deprecated" && operation.handlerKey)
      add({ kind: "handler", key: operation.handlerKey });
  }
  for (const profile of graph.runtimeProfiles ?? []) {
    for (const key of [profile.readHandlerKey, profile.writeHandlerKey])
      if (key)
        add({
          kind: "handler",
          key,
          ...(profile.storagePlane ? { plane: profile.storagePlane } : {}),
        });
    if (profile.storageSchema && profile.storageObject)
      add({
        kind: "storage",
        key: `${profile.storageSchema}.${profile.storageObject}`,
        ...(profile.storagePlane ? { plane: profile.storagePlane } : {}),
      });
  }
  for (const binding of graph.operationScopeBindings ?? [])
    if (binding.status !== "deprecated" && binding.resolverKey)
      add({
        kind: "resolver",
        key: binding.resolverKey,
        plane: binding.targetPlane,
      });
  const runtime = compileEntityAuthorizationRuntime(graph);
  if (runtime) {
    const plane = compileEntityAuthorization(graph)!.planeKey;
    for (const binding of runtime.bindings) {
      add({ kind: "handler", key: binding.handler, plane });
      add({ kind: "resolver", key: binding.resolver, plane });
      if (binding.preflight)
        add({ kind: "preflight", key: binding.preflight, plane });
    }
    if (runtime.schemaVersion === 2)
      for (const transition of runtime.canonicalReadAdmission.transitions) {
        add({
          kind: "permission",
          key: transition.sourcePermissionCode,
          plane,
        });
        add({
          kind: "permission",
          key: transition.targetPermissionCode,
          plane,
        });
      }
  }
  const collection = compileCollectionRelationship(graph);
  if (collection)
    for (const plane of new Set(
      (graph.operationPermissions ?? [])
        .filter((binding) => binding.status !== "deprecated")
        .map((binding) => binding.targetPlane),
    )) {
      add({ kind: "case_contract", key: collection.subject.value, plane });
    }
  const ai = compileEntityAi(graph);
  if (ai)
    for (const capability of [
      ...ai.insightProviders,
      ...ai.actions,
      ...ai.presentationProfiles,
    ]) {
      add({
        kind: "capability",
        key: capability.id,
        revision: capability.version,
      });
    }
  for (const surface of graph.surfaces ?? []) {
    if (
      surface.status === "deprecated" ||
      !surface.layoutConfig?.["recordPresentation"]
    )
      continue;
    const presentation = parseEntityRecordPresentation(
      surface.layoutConfig["recordPresentation"],
    );
    for (const related of presentation.related ?? [])
      add({ kind: "provider", key: related.source });
  }
  return [
    ...new Map(
      references.map((reference) => [dependencyKey(reference), reference]),
    ).values(),
  ].sort((left, right) =>
    dependencyKey(left).localeCompare(dependencyKey(right)),
  );
}

export function dependencyKey(reference: GraphDependency): string {
  return JSON.stringify([
    reference.kind,
    reference.plane ?? null,
    reference.key,
    reference.revision ?? null,
  ]);
}
