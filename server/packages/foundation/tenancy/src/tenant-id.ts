const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

declare const tenantIdBrand: unique symbol;

/** Opaque branded UUID for tenant identifiers. */
export type TenantId = string & { readonly [tenantIdBrand]: void };

export function isTenantId(value: string): value is TenantId {
  return UUID_RE.test(value);
}

export function assertTenantId(value: string): asserts value is TenantId {
  if (!isTenantId(value)) {
    throw new Error(`assertTenantId: "${value}" is not a valid UUID`);
  }
}

export function coerceTenantId(value: string): TenantId {
  assertTenantId(value);
  return value;
}
