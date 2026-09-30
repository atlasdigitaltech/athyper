import type { EntityScopeAdapter } from "@athyper/server-service-records";
import type { EntityAuthorizationProfileV1 } from "@athyper/server-contract-metadata";

type ScopeInput = Parameters<EntityScopeAdapter["resolve"]>[0];
export interface EntityScopeBinding {
  readonly planeKey: ScopeInput["context"]["planeKey"];
  readonly entityCode: string;
  readonly resolver: ScopeInput["resolver"];
  readonly operationKey: string;
  readonly target: ScopeInput["target"];
  /** Trusted implementation: existing ownership must be read from storage,
   * never promoted from input.coordinates. This registry supplies no SQL. */
  readonly adapter: EntityScopeAdapter;
}

/** Exact host binding selected by published operation/resolver coordinates.
 * No wildcard, entity-name inference or fallback to tenant ownership. */
export function createEntityScopeRegistry(
  profile: Pick<EntityAuthorizationProfileV1, "planeKey" | "entityCode" | "operations">,
  bindings: readonly EntityScopeBinding[],
): EntityScopeAdapter {
  const key = (plane: string, entity: string, resolver: string, operation: string, target: string) =>
    JSON.stringify([plane, entity, resolver, operation, target]);
  const entries = new Map<string, EntityScopeAdapter>();
  for (const binding of bindings) {
    const id = key(binding.planeKey, binding.entityCode, binding.resolver, binding.operationKey, binding.target);
    if (entries.has(id) || typeof binding.adapter.resolve !== "function" ||
        typeof binding.adapter.preflight !== "function")
      throw Error("ENTITY_SCOPE_BINDING_INVALID");
    entries.set(id, Object.freeze({
      resolve: binding.adapter.resolve.bind(binding.adapter),
      preflight: binding.adapter.preflight.bind(binding.adapter),
    }));
  }
  const select = (input: Parameters<EntityScopeAdapter["preflight"]>[0]) => {
    if (input.context.planeKey !== profile.planeKey) return undefined;
    const operation = profile.operations.find(operation => operation.key === input.operationKey);
    return operation ? entries.get(key(profile.planeKey, profile.entityCode, operation.scope, operation.key, operation.target)) : undefined;
  };
  return Object.freeze({
    resolve: async (input: ScopeInput) => {
      const operation = profile.operations.find(operation => operation.key === input.operationKey);
      if (!operation || input.entityCode !== profile.entityCode || input.resolver !== operation.scope || input.target !== operation.target)
        return { state: "invalid" as const };
      return select(input)?.resolve(input) ?? { state: "invalid" as const };
    },
    preflight: async (input: Parameters<EntityScopeAdapter["preflight"]>[0]) => select(input)?.preflight(input) ?? "workflow_blocked",
  });
}
