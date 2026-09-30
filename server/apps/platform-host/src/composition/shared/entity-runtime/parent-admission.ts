import type { EntityCapabilityRequest } from "@athyper/server-platform-experience";

export interface EntityParentScopeBinding {
  readonly planeKey: EntityCapabilityRequest["context"]["planeKey"];
  readonly entityCode: string;
  /** Trusted owner returns stored scope candidates, never browser coordinates.
   * Multiple resources remain independently checked by capability policy. */
  readonly resolve: (input: EntityCapabilityRequest) =>
    Promise<readonly Readonly<Record<string, unknown>>[] | null>;
}
export function createEntityParentAdmission(options: {
  readonly bindings: readonly EntityParentScopeBinding[];
  readonly read: (input: EntityCapabilityRequest) => Promise<boolean>;
}) {
  const entries = new Map<string, EntityParentScopeBinding["resolve"]>();
  const key = (plane: string, entity: string) => JSON.stringify([plane, entity]);
  for (const binding of options.bindings) {
    const id = key(binding.planeKey, binding.entityCode);
    if (entries.has(id) || typeof binding.resolve !== "function") throw Error("ENTITY_PARENT_SCOPE_BINDING_INVALID");
    entries.set(id, binding.resolve);
  }
  return async (input: EntityCapabilityRequest) => {
    const resolve = entries.get(key(input.context.planeKey, input.entityCode));
    if (!resolve || !await options.read(input)) return false;
    const resources = await resolve(input);
    if (!resources?.length || resources.some(resource => !Object.keys(resource).length ||
        ("tenantId" in resource && resource.tenantId !== input.context.tenantId))) return false;
    return Object.freeze({ scopeResources: Object.freeze(resources.map(resource => Object.freeze({ ...resource }))) });
  };
}
