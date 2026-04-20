import "server-only";
import { resolveListConfig, resolvePresentationConfig, type ResolvedListConfig } from "@athyper/metadata-client/compiled-reader";
import type { EntityListPresentationConfig } from "@athyper/api-contracts/entity-list";
import { getCompiledEntity } from "./entity-meta";

export type { ResolvedListConfig };

/**
 * Fetch the list-view configuration for an entity.
 *
 * Returns column definitions, searchable fields, and default sort derived
 * from snapshot.entity_compiled. Returns null if the entity is unknown or
 * the session is absent.
 *
 * Internally reuses getCompiledEntity(), which is React-cached — calling
 * both getListConfig() and getCompiledEntity() for the same entity in one
 * render tree costs one network round-trip.
 */
export async function getListConfig(entityCode: string): Promise<ResolvedListConfig | null> {
  const entity = await getCompiledEntity(entityCode);
  if (!entity) return null;
  return resolveListConfig(entity);
}

/**
 * Fetch the full presentation config (columns with formatters, sort, page size)
 * for use in list pages that drive EntityListPresentationConfig consumers.
 */
export async function getListPresentationConfig(entityCode: string): Promise<EntityListPresentationConfig | null> {
  const entity = await getCompiledEntity(entityCode);
  if (!entity) return null;
  return resolvePresentationConfig(entity);
}
