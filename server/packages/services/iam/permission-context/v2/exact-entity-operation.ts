/**
 * Canonical v2 operation resolution.
 *
 * This module deliberately accepts no permission code, alias, token, or
 * fallback verb. Callers must present the exact catalog owner/entity/operation
 * tuple and receive the permission UUID compiled for that tuple.
 */

export interface ExactEntityOperation {
  catalogOwnerId: string;
  entityId: string;
  operationCode: string;
  permissionId: string;
  planeCode: "neon" | "admin" | "mesh";
}

export interface ExactOperationLookup {
  catalogOwnerId: string;
  entityId: string;
  operationCode: string;
  planeCode: "neon" | "admin" | "mesh";
}

function exactKey(value: ExactOperationLookup): string {
  return JSON.stringify([
    value.catalogOwnerId,
    value.entityId,
    value.operationCode,
    value.planeCode,
  ]);
}

export class ExactEntityOperationResolver {
  readonly #byTuple: ReadonlyMap<string, ExactEntityOperation>;

  constructor(operations: readonly ExactEntityOperation[]) {
    const byTuple = new Map<string, ExactEntityOperation>();
    for (const operation of operations) {
      const key = exactKey(operation);
      if (byTuple.has(key)) {
        throw new Error(`Ambiguous canonical entity operation: ${key}`);
      }
      if (!operation.permissionId) {
        throw new Error(`Canonical entity operation has no permission ID: ${key}`);
      }
      byTuple.set(key, Object.freeze({ ...operation }));
    }
    this.#byTuple = byTuple;
  }

  resolveExact(input: ExactOperationLookup): ExactEntityOperation | undefined {
    return this.#byTuple.get(exactKey(input));
  }

  requireExact(input: ExactOperationLookup): ExactEntityOperation {
    const operation = this.resolveExact(input);
    if (!operation) {
      throw new Error(
        `No exact canonical entity operation: ${exactKey(input)}`,
      );
    }
    return operation;
  }
}
