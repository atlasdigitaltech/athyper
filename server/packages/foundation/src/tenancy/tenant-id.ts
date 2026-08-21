const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

declare const tenantIdBrand: unique symbol;
export type TenantId = string & { readonly [tenantIdBrand]: true };

export function isTenantId(value: string): value is TenantId {
  return UUID_PATTERN.test(value);
}

export function assertTenantId(value: string): asserts value is TenantId {
  if (!isTenantId(value)) throw new TypeError(`Invalid tenant ID: ${value}`);
}

export function toTenantId(value: string): TenantId {
  assertTenantId(value);
  return value;
}

export function requireTenantId(
  value: string | null | undefined,
  context?: string,
): TenantId {
  if (!value || !isTenantId(value)) {
    const suffix = context ? ` in ${context}` : "";
    throw new TypeError(`Missing or invalid tenant ID${suffix}`);
  }
  return value;
}
