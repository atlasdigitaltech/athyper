import { isEntityRecordId } from "@athyper/contract-platform-entity-runtime";

/** True when `value` is a canonical record id; one shared rule for route, redirect and API. */
export function isEntityId(value: string): boolean {
  return isEntityRecordId(value);
}
