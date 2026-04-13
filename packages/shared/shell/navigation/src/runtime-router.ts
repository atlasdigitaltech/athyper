/**
 * @athyper/navigation — Runtime Router
 *
 * Maps entity_class to the correct route prefix: /master/, /document/, /ledger/.
 * Uses ENTITY_CLASS_TO_RUNTIME from api-contracts as the single source of truth.
 */
import { ENTITY_CLASS_TO_RUNTIME, type EntityClass } from "@athyper/api-contracts/metadata";

export function getRuntimePrefix(entityClass: EntityClass): "/master/" | "/document/" | "/ledger/" {
  return ENTITY_CLASS_TO_RUNTIME[entityClass];
}

export function buildEntityRoute(entityClass: EntityClass, entityCode: string): string {
  return `${getRuntimePrefix(entityClass)}${entityCode}`;
}

export function buildDetailRoute(entityClass: EntityClass, entityCode: string, recordId: string): string {
  return `${getRuntimePrefix(entityClass)}${entityCode}/${recordId}`;
}
