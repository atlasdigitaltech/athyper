import type { EntityRuntimeResourceContext } from "@athyper/platform-entity-descriptor-client";

/** Scope coordinates are one tuple: never mix an explicit document/link scope with workspace defaults. */
export function resolveRecordResourceContext(
  explicit: EntityRuntimeResourceContext | undefined,
  defaults: EntityRuntimeResourceContext | undefined,
  hasExplicitScope: boolean,
): EntityRuntimeResourceContext | undefined {
  if (hasExplicitScope) return explicit;
  const merged = { ...defaults, ...explicit };
  return Object.keys(merged).length ? merged : undefined;
}
