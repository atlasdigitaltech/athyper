import type { EntityCapabilityManifest } from "@athyper/api-contracts/metadata";

import type { AggregateChangeSet } from "./entity-mutation.types.js";

export type AggregateCollectionOperation = "delete" | "update" | "create" | "replace";

export interface AggregateCollectionExecutionStep {
  collection: string;
  childEntity: string;
  ownership: "foreign_key" | "polymorphic" | "handler";
  foreignKey?: string;
  handler?: string;
  versionStrategy: "none" | "parent_version" | "row_version";
  operation: AggregateCollectionOperation;
  payload: unknown;
}

export class AggregateCollectionPlanError extends Error {
  constructor(
    readonly code: "CHILD_COLLECTION_NOT_DECLARED" | "CHILD_MUTATION_DENIED" | "CHILD_OWNERSHIP_INVALID",
    message: string,
    readonly collection: string,
    readonly operation?: AggregateCollectionOperation,
  ) {
    super(message);
    this.name = "AggregateCollectionPlanError";
  }
}

/**
 * Compiles a deterministic delete -> update -> create -> replace execution
 * plan. Persistence executors consume these steps inside the aggregate's one
 * transaction; domain handlers may validate or enrich them but cannot bypass
 * the compiled ownership contract.
 */
export function compileAggregateCollectionExecutionPlan(
  manifest: EntityCapabilityManifest,
  changes: AggregateChangeSet,
): AggregateCollectionExecutionStep[] {
  const bindings = new Map(manifest.collections.map((binding) => [binding.name, binding]));
  const steps: AggregateCollectionExecutionStep[] = [];
  const operationOrder: readonly AggregateCollectionOperation[] = ["delete", "update", "create", "replace"];

  for (const collection of Object.keys(changes.collections).sort()) {
    const binding = bindings.get(collection);
    if (!binding) {
      throw new AggregateCollectionPlanError(
        "CHILD_COLLECTION_NOT_DECLARED",
        `Collection '${collection}' is not declared by the compiled capability manifest.`,
        collection,
      );
    }
    if (binding.ownership === "foreign_key" && !binding.foreignKey) {
      throw new AggregateCollectionPlanError(
        "CHILD_OWNERSHIP_INVALID",
        `Collection '${collection}' has no compiled foreign key.`,
        collection,
      );
    }
    if (binding.ownership === "handler" && !binding.handler) {
      throw new AggregateCollectionPlanError(
        "CHILD_OWNERSHIP_INVALID",
        `Collection '${collection}' has no registered ownership handler.`,
        collection,
      );
    }
    const change = changes.collections[collection]!;
    for (const operation of operationOrder) {
      const payload = change[operation];
      if (!payload || payload.length === 0) continue;
      if (!binding.allowedActions[operation]) {
        throw new AggregateCollectionPlanError(
          "CHILD_MUTATION_DENIED",
          `Collection '${collection}' does not allow '${operation}'.`,
          collection,
          operation,
        );
      }
      steps.push({
        collection,
        childEntity: binding.targetEntity,
        ownership: binding.ownership,
        ...(binding.foreignKey ? { foreignKey: binding.foreignKey } : {}),
        ...(binding.handler ? { handler: binding.handler } : {}),
        versionStrategy: binding.versionStrategy,
        operation,
        payload,
      });
    }
  }
  return steps;
}
