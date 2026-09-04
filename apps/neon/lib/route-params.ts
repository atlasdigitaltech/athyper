const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `value` is a canonical UUID, the shape every governed record and request id takes. */
export function isEntityId(value: string): boolean {
  return UUID_PATTERN.test(value);
}
