import {
  AuthoringPolicyError,
  type MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";

/**
 * These optional graph families were retired from the Entity authoring model.
 * Rejecting populated input is intentional: a legacy client must never cause
 * members to be omitted while a graph is saved.
 */
export function assertNoRetiredNativeGraphBranches(graph: MetaEntityGraph) {
  const populated = [
    ["changeCaseBindings", graph.changeCaseBindings],
    ["materializationBindings", graph.materializationBindings],
    ["materializationFieldMappings", graph.materializationFieldMappings],
    ["lifecycleBindings", graph.lifecycleBindings],
    ["lifecycleOperationBindings", graph.lifecycleOperationBindings],
    ["tests", graph.tests],
  ].find(([, members]) => members !== undefined && members.length > 0)?.[0];

  if (populated)
    throw new AuthoringPolicyError(
      "ENTITY_OPTIONAL_GRAPH_BRANCH_RETIRED",
      `${populated} is retired from Entity authoring. Remove it from the source or use its owning supported contract.`,
    );
}
