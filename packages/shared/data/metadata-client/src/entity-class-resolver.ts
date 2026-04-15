/**
 * @athyper/metadata-client — Entity Class Resolver
 *
 * Reads entity_class from compiled entity payload and determines
 * which rendering runtime handles it: /master/, /document/, /ledger/.
 *
 * The public URL key comes from entity_code in the entity registry,
 * NOT from schema.table names. This ensures URLs survive table renames.
 *
 * Unknown entity codes fail HERE — before any partial rendering.
 */
import {
  type CompiledEntity,
  type EntityClass,
  ENTITY_CLASS_TO_RUNTIME,
} from "@athyper/api-contracts/metadata";

export type RuntimeFamily = "master" | "document" | "ledger";

const CLASS_TO_FAMILY: Record<EntityClass, RuntimeFamily> = {
  REFERENCE: "master",
  MASTER: "master",
  CONTROL: "master",
  DOCUMENT: "document",
  DOCUMENT_RELATION: "document",
  LEDGER: "ledger",
  LOG: "ledger",
  AGGREGATE: "ledger",
  DIMENSION: "master",
  RELATION: "master",
};

/**
 * Resolve which runtime family handles a compiled entity.
 * Throws if the entity class is not recognized.
 */
export function resolveRuntimeFamily(entity: CompiledEntity): RuntimeFamily {
  const family = CLASS_TO_FAMILY[entity.entity_class];
  if (!family) {
    throw new Error(
      `Unknown entity_class "${entity.entity_class}" for entity "${entity.entity_code}". ` +
      `Cannot determine rendering runtime.`,
    );
  }
  return family;
}

/**
 * Get the route prefix for a compiled entity.
 */
export function resolveRoutePrefix(entity: CompiledEntity): string {
  return ENTITY_CLASS_TO_RUNTIME[entity.entity_class];
}

/**
 * Build the full route for an entity's list page.
 */
export function resolveListRoute(entity: CompiledEntity): string {
  return `${ENTITY_CLASS_TO_RUNTIME[entity.entity_class]}${entity.entity_code}`;
}

/**
 * Validate that an entity code exists and is resolvable.
 * Call this early in the route handler to fail fast on unknown codes.
 */
export function validateEntityCode(entity: CompiledEntity | null | undefined, entityCode: string): asserts entity is CompiledEntity {
  if (!entity) {
    throw new Error(
      `Entity "${entityCode}" not found in compiled metadata. ` +
      `Ensure it exists in control.entity and has been compiled to snapshot.entity_compiled.`,
    );
  }
}
