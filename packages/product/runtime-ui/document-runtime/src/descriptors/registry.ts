import type { EntityViewDescriptor } from "./types";

const registry = new Map<string, EntityViewDescriptor>();

/**
 * Register an entity view descriptor override.
 *
 * Only needed for entities that require custom view config not derivable from
 * the compiled entity metadata (e.g. custom fact rails, party fields).
 * The generic edit runtime falls back to CompiledEntity metadata for all others.
 */
export function registerEntityDescriptor(descriptor: EntityViewDescriptor): void {
  registry.set(descriptor.entityCode, descriptor);
}

/**
 * Look up a registered descriptor override by entity code.
 * Returns null when no override has been registered.
 */
export function getEntityDescriptor(entityCode: string): EntityViewDescriptor | null {
  return registry.get(entityCode) ?? null;
}
