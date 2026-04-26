import type { EntityEditAdapter } from "./types";

const registry = new Map<string, EntityEditAdapter>();

/**
 * Register an entity edit adapter. Call once at app startup (e.g. root layout).
 * Subsequent calls with the same entityCode overwrite the previous registration.
 */
export function registerEntityEditAdapter(
  adapter: EntityEditAdapter,
): void {
  registry.set(adapter.entityCode, adapter);
}

/**
 * Look up the edit adapter for an entity.
 * Returns null when no adapter has been registered (Tier 1 — descriptor-driven
 * generic edit handles these entities without a custom adapter).
 */
export function getEntityEditAdapter(entityCode: string): EntityEditAdapter | null {
  return registry.get(entityCode) ?? null;
}
