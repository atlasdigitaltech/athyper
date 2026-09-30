import {PublicationContractError} from './errors.js';

/** Scope is part of the signed payload, never inferred from the worker session. */
export function compiledPublicationTenant(
  publicationKey: string,
  payload: {readonly entityCode: string; readonly tenantId?: string},
): string | null {
  const tenant = payload.tenantId;
  if (tenant === undefined) {
    if (publicationKey.includes('.tenant.'))
      throw new PublicationContractError('ARTIFACT_COORDINATES_INVALID', 'Tenant publication requires signed tenant scope');
    return null;
  }
  if (typeof tenant !== 'string'
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(tenant)
    || publicationKey !== `metadata.compiled_entity.${payload.entityCode}.tenant.${tenant}`)
    throw new PublicationContractError('ARTIFACT_COORDINATES_INVALID', 'Compiled publication tenant scope does not match its key');
  return tenant;
}
