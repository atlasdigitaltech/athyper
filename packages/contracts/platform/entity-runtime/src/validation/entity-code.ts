/** Canonical native entity identity. Not an artifact key, permission, SQL name,
 * or a legacy namespaced subject identifier. Do not trim or case-fold identity. */
export const ENTITY_CODE_MIN_LENGTH = 2;
export const ENTITY_CODE_MAX_LENGTH = 63;
const entityCodePattern = /^[a-z][a-z0-9_]{1,62}$/;
export function isCanonicalEntityCode(value: unknown): value is string {
  return typeof value === "string" && entityCodePattern.test(value);
}
