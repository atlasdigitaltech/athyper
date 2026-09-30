interface SessionScope {
  readonly plane?: string;
  readonly tenantId?: string;
  readonly principalId?: string;
  readonly authEpoch?: string | number;
}

/** Identity of one record view within one authenticated session. When it changes
 * (tenant, principal or auth epoch), loaded record data must be discarded. */
export function sessionScopeKey(
  scope: SessionScope | undefined,
  entityCode: string,
  recordId: string,
): string {
  return [
    scope?.plane,
    scope?.tenantId,
    scope?.principalId,
    scope?.authEpoch,
    entityCode,
    recordId,
  ].join(":");
}
